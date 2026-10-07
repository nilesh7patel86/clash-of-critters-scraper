import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gloss, hasCJK } from '../lib/zh_en.js'

test('hasCJK flags Chinese but not Latin, digits or ASCII punctuation', () => {
  assert.equal(hasCJK('灼烧'), true)
  assert.equal(hasCJK('Unlocks at level 3'), false)
  assert.equal(hasCJK('2026-07-04'), false)
  assert.equal(hasCJK('Inter · face'), false)
})

test('English input passes through untouched', () => {
  const result = gloss('Damage coefficient')
  assert.equal(result.english, 'Damage coefficient')
  assert.deepEqual(result.residual, [])
  assert.equal(result.source, 'site')
})

test('full-string rules answer templated values', () => {
  assert.deepEqual(gloss('达到3级解锁'), { english: 'Unlocks at level 3', residual: [], source: 'rule' })
  assert.equal(gloss('每3次攻击后').english, 'After every 3 attacks')
  assert.equal(gloss('5个').english, '5')
  assert.equal(gloss('2秒').english, '2s')
})

test('the glossary resolves single phrases', () => {
  assert.deepEqual(gloss('灼烧'), { english: 'Burn', residual: [], source: 'gloss' })
  assert.equal(gloss('无法进行移动或攻击').english, 'Cannot move or attack')
})

test('longest key wins so a bracketed label is one phrase', () => {
  // '「灼烧」概率' must not resolve as the shorter '灼烧' + '概率'.
  assert.equal(gloss('「灼烧」概率').english, 'Burn chance')
  assert.equal(gloss('「灼烧」伤害系数').english, 'Burn damage coefficient')
})

test('digit-led units resolve mid-sentence', () => {
  const result = gloss('发射5波扇形火球弹幕')
  assert.equal(result.source, 'partial')
  assert.ok(result.english.includes('5 waves'))
})

test('parameter labels concatenated into a description still resolve', () => {
  // Frostluna's Water Aura note runs its parameter labels into the same text
  // node: the glossary key stops at 不生效, and the rest has to resolve
  // mid-string rather than as whole-field rules.
  const note = gloss(
    '持续治疗所有伙伴。其他元素伙伴的治疗效果为水元素伙伴的50%。「光环-水」可叠加以增强效果。在部分玩法中不生效目标0.5%生命初始治疗系数目标2.5%生命最大治疗系数',
  )
  assert.equal(note.residual.length, 0)
  assert.equal(
    note.english,
    'Continuously heals all allies. Other elements heal for 50% of the Water element’s bonus. Aura - Water stacks to strengthen the effect. Not applied in some game modes. Target 0.5% HP Initial healing coefficient Target 2.5% HP Max healing coefficient',
  )
  // The standalone full-value form still hits a whole-string rule.
  assert.deepEqual(gloss('目标0.5%生命'), {
    english: 'Target 0.5% HP',
    residual: [],
    source: 'rule',
  })
})

test('dates expand anywhere in the string', () => {
  assert.equal(gloss('2026年7月').english, 'July 2026')
  const title = gloss('Pocket Gamer 2026年7月综合强度榜')
  assert.equal(title.residual.length, 0)
  // Copied Latin text runs into a glossed phrase without a space of its own,
  // so the emission has to insert the separator (regression: fused output).
  assert.equal(title.english, 'Pocket Gamer July 2026 Overall Tier List')
})

test('punctuation survives without stray spaces', () => {
  assert.equal(gloss('持续受到伤害。').english, 'Takes damage over time.')
  assert.equal(gloss('受到伤害时优先消耗护盾值。').english, 'Shield is consumed first when taking damage.')
})

test('unresolved characters are reported instead of guessed', () => {
  const result = gloss('灼烧层数')
  assert.equal(result.source, 'partial')
  assert.equal(result.english, 'Burn 层数')
  assert.deepEqual(result.residual, ['层', '数'])
  // Residual is deduplicated across repeats.
  assert.deepEqual(gloss('层层数').residual, ['层', '数'])
})
