// Wiki artwork lookup.
//
// The roster draws its portraits from the wiki cache rather than the game's own
// pet icons: the wiki has both the normal and the Glitter (shiny) artwork, and
// its filenames are already the ones on disk under public/wiki-cache/img.
//
// This is the one piece of wiki data the roster needs, so only tataris.json is
// fetched and only the two filename columns are kept. The rest of the split set
// - zoboHorde.json for the evolution lines, reference.json for the vocabularies
// and feedingUpgrades.json for the food track - belongs to a detail view, and
// fetching it here would cost 96KB to render a grid of cards.

export const WIKI_TATARIS_URL = `${import.meta.env.BASE_URL}wiki-cache/data/tataris.json`

const WIKI_IMAGE_BASE = `${import.meta.env.BASE_URL}wiki-cache/img/`

export interface WikiStageArt {
  normal: string | null
  glitter: string | null
}

export function wikiImageUrl(filename: string | null | undefined): string | null {
  return filename ? `${WIKI_IMAGE_BASE}${encodeURIComponent(filename)}` : null
}

let stageArt: Map<string, WikiStageArt> | null = null
let pending: Promise<Map<string, WikiStageArt>> | null = null

export function loadWikiStageArt(): Promise<Map<string, WikiStageArt>> {
  if (stageArt) return Promise.resolve(stageArt)
  if (!pending) {
    pending = fetch(WIKI_TATARIS_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${WIKI_TATARIS_URL}`)
        return response.json()
      })
      .then((value: unknown) => {
        if (!Array.isArray(value)) throw new Error('wiki-cache/data/tataris.json is not a roster array')
        const map = new Map<string, WikiStageArt>()
        for (const row of value as { name?: unknown; normalImage?: unknown; glitterImage?: unknown }[]) {
          if (typeof row.name !== 'string' || !row.name) continue
          map.set(row.name, {
            normal: typeof row.normalImage === 'string' ? row.normalImage : null,
            glitter: typeof row.glitterImage === 'string' ? row.glitterImage : null,
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
