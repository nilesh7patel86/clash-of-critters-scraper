// Shared HTTP plumbing for the scrapers: paced request starts, Retry-After
// aware retries with exponential backoff, and one fetch wrapper.
//
// The three scrapers each grew their own retry loop and their own pacing, and
// they disagreed where it mattered: tatary retried every non-404 status (so a
// permanent 403 was requested five times), the wiki retried only 429/5xx, and
// one added a 2s buffer to Retry-After while the other did not. Per-scraper
// differences that are deliberate now live in the options below; the retry
// policy itself is one implementation.

import { sleep, warn } from './cli.js'

/**
 * A Retry-After header parsed into milliseconds, plus an optional safety
 * buffer. Handles both forms MediaWiki and Cloudflare emit - a delta in
 * seconds and an HTTP date - and returns null for absent or unparseable
 * values so the caller can fall back to its own backoff.
 */
export function retryAfterDelayMs(response, bufferMs = 0) {
  const raw = response?.headers?.get?.('retry-after')
  if (!raw) return null
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000 + bufferMs
  const at = Date.parse(raw)
  if (Number.isFinite(at)) return Math.max(0, at - Date.now()) + bufferMs
  return null
}

/** Exponential backoff for attempt N (0-based), capped. */
export const backoffDelayMs = (attempt, baseMs, maxMs) => Math.min(maxMs, baseMs * 2 ** attempt)

/**
 * Paces request *starts* by a minimum gap, without holding callers behind the
 * response: `await gate()` returns as soon as this request is allowed to
 * begin, so a worker pool stays concurrent while its requests remain spaced.
 *
 * The gap computation runs under a one-at-a-time lock so that concurrent
 * workers are assigned distinct slots instead of all observing the same
 * "next free" moment and setting off together. `jitter` randomises each gap by
 * up to the given fraction (the wiki scraper has always used 0.2) so a batch of
 * workers does not develop a metronome rhythm.
 */
export function createRequestGate(minGapMs, { jitter = 0 } = {}) {
  let nextStart = null
  let lock = Promise.resolve()
  return async function gate() {
    let release
    const previous = lock
    lock = new Promise((resolve) => {
      release = resolve
    })
    await previous
    const now = Date.now()
    const wait = nextStart === null ? 0 : Math.max(0, nextStart - now)
    nextStart = (nextStart === null ? now : Math.max(now, nextStart)) + minGapMs * (1 + Math.random() * jitter)
    release()
    if (wait > 0) await sleep(wait)
  }
}

/**
 * fetch with retries, backoff and per-scraper status handling.
 *
 *   responseType  'json' (default) | 'text' | 'arraybuffer' | 'response'
 *   retries       retries after the first attempt (default 4)
 *   beforeAttempt async (attempt) hook awaited before each request, including
 *                 retries - tatary paces every attempt through its gate, while
 *                 the wiki scraper relies on backoff alone after the first.
 *   handleStatus  (response, url) => { value } | { error } | undefined, called
 *                 for every non-ok response before the retry decision. Return
 *                 `{ value }` to resolve with it (an acceptable 404), `{ error }`
 *                 to throw it (the wiki's Cloudflare 403 explanation, or a 429
 *                 the operator asked to stop on), undefined to fall through to
 *                 the shared retry policy below.
 *
 * Retries cover transport failures, HTTP 429 (honouring Retry-After) and 5xx.
 * Anything else - a 403, a 404 for a file that is genuinely absent - fails
 * immediately: the response is an answer, not a hiccup, and repeating the
 * request changes neither.
 */
export async function fetchWithRetry(url, options = {}) {
  const {
    responseType = 'json',
    headers = {},
    retries = 4,
    backoffBaseMs = 500,
    backoffMaxMs = 60_000,
    retryAfterBufferMs = 0,
    timeoutMs = 30_000,
    beforeAttempt = null,
    handleStatus = null,
  } = options

  for (let attempt = 0; ; attempt += 1) {
    if (beforeAttempt) await beforeAttempt(attempt)
    let response
    try {
      response = await fetch(String(url), {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      // fetch only rejects for transport-level problems, which are always
      // worth another go.
      if (attempt < retries) {
        const backoff = backoffDelayMs(attempt, backoffBaseMs, backoffMaxMs)
        warn(`network error for ${url} - retry ${attempt + 1}/${retries} in ${backoff}ms (${error.message})`)
        await sleep(backoff)
        continue
      }
      throw error
    }

    if (response.ok) {
      if (responseType === 'response') return response
      if (responseType === 'text') return response.text()
      if (responseType === 'arraybuffer') return Buffer.from(await response.arrayBuffer())
      return response.json()
    }

    const status = response.status
    if (handleStatus) {
      const verdict = handleStatus(response, String(url))
      if (verdict) {
        if ('value' in verdict) return verdict.value
        throw verdict.error
      }
    }

    const retriable = status === 429 || status >= 500
    if (retriable && attempt < retries) {
      const retryAfter = status === 429 ? retryAfterDelayMs(response, retryAfterBufferMs) : null
      const backoff = retryAfter ?? backoffDelayMs(attempt, backoffBaseMs, backoffMaxMs)
      const source = retryAfter === null ? 'incremental backoff' : 'Retry-After'
      warn(`HTTP ${status} for ${url} - retry ${attempt + 1}/${retries} in ${backoff}ms (${source})`)
      await sleep(backoff)
      continue
    }
    throw new Error(`HTTP ${status} ${response.statusText} for ${url}`)
  }
}
