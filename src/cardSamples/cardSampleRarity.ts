// Rarity colour reference for the card lab.
//
// Neither colour set the project already has is fit for this. The game's own
// units.json qmap gives tier 6 the same flat red as tier 5, so a Rainbow pet and
// a Red pet come out identical; the wiki cache does keep a fifth hue, but it
// belongs to the codex, and this module is deliberately sealed off from it. So
// the lab carries its own reference rather than borrowing or patching one.
//
// The key is the rarity TEXT - Blue, Purple, Gold, Red, Rainbow - because that
// is the only thing that actually tells the five tiers apart, and it is the
// vocabulary the game itself uses. The number the game stores for a stage is the
// tier id, so the text is recovered from it. That mapping was checked against
// the wiki cache rather than assumed: every stage the lab can render agrees, and
// the tier populations match exactly (10 Blue first forms against 10 quality-2
// stages).
//
// Each rarity is three stops rather than one flat colour so a backdrop can be a
// gradient instead of a wash. Only `mid` is ever read as a solid fill - it backs
// the quality chip, the evolution buttons, the trim and the focus ring - so it is
// the stop tuned for contrast, and `readableInk` still picks its ink. `hi` and
// `lo` only ever appear diluted into a panel, so they are free to be vivid.

export const RARITY_NAMES = ['Blue', 'Purple', 'Gold', 'Red', 'Rainbow'] as const

export type RarityName = (typeof RARITY_NAMES)[number]

export interface RarityPalette {
  /** The rarity text. Shown in the lab readout so a tier can be named. */
  readonly name: RarityName
  /** Lightest stop. Dilutes into the strong end of a panel gradient. */
  readonly hi: string
  /** Representative hue: quality chip, evolution buttons, trim, focus ring. */
  readonly mid: string
  /** Darkest stop. Dilutes into the weak end of a panel gradient. */
  readonly lo: string
}

export const RARITY_PALETTE: Record<RarityName, RarityPalette> = {
  // Blue is the common tier, so it is the least saturated of the five: a grid of
  // 65 Blue cards should not read as a wall of cyan.
  Blue: { name: 'Blue', hi: '#7fd8ff', mid: '#2f80e6', lo: '#123a7a' },

  // Purple leans magenta at the light end so it separates from Blue in a mixed
  // grid, where the two are otherwise neighbours on the wheel.
  Purple: { name: 'Purple', hi: '#cbaaff', mid: '#8b4fe8', lo: '#3c1c72' },

  // Gold is the one tier that has to look expensive, so it stays a true metal:
  // a warm pale highlight over a brass mid into a brown lo, never a flat yellow.
  Gold: { name: 'Gold', hi: '#ffecb0', mid: '#e8b23c', lo: '#7d4c12' },

  // Red darkens toward blood rather than toward black, which keeps it from
  // reading as "unlit" next to the two deep tiers above it.
  Red: { name: 'Red', hi: '#ff9585', mid: '#e01f2a', lo: '#6f0b16' },

  // Rainbow is the only tier whose gradient has to carry hues that are not
  // variations of one another. Cyan, magenta and gold in that order interpolate
  // through violet on the way down and through orange on the way up, so a single
  // panel gradient sweeps a spectrum instead of shading one colour. Any two stops
  // of a rainbow that share a hue would just be a gradient of something else.
  Rainbow: { name: 'Rainbow', hi: '#7ef0ff', mid: '#ff6ad5', lo: '#ffd66e' },
}

/** The tier id the game stores on an evolution stage is the rarity's own id. */
const RARITY_BY_QUALITY: Record<number, RarityName> = {
  2: 'Blue',
  3: 'Purple',
  4: 'Gold',
  5: 'Red',
  6: 'Rainbow',
}

/**
 * A stage with no tier in the table is treated as the entry tier. Nothing in the
 * game data produces one - quality 1 does not exist - but `getQuality` already
 * defaults a missing `q` to 2, so the two agree on what a gap means.
 */
export function rarityFor(quality: number): RarityName {
  return RARITY_BY_QUALITY[quality] ?? 'Blue'
}

export function rarityPalette(quality: number): RarityPalette {
  return RARITY_PALETTE[rarityFor(quality)]
}
