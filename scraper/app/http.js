// Shared HTTP plumbing for the app scraper.
//
// One request gate paces every remote request start - API calls, page fetches
// and image downloads alike - so the whole pass is a good neighbour without
// each phase inventing its own sleep. The retry policy itself lives in
// scraper/lib/http.js; this module only supplies the per-source headers,
// status handling and response types, because api.php, tatary.xyz and
// tatadex.org answer differently.

import { createRequestGate, fetchWithRetry } from '../lib/http.js'
import {
  TATADEX_BASE, TATADEX_UA, TATARY_BASE, TATARY_UA,
  WIKI_API_URL, WIKI_UA,
} from './config.js'

const MAX_RETRIES = 2
const WIKI_RETRIES = 5
const TIMEOUT_MS = 60_000

/** The identifying User-Agent that matches a request's host. */
function userAgentFor(url) {
  if (url.includes('tatadex.org')) return TATADEX_UA
  if (url.includes('wiki.gg')) return WIKI_UA
  return TATARY_UA
}

export function createNet(config) {
  const gate = createRequestGate(config.delay, { jitter: 0.2 })

  /** One api.php call, paced behind the gate. */
  async function wikiApi(params) {
    const url = new URL(WIKI_API_URL)
    for (const [key, value] of Object.entries({ format: 'json', formatversion: '2', ...params })) {
      url.searchParams.set(key, value)
    }
    await gate()
    return fetchWithRetry(url, {
      responseType: 'json',
      retries: WIKI_RETRIES,
      backoffBaseMs: 2000,
      backoffMaxMs: 60_000,
      timeoutMs: TIMEOUT_MS,
      headers: { 'User-Agent': WIKI_UA },
      handleStatus: (response, target) => {
        if (response.status === 403) {
          return {
            error: new Error(
              `403 from ${target}. Cloudflare is challenging this client; check that the wiki User-Agent identifies the scraper rather than imitating a browser.`,
            ),
          }
        }
        return undefined
      },
    })
  }

  /** One tatary.xyz JSON table, honouring the site's `?v=` cache-buster. */
  async function tataryJson(fileName) {
    const url = `${TATARY_BASE}/${fileName.replace(/^\/+/, '')}?v=${config.tataryVersion}`
    return fetchWithRetry(url, {
      responseType: 'json',
      retries: MAX_RETRIES,
      backoffBaseMs: 500,
      backoffMaxMs: 60_000,
      timeoutMs: 30_000,
      headers: { Accept: '*/*', 'User-Agent': TATARY_UA },
      beforeAttempt: gate,
    })
  }

  /** One tatadex detail/index page; a 404 resolves to null for the caller. */
  async function tatadexPage(pathname) {
    return fetchWithRetry(`${TATADEX_BASE}${pathname}`, {
      responseType: 'text',
      retries: MAX_RETRIES,
      backoffBaseMs: 500,
      backoffMaxMs: 60_000,
      timeoutMs: 30_000,
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': TATADEX_UA },
      beforeAttempt: gate,
      handleStatus: (response) => (response.status === 404 ? { value: null } : undefined),
    })
  }

  /**
   * One image GET, whatever the host. Resolves to a Response so the caller can
   * check the content-type before reading the body - a Cloudflare interstitial
   * or an error page must never be written into the image tree.
   */
  async function fetchImage(url) {
    await gate()
    return fetchWithRetry(url, {
      responseType: 'response',
      retries: 2,
      backoffBaseMs: 1000,
      backoffMaxMs: 30_000,
      timeoutMs: 60_000,
      headers: { Accept: 'image/*,*/*', 'User-Agent': userAgentFor(url) },
      // A missing image is data (report it as missing), not a reason to fail
      // the run; 403 is left to throw because it means Cloudflare, not absence.
      handleStatus: (response) => (response.status === 404 ? { value: null } : undefined),
    })
  }

  return { gate, wikiApi, tataryJson, tatadexPage, fetchImage }
}
