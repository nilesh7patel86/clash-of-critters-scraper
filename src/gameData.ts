export interface PetUnit {
  id: number
  name: string
  el: number
  q: number
  pos: number
  deploy: number
  career: number
}

export interface StarData {
  ac: number
  hc: number
  dc: number
  aa: number
  ha: number
  da: number
}

export interface EvolutionData {
  ag: number
  dg: number
  hg: number
  q?: number
  spd?: number
}

export interface FeedRank {
  name: string
  atk: number
  def: number
  hp: number
  rgb: string
  img: string
}

export interface FeedValue {
  a: number
  d: number
  h: number
}

export interface BadgeData {
  id: number
  el: number
  atk: number
  def: number
  hp: number
  q: number
  floor: number
  img: string
}

export interface CareerData {
  name: string
  img: string
}

export interface QualityData {
  grad: string[]
  color: string
}

export interface StarGeometry {
  l: number
  t: number
  w: number
  h: number
}

export interface GameDataPayload {
  units: UnitsData
  petNames: PetNamesData
  trials: TrialsData
}

export interface UnitsData {
  pets: PetUnit[]
  star: Record<string, StarData>
  lvl: Record<string, number[]>
  evo: Record<string, Record<string, EvolutionData>>
  feed: Record<string, Record<string, FeedValue>>
  maxstar: number
  maxfeed: number
  maxlvl: number
  peticons: Record<string, Record<string, string>>
  quality_img: Record<string, string>
  feedrank: FeedRank[]
  badges: BadgeData[]
  evorange: Record<string, number[]>
  maxlvl_real: number
  stargrade: number
  starmaxicon: number
  maxtrainer: number
  ulvl: Record<string, Record<string, number[]>>
  elidx: Record<string, number>
  maxprogress: number
  starsize: Record<string, number[]>
  starbg: Record<string, number[]>
  stargeo: Record<string, StarGeometry>
  careers: Record<string, CareerData>
  qmap: Record<string, QualityData>
  evostar: Record<string, Record<string, number>>
  evoquest: Record<string, Record<string, number[]>>
  [key: string]: unknown
}

export interface PetNameEntry {
  code: string
  evos: Record<string, Record<string, string>>
}

export type PetNamesData = Record<string, PetNameEntry>

export interface LocalizedText {
  en?: string
  [language: string]: unknown
}

export interface TrialStep {
  icon?: string
  [key: string]: unknown
}

export interface TrialQuest extends LocalizedText {
  icon?: string
  target?: number
  tips?: number[]
  feed?: boolean
  multi?: LocalizedText & { steps?: TrialStep[] }
}

export interface TrialTip extends LocalizedText {
  icon?: string
  st?: number
}

export interface TrialsData {
  quests: Record<string, TrialQuest>
  tips: Record<string, TrialTip>
}

declare const __GAME_DATA__: GameDataPayload

const payload = __GAME_DATA__
const emptyTrials: TrialsData = { quests: {}, tips: {} }

export const DATA: UnitsData = payload.units
export const PET_NAMES: PetNamesData = payload.petNames
export const TRIALS: TrialsData = payload.trials || emptyTrials
