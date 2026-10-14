// Curated skill-icon overrides, keyed by evolution line.
//
// The wiki files a skill icon after the skill's own name, so one line's four
// stages can end up pointing at four different files even when they show the
// same picture. The override map (public/app-cache/overrides/skill-image-map.json)
// pins every line to a single icon. It is a hand-authored static override served
// beside the cache, so the app fetches it at load instead of bundling it, and a
// line the map does not cover keeps the wiki's own image.
//
// Values are "category/filename" references under the images root, the same
// shape the cache stores, so wikiImageUrl resolves them without a special case.
// Nothing here reads the file; it just turns the parsed JSON into a lookup.

export type SkillImageLookup = (line: string | null | undefined) => string | null

const NO_OVERRIDES: SkillImageLookup = () => null

/**
 * The part of `basePath` that sits under the images root:
 * "public/images/tatari-skills" -> "tatari-skills".
 */
function imagesReference(basePath: unknown): string {
  const normalized = String(typeof basePath === 'string' ? basePath : '').replace(/\\/g, '/')
  const at = normalized.indexOf('images/')
  return at >= 0 ? normalized.slice(at + 'images/'.length) : 'tatari-skills'
}

/**
 * Builds the line -> icon lookup from the raw override JSON. Anything missing or
 * malformed yields a lookup that always returns null, so the caller falls back to
 * the wiki's own image rather than failing to load the codex.
 */
export function skillImagesFrom(value: unknown): SkillImageLookup {
  if (!value || typeof value !== 'object') return NO_OVERRIDES
  const map = value as { basePath?: unknown; lines?: unknown }
  if (!map.lines || typeof map.lines !== 'object') return NO_OVERRIDES
  const base = imagesReference(map.basePath)
  const index = new Map<string, string>()
  for (const [line, files] of Object.entries(map.lines as Record<string, unknown>)) {
    const file = Array.isArray(files) ? files[0] : files
    if (line && typeof file === 'string' && file) index.set(line, `${base}/${file}`)
  }
  if (index.size === 0) return NO_OVERRIDES
  return (line) => (line ? index.get(line) ?? null : null)
}
