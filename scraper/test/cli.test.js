import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { parseCliArgs } from '../lib/cli.js'

// The spec shape the scrapers actually use: aliased booleans, a floored
// numeric, a string with an environment fallback, a root-resolved path.
const SPEC = {
  flags: {
    forcePages: ['--force-pages', '--force'],
    forceImages: ['--force-images', '--force'],
    skipImages: ['--skip-images'],
    help: ['--help', '-h'],
  },
  options: {
    delay: { flag: '--delay', number: true, min: 250, default: 1000 },
    limit: { flag: '--limit', number: true, default: 0 },
    userAgent: { flag: '--user-agent', default: 'default-agent' },
    outFile: { flag: '--out', default: 'data/tataris.json', resolve: '/root' },
  },
}

test('flags default to false and short aliases work', () => {
  const config = parseCliArgs([], SPEC)
  assert.equal(config.forcePages, false)
  assert.equal(config.forceImages, false)
  assert.equal(config.skipImages, false)
  assert.equal(config.help, false)
  assert.equal(parseCliArgs(['-h'], SPEC).help, true)
})

test('--force sets both force flags it aliases', () => {
  const config = parseCliArgs(['--force'], SPEC)
  assert.equal(config.forcePages, true)
  assert.equal(config.forceImages, true)
})

test('numeric options take the value after their flag', () => {
  assert.equal(parseCliArgs(['--limit', '5'], SPEC).limit, 5)
})

test('a legitimate 0 is not swallowed by the default', () => {
  // The old `Number(value) || default` idiom made this unreachable.
  assert.equal(parseCliArgs(['--image-delay'], { options: { imageDelay: { flag: '--image-delay', number: true, default: 500 } } }).imageDelay, 500)
  assert.equal(parseCliArgs(['--image-delay', '0'], { options: { imageDelay: { flag: '--image-delay', number: true, default: 500 } } }).imageDelay, 0)
  assert.equal(parseCliArgs(['--limit', '0'], SPEC).limit, 0)
})

test('min clamps after coercion instead of falling back', () => {
  // --delay 0 on a scraper whose floor is 250ms gives the floor, not the default.
  assert.equal(parseCliArgs(['--delay', '0'], SPEC).delay, 250)
  assert.equal(parseCliArgs(['--delay', '100'], SPEC).delay, 250)
  assert.equal(parseCliArgs(['--delay', '400'], SPEC).delay, 400)
})

test('unparseable numbers fall back to the default', () => {
  assert.equal(parseCliArgs(['--delay', 'soon'], SPEC).delay, 1000)
  assert.equal(parseCliArgs(['--limit', 'abc'], SPEC).limit, 0)
})

test('a flag with no value takes the default', () => {
  assert.equal(parseCliArgs(['--delay'], SPEC).delay, 1000)
  assert.equal(parseCliArgs(['--out'], SPEC).outFile, path.resolve('/root', 'data/tataris.json'))
})

test('string options pass through and resolve is root-relative', () => {
  assert.equal(parseCliArgs(['--user-agent', 'me/1.0'], SPEC).userAgent, 'me/1.0')
  assert.equal(parseCliArgs([], SPEC).userAgent, 'default-agent')
  assert.equal(parseCliArgs(['--out', '/tmp/x.json'], SPEC).outFile, path.resolve('/tmp/x.json'))
})
