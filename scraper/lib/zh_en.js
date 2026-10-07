// Best-effort Simplified Chinese -> English for the strings tatadex.org only
// ships in Chinese.
//
// The site is bilingual by markup but not by content: skill parameter labels,
// Zobo Horde advance names/descriptions, effect notes and a handful of titles
// are rendered straight from the game's Chinese data, while the roster, lore,
// base skills and foods are English. Nobody reading this repo reads Chinese, so
// every scraped field is stored in English with the original kept alongside
// (`x` + `xZh`) whenever the two differ.
//
// This is a glossary scanner, not a translator. It does three things, in order:
//
//   1. full-string rules  - shapes the site's templated values ("达到3级解锁",
//                           "每次强化2格", "2026年7月") into English;
//   2. longest-match glossary scan - the same phrases repeat across all 240
//                           pages (effect notes, parameter labels), so a
//                           dictionary walk covers them, including phrases
//                           concatenated inside one text node;
//   3. nothing else       - whatever still has Chinese letters after the walk
//                           is reported back by the scraper as unresolved, so
//                           the glossary grows from evidence rather than guess
//                           work.
//
// Pure functions of their input: no network, no filesystem. See
// scraper/test/zh_en.test.js.

/** Anything in the CJK Unified Ideographs or CJK punctuation ranges. */
const CJK_RE = /[㐀-䶿一-鿿豈-﫿　-〿]/

export const hasCJK = (value) => CJK_RE.test(String(value))

/** Punctuation we pass through untouched - it is readable as-is, and treating
 *  it as untranslated would flood the report with "。" and "，". */
const PUNCTUATION = new Set(['。', '，', '、', '；', '：', '！', '？', '「', '」', '（', '）', '《', '》', '·', '…'])

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Whole-string rules, applied before the glossary scan. Each is a full match
 * (`^...$`) because these only ever appear as an entire field value: the site
 * templates them, so the shape is known and the numbers are the payload.
 */
const FULL_RULES = [
  { re: /^达到(\d+)级解锁$/, to: (m) => `Unlocks at level ${m[1]}` },
  { re: /^每(\d+)(?:次|\s*[Tt]imes?)攻击后$/, to: (m) => `After every ${m[1]} attacks` },
  { re: /^每次强化(.+)$/, to: (m) => `+${unitize(m[1])} per enhancement` },
  { re: /^目标(\d+(?:\.\d+)?)%生命$/, to: (m) => `Target ${m[1]}% HP` },
  { re: /^(\d+(?:\.\d+)?)%生命$/, to: (m) => `${m[1]}% HP` },
  { re: /^(\d+(?:\.\d+)?)\s*(?:个|枚)$/, to: (m) => m[1] },
  { re: /^(\d+(?:\.\d+)?)\s*秒$/, to: (m) => `${m[1]}s` },
  { re: /^(\d+(?:\.\d+)?)\s*格$/, to: (m) => `${m[1]} tiles` },
]

/** Unit suffixes embedded in a longer value ("2格" inside "每次强化2格"). */
function unitize(value) {
  return String(value)
    .replace(/^(\d+(?:\.\d+)?)\s*格$/, '$1 tiles')
    .replace(/^(\d+(?:\.\d+)?)\s*秒$/, '$1s')
    .replace(/^(\d+(?:\.\d+)?)\s*(?:个|枚)$/, '$1')
}

/**
 * Prefix rules for the glossary walk: digit-led units that turn up in the
 * middle of otherwise-English sentences ("发射5波扇形火球弹幕"). Sticky (`y`) so
 * the walk can test them at its current position without slicing.
 */
const SCAN_RULES = [
  { re: /(\d+(?:\.\d+)?)\s*个/y, to: (m) => m[1] },
  { re: /(\d+(?:\.\d+)?)\s*枚/y, to: (m) => m[1] },
  { re: /(\d+(?:\.\d+)?)\s*波/y, to: (m) => `${m[1]} waves` },
  { re: /(\d+(?:\.\d+)?)\s*次/y, to: (m) => `${m[1]} hits` },
  { re: /(\d+(?:\.\d+)?)\s*秒/y, to: (m) => `${m[1]}s` },
  { re: /(\d+(?:\.\d+)?)\s*格/y, to: (m) => `${m[1]} tiles` },
  // Parameter labels concatenated into a description text node - the site
  // inlines them ("...在部分玩法中不生效目标0.5%生命初始治疗系数"), so these
  // have to resolve mid-string, not only as whole values (which the FULL_RULES
  // above already cover).
  { re: /目标(\d+(?:\.\d+)?)\s*%生命/y, to: (m) => `Target ${m[1]}% HP` },
  { re: /(\d+(?:\.\d+)?)\s*%生命/y, to: (m) => `${m[1]}% HP` },
  { re: /每(\d+)(?:次|\s*[Tt]imes?)攻击后/y, to: (m) => `After every ${m[1]} attacks` },
]

/**
 * The glossary. Keys are Chinese phrases as they appear on the site, values are
 * the English used in the cached JSON. Ordering does not matter: the walk picks
 * the longest key that matches at its current position, so "「灼烧」概率"
 * resolves as one phrase rather than as "「灼烧」" + "概率".
 *
 * Entries come in four flavours:
 *
 *   effects     status/buff names, used bare, inside 「」 and as effect headings
 *   labels      skill parameter labels (most frequent category by far)
 *   notes       effect descriptions that repeat verbatim across pages
 *   titles      one-off page furniture (tier list titles, event labels)
 *
 * Horde advance names and descriptions are deliberately absent: those are
 * cross-referenced from the wiki's English Zobo Horde data by evolution line
 * and level (see tatadex_scraper.js), and anything the cross-reference misses
 * lands in the unresolved report instead of here.
 */
export const GLOSSARY = {
  // --- effects and buffs -------------------------------------------------
  灼烧: 'Burn',
  眩晕: 'Stun',
  减速: 'Slow',
  冰冻: 'Freeze',
  护盾: 'Shield',
  致盲: 'Blind',
  无敌: 'Invincible',
  禁锢: 'Immobilize',
  增伤: 'Damage UP',
  减伤: 'Damage reduction',
  攻击提升: 'Attack UP',
  生命提升: 'HP UP',
  危险: 'Danger',
  潮涌: 'Tide',
  沫歌: 'Foam Song',
  虹歌: 'Rainbow Song',
  浪歌: 'Wave Song',
  '光环-电': 'Aura - Electric',
  '光环-水': 'Aura - Water',
  '光环-岩': 'Aura - Rock',
  '潮涌-易伤': 'Tide - Vulnerable',
  '潮涌-降伤': 'Tide - Damage Reduction',
  '沫歌-易伤': 'Foam Song - Vulnerable',
  '沫歌-攻防提升': 'Foam Song - ATK & DEF UP',
  '虹歌-生命提升': 'Rainbow Song - HP UP',
  '浪歌-攻防提升': 'Wave Song - ATK & DEF UP',
  '铜头铁臂-减伤': 'Bronze Head - Damage Reduction',
  铜头铁臂: 'Bronze Head',

  // --- skill parameter labels -------------------------------------------
  连发次数: 'Burst count',
  连发间隔: 'Burst interval',
  休息时间: 'Rest time',
  触发概率: 'Trigger chance',
  概率: 'Chance',
  伤害系数: 'Damage coefficient',
  额外伤害系数: 'Bonus damage coefficient',
  持续时间: 'Duration',
  持续时间提升: 'Duration increase',
  治疗间隔: 'Healing interval',
  快速治疗间隔: 'Fast healing interval',
  快速持续时间: 'Haste duration',
  初始治疗系数: 'Initial healing coefficient',
  最大治疗系数: 'Max healing coefficient',
  治疗系数提升: 'Healing coefficient increase',
  伤害系数提升: 'Damage coefficient increase',
  提升比例提升: 'Buff ratio increase',
  可强化次数: 'Enhancement count',
  最大冷却: 'Max cooldown',
  最小冷却: 'Min cooldown',
  最大触发间隔: 'Max trigger interval',
  最小触发间隔: 'Min trigger interval',
  最大处罚间隔: 'Max penalty interval',
  最大层数: 'Max stacks',
  最大护盾值: 'Max Shield value',
  最大攻速提升: 'Max attack speed increase',
  初始攻速提升: 'Initial attack speed increase',
  最大减伤提升: 'Max damage reduction increase',
  初始减伤提升: 'Initial damage reduction increase',
  最大持续时间: 'Max duration',
  最大质量系数: 'Max mass coefficient',
  最大存活时间: 'Max lifetime',
  最大吸收目标数: 'Max absorb targets',
  最大治疗目标数: 'Max heal targets',
  继承生命比例: 'Inherited HP ratio',
  生命阈值: 'HP threshold',
  区域持续时间: 'Area duration',
  穿透数: 'Pierce count',
  延伸距离: 'Extension distance',
  分身数量: 'Clone count',
  火球数量: 'Fireball count',
  水球数量: 'Water orb count',
  冰锥数量: 'Ice shard count',
  小冰晶数量: 'Small ice shard count',
  小冰晶伤害系数: 'Small ice shard damage coefficient',
  小冰晶穿透数: 'Small ice shard pierce count',
  水母持续时间: 'Jellyfish duration',
  点燃伤害系数: 'Ignition damage coefficient',
  持续喷火伤害系数: 'Sustained flame damage coefficient',
  持续喷火伤害间隔: 'Sustained flame damage interval',
  持续喷火时间: 'Sustained flame duration',
  持续喷火频率: 'Sustained flame rate',
  '「灼烧」概率': 'Burn chance',
  '「灼烧」伤害系数': 'Burn damage coefficient',
  '「眩晕」概率': 'Stun chance',
  '「冰冻」概率': 'Freeze chance',
  '「减速」概率': 'Slow chance',
  '「禁锢」概率': 'Immobilize chance',
  '「致盲」概率': 'Blind chance',
  '「无敌」时间': 'Invincibility duration',
  竞技系数: 'PvP coefficient',

  // --- effect notes (repeat verbatim across pages) -----------------------
  持续受到伤害: 'Takes damage over time',
  '持续受到伤害。': 'Takes damage over time.',
  移动速度降低: 'Movement speed reduced',
  '移动速度降低。': 'Movement speed reduced.',
  无法进行移动或攻击: 'Cannot move or attack',
  '无法进行移动或攻击。': 'Cannot move or attack.',
  '无法进行移动。': 'Cannot move.',
  免疫伤害和控制效果: 'Immune to damage and control effects',
  '受到伤害后，生命将会低于10%': 'After taking damage, HP drops below 10%',
  '受到的伤害提升。': 'Damage taken increased.',
  '受到的伤害降低。': 'Damage taken reduced.',
  造成的伤害降低: 'Damage dealt reduced',
  '造成的伤害提升。': 'Damage dealt increased.',
  攻击无法造成伤害: 'Attacks deal no damage',
  '受到伤害时优先消耗护盾值。': 'Shield is consumed first when taking damage.',
  '受到伤害时优先消耗护盾值': 'Shield is consumed first when taking damage',
  '周期获得「护盾」。护盾消失时，根据护盾消耗量，恢复一定生命值':
    'Periodically gains a Shield. When the shield is consumed, restores HP based on how much was absorbed.',
  '攻击提升。提升数值基于目标的攻击。': 'Attack UP. The amount is based on the target’s Attack.',
  '生命提升。提升数值基于来源的生命。': 'HP UP. The amount is based on the source’s HP.',
  '攻击和防御提升。提升数值基于来源的攻击和防御。':
    'Attack and Defense UP. The amounts are based on the source’s Attack and Defense.',
  '可被攻击的单位。继承召唤者的攻击、防御和一定比例的生命':
    'Attackable unit. Inherits the summoner’s Attack, Defense and part of their HP.',
  '持续治疗所有伙伴。其他元素伙伴的治疗效果为水元素伙伴的50%。「光环-水」可叠加以增强效果。在部分玩法中不生效':
    'Continuously heals all allies. Other elements heal for 50% of the Water element’s bonus. Aura - Water stacks to strengthen the effect. Not applied in some game modes.',
  '持续治疗所有伙伴，其他元素伙伴的治疗效果为水元素伙伴的 50%。「光环-水」可叠加以增强效果，在部分玩法中不生效。':
    'Continuously heals all allies, other elements heal for 50% of the Water element’s bonus. Aura - Water stacks to strengthen the effect, not applied in some game modes.',
  '持续治疗所有伙伴，其他元素伙伴的治疗效果为水元素伙伴的50%。「光环-水」可叠加以增强效果，在部分玩法中不生效。':
    'Continuously heals all allies, other elements heal for 50% of the Water element’s bonus. Aura - Water stacks to strengthen the effect, not applied in some game modes.',
  '提升所有伙伴的攻速。其他元素伙伴的提升效果为电元素伙伴的50%。「光环-电」可叠加以增强效果。在部分玩法中不生效':
    'Increases all allies’ attack speed. Other elements get 50% of the Electric element’s bonus. Aura - Electric stacks to strengthen the effect. Not applied in some game modes.',
  '提升所有伙伴的减伤。其他元素伙伴的提升效果为岩元素伙伴的50%。「光环-岩」可叠加以增强效果。在部分玩法中不生效':
    'Increases all allies’ damage reduction. Other elements get 50% of the Rock element’s bonus. Aura - Rock stacks to strengthen the effect. Not applied in some game modes.',
  '当目标为其他塔塔时，技能伤害将在原始伤害基础上乘以「竞技系数」。不同技能的竞技系数各不相同':
    'When the target is another Tatari, skill damage is multiplied by the PvP coefficient on top of the base damage. Every skill has a different PvP coefficient.',

  // --- titles, labels and one-off furniture ------------------------------
  综合: 'Overall',
  综合强度榜: 'Overall Tier List',
  进化: 'Evolution',
  进化优先榜: 'Evolution Priority Tier List',
  '同元素道场': 'Same-element Dojo',
  简体中文: 'Simplified Chinese',
  繁體中文: 'Traditional Chinese',
}

// Longest key first: the walk has to try "「灼烧」伤害系数" before "「灼烧」"
// before "灼烧", otherwise a short key would win and leave the tail untranslated.
const KEYS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length)

/** 2026年7月 -> July 2026, anywhere it appears (tier list titles). */
function expandDates(text) {
  return text.replace(/(\d{4})年(\d{1,2})月/g, (_whole, year, month) => `${MONTHS[Number(month) - 1]} ${year}`)
}

/**
 * Gloss one string.
 *
 *   { english, residual, source }
 *
 * `source` is 'site' when there was no Chinese to begin with (nothing to do),
 * 'rule' when a full-string rule answered it, 'gloss' when the walk did, and
 * 'partial' when the walk left Chinese letters behind - in which case those
 * leftovers are returned in `residual` so the scraper can report them. Latin
 * text inside a Chinese string (the site mixes "每3 times攻击后") is preserved.
 */
export function gloss(value) {
  const text = String(value)
  if (!hasCJK(text)) return { english: text, residual: [], source: 'site' }

  const dated = expandDates(text)
  for (const rule of FULL_RULES) {
    const match = dated.match(rule.re)
    if (match) return { english: rule.to(match), residual: [], source: 'rule' }
  }

  let out = ''
  let index = 0
  const residual = []

  // Every emission gets a trailing space so the next emission (or a copied
  // character) stays separated, and a leading one when the text before it ends
  // mid-word - Chinese runs into Latin without a space of its own, so
  // "2026综合强度榜" would otherwise come out as "2026Overall Tier List".
  // Opening brackets do not take a space after them.
  const emit = (text) => {
    if (out !== '' && !/\s$/.test(out) && !/[（(「『“‘]$/.test(out)) out += ' '
    out += `${text} `
  }

  while (index < dated.length) {
    const rest = dated.slice(index)

    // 1. longest glossary key at this position
    const key = KEYS.find((candidate) => rest.startsWith(candidate))
    if (key) {
      emit(GLOSSARY[key])
      index += key.length
      continue
    }

    // 2. 「bracketed effect」 where only the inner term is glossed - the
    //    brackets are dropped because "Burn" already reads as the effect name.
    if (dated[index] === '「') {
      const close = dated.indexOf('」', index)
      if (close > index) {
        const inner = dated.slice(index + 1, close)
        const innerKey = KEYS.find((candidate) => inner === candidate)
        if (innerKey) {
          emit(GLOSSARY[innerKey])
          index = close + 1
          continue
        }
      }
    }

    // 3. digit-led units
    let matchedRule = null
    for (const rule of SCAN_RULES) {
      rule.re.lastIndex = 0
      const match = rule.re.exec(rest)
      if (match && match.index === 0) {
        matchedRule = rule.to(match)
        index += match[0].length
        break
      }
    }
    if (matchedRule !== null) {
      emit(matchedRule)
      continue
    }

    const char = dated[index]
    if (PUNCTUATION.has(char)) {
      out += char === '。' ? '. ' : char === '，' ? ', ' : char
    } else {
      out += char
      if (hasCJK(char)) residual.push(char)
    }
    index += 1
  }

  // The walk emits "English " for a glossed phrase and then the site's "。"
  // becomes ". ", which would leave "word . Word"; the same collapse puts a
  // space back before any punctuation that followed one.
  const english = out
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?…])/g, '$1')
    .trim()
  return { english, residual: [...new Set(residual)], source: residual.length ? 'partial' : 'gloss' }
}
