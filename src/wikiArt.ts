// App artwork lookup.
//
// The roster draws its portraits from the app cache rather than the game's own
// pet icons: the cache has both the normal and the Glitter (shiny) artwork, and
// its references ("tatari/Foo.png", "tatari-glitter/Foo_glitter.png") name the
// file and the category directory it sits in under public/images.
//
// The roster only ever needs the two reference columns, so it fetches
// artIndex.json - that slice and nothing else - rather than tataris.json, which
// carries skill text, feeding tracks and stat grades it never reads. The scraper
// writes both files on every run.

export const WIKI_ART_INDEX_URL = `${import.meta.env.BASE_URL}app-cache/data/artIndex.json`

const WIKI_IMAGE_BASE = `${import.meta.env.BASE_URL}images/`

export interface WikiStageArt {
  normal: string | null
  glitter: string | null
}

// A reference is "category/filename". Encode each segment so spaces and the
// like survive, but keep the slash that separates category from file.
export function wikiImageUrl(reference: string | null | undefined): string | null {
  if (!reference) return null
  return `${WIKI_IMAGE_BASE}${reference.split('/').map(encodeURIComponent).join('/')}`
}

let stageArt: Map<string, WikiStageArt> | null = null
let pending: Promise<Map<string, WikiStageArt>> | null = null

export function loadWikiStageArt(): Promise<Map<string, WikiStageArt>> {
  if (stageArt) return Promise.resolve(stageArt)
  if (!pending) {
    pending = fetch(WIKI_ART_INDEX_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${WIKI_ART_INDEX_URL}`)
        return response.json()
      })
      .then((value: unknown) => {
        const rows = (value as { rows?: unknown })?.rows
        if (!rows || typeof rows !== 'object') throw new Error('app-cache/data/artIndex.json has no rows map')
        const map = new Map<string, WikiStageArt>()
        for (const [name, entry] of Object.entries(rows as Record<string, unknown>)) {
          if (!name) continue
          const { normal, glitter } = (entry ?? {}) as { normal?: unknown; glitter?: unknown }
          map.set(name, {
            normal: typeof normal === 'string' ? normal : null,
            glitter: typeof glitter === 'string' ? glitter : null,
          })
        }
        stageArt = map
        return map
      })
      .catch((error: unknown) => {
        // A retry is worth allowing: a failed fetch leaves the page on the
        // game's own pet icons rather than no portrait at all.
        pending = null
        throw error
      })
  }
  return pending
}

export function wikiStageArt(name: string | null | undefined): WikiStageArt | null {
  if (!name || !stageArt) return null
  return stageArt.get(name) ?? null
}
