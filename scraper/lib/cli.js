// Shared command-line plumbing for every scraper: logging, sleeping, and a
// declarative argument parser.
//
// Each scraper used to carry its own copy of these three, and the copies
// drifted - scrape_all.js printed an extra space after [INFO] while the other
// three did not, and the wiki scraper's `Number(value) || default` idiom made
// `--delay 0` silently unreachable where tatary handled zero correctly. One
// implementation, one behaviour.

import path from 'node:path'

/** `[<iso timestamp>] [INFO] message` */
export function log(message, level = 'INFO') {
  console.log(`[${new Date().toISOString()}] [${level}] ${message}`)
}

export function warn(message) {
  log(message, 'WARN')
}

export const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

/**
 * Parse `argv` against a declarative spec.
 *
 *   flags:   { key: ['--flag', ...aliases] }     -> boolean in the result
 *   options: { key: { flag, default, number?, min?, resolve? } }
 *
 * An option's value is the argument that follows `flag`, or `default` when the
 * flag is absent or has no value. `number` coerces with Number() and falls back
 * to the default for anything non-finite - `Number(value) || default` would
 * turn a legitimate `0` into the default, which is how `--delay 0` used to be
 * unreachable. `min` clamps after coercion, so `--delay 0` on a scraper whose
 * documented floor is 250ms gives 250 rather than the default. `resolve`
 * path-resolves strings against a root, so an output path lands in the same
 * place no matter which directory the scraper was started from.
 */
export function parseCliArgs(argv, { flags = {}, options = {} } = {}) {
  const present = new Set(argv)
  const result = {}

  for (const [key, names] of Object.entries(flags)) {
    result[key] = names.some((name) => present.has(name))
  }

  for (const [key, spec] of Object.entries(options)) {
    const index = argv.indexOf(spec.flag)
    const raw = index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : spec.default
    if (spec.number) {
      const parsed = Number(raw)
      let value = Number.isFinite(parsed) ? parsed : spec.default
      if (spec.min !== undefined) value = Math.max(spec.min, value)
      result[key] = value
    } else if (spec.resolve) {
      result[key] = path.resolve(spec.resolve, raw)
    } else {
      result[key] = raw
    }
  }

  return result
}
