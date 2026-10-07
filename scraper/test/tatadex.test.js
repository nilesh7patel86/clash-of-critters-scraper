import assert from 'node:assert/strict'
import { test } from 'node:test'
import { flatImageNames, pageAssets, parseDetail, parseIndex, sitePath } from '../lib/tatadex.js'

// --- fixtures ---------------------------------------------------------------
//
// Stripped-down copies of the real markup, keeping every quirk the parsers
// depend on: chips nested inside same-tag spans, effect sections beside the
// <details> parameter block rather than inside it, the badge rendered inside
// the feeding <strong>, absolute breeding image URLs, and Chinese where the
// site only serves Chinese.

const INDEX = `
<aside class="data-verification">
  <div><dl>
    <div><dt>Version</dt><dd>TataDex Tatari dataset snapshot</dd></div>
    <div><dt>Last reviewed</dt><dd>2026-09-17</dd></div>
    <div><dt>Source</dt><dd><a href="/sources/">TataDex sources and verification</a></dd></div>
  </dl></div>
</aside>
<span data-result-count>2</span>
<article class="tatari-card" data-slug="emberling" data-element="fire" data-role="dps" data-stage="1">
  <a class="tatari-card__link" href="/tatari/emberling/">
    <span class="tatari-card__art element-fire"><img src="/assets/tatari/emberling.png" alt=""></span>
    <span class="tatari-card__meta">
      <strong data-card-name>Emberling</strong>
      <small data-card-subtitle>Tier 1</small>
      <span class="chip element-fire"><img src="/assets/elements/fire.webp" alt="">Fire</span>
      <span class="chip chip-role"><img src="/assets/roles/dps.png" alt="">DPS</span>
      <span class="stage">T1</span>
    </span>
  </a>
</article>
<article class="tatari-card" data-slug="blazebit" data-element="fire" data-role="tank" data-stage="2">
  <a class="tatari-card__link" href="/tatari/blazebit/">
    <span class="tatari-card__art element-fire"><img src="/assets/tatari/blazebit.png" alt=""></span>
    <span class="tatari-card__meta">
      <strong data-card-name>Blazebit</strong>
      <small data-card-subtitle>Tier 2</small>
      <span class="chip element-fire"><img src="/assets/elements/fire.webp" alt="">Fire</span>
      <span class="chip chip-role"><img src="/assets/roles/tank.webp" alt="">Tank</span>
      <span class="stage">T2</span>
    </span>
  </a>
</article>
`

const DETAIL = `
<article class="detail shell" data-tatari-live-page="emberling" data-tatari-updated-at="2026-10-01T11:16:54.437Z">
<header class="detail-summary">
  <div>
    <span class="eyebrow">Verified · 2026-07</span>
    <h1>Emberling</h1>
    <span class="chip element-fire"><span class="element-label"><img src="/assets/elements/fire.webp" alt=""><span>Fire</span></span></span>
    <span class="chip chip-role"><span class="role-label"><img src="/assets/roles/dps.png" alt=""><span>DPS</span></span></span>
    <span class="chip chip-stage">Tier 1</span>
    <span class="chip chip-rarity">Common</span>
  </div>
  <div class="tatari-summary__details"><p>Never blinks first.</p></div>
</header>
<section data-tatari-media>
  <img data-normal-art src="/assets/tatari/emberling.png" alt="">
  <img data-glitter-art src="" alt="">
</section>
<section class="detail-panel skill-panel">
  <div class="skill-item">
    <img src="/assets/tatari/skills/emberling.png" alt="">
    <strong>Fire Spit</strong>
    <p>Spits a small fireball.</p>
  </div>
  <section class="skill-section"><h3>Slow</h3><p>Reduces movement speed</p></section>
  <details class="skill-section__details skill-parameters">
    <summary>Parameters</summary>
    <section class="skill-section">
      <ul class="skill-values">
        <li><span>Damage coefficient</span><strong>65%</strong></li>
        <li><span>连发次数</span><strong>3</strong></li>
      </ul>
    </section>
    <section class="skill-section">
      <h3>Slow</h3>
      <ul class="skill-values">
        <li><span>持续时间</span><strong>3s</strong></li>
      </ul>
    </section>
  </details>
</section>
<section data-tatari-animations>
  <button class="animation-thumbnail" data-animation-src="" data-animation-label="Static"><img src="/assets/tatari/emberling.png" alt=""></button>
  <button class="animation-thumbnail" data-animation-src="/media/tatari/animations/emberling/full/work.webp" data-animation-label="Work"><img src="/media/tatari/animations/emberling/thumb/work.webp" alt=""></button>
</section>
<section class="detail-panel evolution-panel">
  <h2>Evolution line</h2>
  <ol class="evolution-chain">
    <li class="is-current"><a href="/tatari/emberling/"><img src="/assets/tatari/emberling.png" alt=""><small>Tier 1</small><strong>Emberling</strong></a></li>
    <li><a href="/tatari/blazebit/"><img src="/assets/tatari/blazebit.png" alt=""><small>Tier 2</small><strong>Blazebit</strong></a></li>
  </ol>
</section>
<section data-wild-related data-line="emberling">
  <a class="breeding-related__all" href="/breeding/?parentLineId=emberling&parentScope=either">View all</a>
  <a class="breeding-related__card" href="/breeding/abc/">
    <img src="https://tatadex.org/media/breeding/abc/stage-2.png" alt="">
    <span>Mother</span><strong>Ember Queen</strong><small>Blazebit</small>
  </a>
</section>
<section class="detail-panel">
  <h2>Next evolution requirements</h2>
  <ul><li>Reach 6 stars.</li></ul>
</section>
<section class="detail-panel">
  <h2>Compatible foods</h2>
  <div data-live-foods>
    <a href="/foods/cookies/"><img src="/assets/foods/cookies.png" alt=""><small>Cookies</small></a>
  </div>
</section>
<section data-horde-skill-panel data-line-id="emberling" data-lang="en">
  <article data-horde-level="3">
    <header><strong>Advance 1 · Lv 3</strong><small data-horde-unlock>达到3级解锁</small></header>
    <h3 data-horde-name>灼烧火球</h3>
    <p data-horde-description>攻击时有概率发射额外的灼烧火球</p>
    <section class="skill-section"><h3>灼烧</h3><p>持续受到伤害</p></section>
    <details class="skill-section__details skill-parameters">
      <summary>Parameters</summary>
      <section class="skill-section">
        <ul class="skill-values"><li><span>伤害系数</span><strong>20%</strong></li></ul>
      </section>
      <section class="skill-section">
        <h3>灼烧</h3>
        <ul class="skill-values"><li><span>「灼烧」概率</span><strong>25%</strong></li></ul>
      </section>
    </details>
  </article>
</section>
<section class="tatari-related">
  <section class="related-cluster">
    <h3>Tier references</h3>
    <a href="/tier-lists/overall-july-2026/">
      <span class="related-rank">B</span>
      <span><small>综合 · 2026-07-04</small><strong>Pocket Gamer 2026年7月综合强度榜</strong></span>
    </a>
  </section>
  <section class="related-cluster">
    <h3>Events and Badge Dojo</h3>
    <a href="/badge-dojo/fire/">
      <img src="/assets/badge-dojo/pet-badge-icon-fire.png" alt="">
      <span><small>Same-element Dojo</small><strong>Fire Dojo</strong></span>
    </a>
  </section>
</section>
<section class="detail-panel feeding-panel">
  <ol data-live-feeding>
    <li class="is-initial">
      <img src="/assets/tatari/stats/attack.png" alt="ATK">
      <strong><span class="grade-badge grade-d">D</span>ATK +5%</strong>
      <span class="star-requirement"><b>Initial</b></span>
    </li>
    <li>
      <img src="/assets/tatari/stats/hp.png" alt="HP">
      <strong><span class="grade-badge grade-e">E</span>HP +10%</strong>
      <span class="star-requirement"><b>3 ★</b></span>
    </li>
  </ol>
</section>
</article>
`

// --- sitePath / pageAssets --------------------------------------------------

test('sitePath keeps root paths and only same-host absolute URLs', () => {
  assert.equal(sitePath('/assets/tatari/sparkrow.png'), '/assets/tatari/sparkrow.png')
  // Breeding cards use absolute URLs to their own host.
  assert.equal(sitePath('https://tatadex.org/media/breeding/x/stage-2.png'), '/media/breeding/x/stage-2.png')
  assert.equal(sitePath('https://cdn.tatadex.org/a.png'), '/a.png')
  // External hosts are not ours to cache.
  assert.equal(sitePath('https://example.com/a.png'), null)
  // The absent Glitter art renders src="", and a bare relative path is not a URL.
  assert.equal(sitePath(''), null)
  assert.equal(sitePath(null), null)
  assert.equal(sitePath('assets/x.png'), null)
})

test('pageAssets sweeps src but skips the excluded panels and videos', () => {
  const html = `
    <img src="/assets/tatari/sparkrow.png" alt="">
    <script src="/assets/app.js"></script>
    <a href="https://example.com/x">external</a>
    <img data-glitter-art src="" alt="">
    <a class="breeding-related__card"><img src="https://tatadex.org/media/breeding/x/stage-2.png"></a>
    <section data-tatari-animations>
      <button data-animation-src="/media/tatari/animations/sparkrow/full/work.webp"><img src="/media/tatari/animations/sparkrow/thumb/work.webp"></button>
    </section>
    <section data-wild-related>
      <a><img src="/media/breeding/abc/stage-2.png"></a>
    </section>
    <section data-horde-skill-panel>
      <article><img src="/media/horde/sparkrow-3.png"></article>
    </section>
    <section class="skill-video-stage">
      <video src="/media/videos/sparkrow-skill.mp4"></video>
      <img src="/media/videos/sparkrow-poster.png">
    </section>
    <aside class="top-up-affiliate-card"><img src="/media/tatari/animations/sparkrow/thumb/idle.webp"></aside>
  `
  // Animation thumbs, Wild Tatari Dex, Horde advances and the video stage are
  // out of scope; scripts and mp4s fall out through the extension filter,
  // data-animation-src is never swept at all, and the animation media
  // directory stays excluded even where the top-up card reuses a thumb.
  assert.deepEqual(pageAssets(html), [
    '/assets/tatari/sparkrow.png',
    '/media/breeding/x/stage-2.png',
  ])
})

test('pageAssets skips the excluded panels on a realistic detail page', () => {
  // The animation thumb and the breeding card image exist only inside the
  // excluded panels; art, icons, foods and timeline stats stay in scope.
  assert.deepEqual(pageAssets(DETAIL), [
    '/assets/badge-dojo/pet-badge-icon-fire.png',
    '/assets/elements/fire.webp',
    '/assets/foods/cookies.png',
    '/assets/roles/dps.png',
    '/assets/tatari/blazebit.png',
    '/assets/tatari/emberling.png',
    '/assets/tatari/skills/emberling.png',
    '/assets/tatari/stats/attack.png',
    '/assets/tatari/stats/hp.png',
  ])
})

// --- flatImageNames ---------------------------------------------------------

test('flatImageNames keeps unique basenames and resolves the art/skill collision', () => {
  const skill = '/media/tatari/skillIcon/f37880df-45b6-4ddc-8964-2bf95f876545.png'
  const names = flatImageNames([
    '/assets/tatari/skills/sparkrow.png',
    '/assets/tatari/sparkrow.png',
    skill,
    '/assets/elements/fire.webp',
  ])
  // The card art is shallower than its skill icon, so it keeps the bare name
  // and the skill icon gains the colliding directory segment as a prefix.
  assert.equal(names.get('/assets/tatari/sparkrow.png'), 'sparkrow.png')
  assert.equal(names.get('/assets/tatari/skills/sparkrow.png'), 'skills-sparkrow.png')
  // Unique basenames - including the media library's UUID names - stay verbatim.
  assert.equal(names.get(skill), 'f37880df-45b6-4ddc-8964-2bf95f876545.png')
  assert.equal(names.get('/assets/elements/fire.webp'), 'fire.webp')
})

test('flatImageNames depends on the path set, not the order it arrives in', () => {
  const paths = [
    '/assets/tatari/skills/emberling.png',
    '/assets/tatari/emberling.png',
    '/assets/foods/cookies.png',
    '/media/tatari/image/4035a61a-9f8e-45da-ae92-b95332b937eb.png',
  ]
  const forward = flatImageNames(paths)
  const reverse = flatImageNames([...paths].reverse())
  assert.deepEqual([...forward.entries()].sort(), [...reverse.entries()].sort())
})

test('flatImageNames strips query strings and never emits two names that differ only in case', () => {
  // A Windows checkout holds one file for `Box.png` and `BOX.PNG`, so the
  // mapping has to treat them as one name - here: one collision group of four.
  const names = flatImageNames(['/box.png?a=1', '/box.png?a=2', '/assets/Box.png', '/other/BOX.PNG'])
  const emitted = [...names.values()].sort()
  assert.deepEqual(emitted, ['assets-Box.png', 'box-2.png', 'box.png', 'other-BOX.PNG'])
  assert.equal(new Set(emitted.map((name) => name.toLowerCase())).size, emitted.length)
  // The query-only twins end up apart even though they share a directory.
  assert.equal(names.get('/box.png?a=1'), 'box.png')
  assert.equal(names.get('/box.png?a=2'), 'box-2.png')
})

// --- parseIndex -------------------------------------------------------------

test('parseIndex reports the counter, provenance and every card', () => {
  const index = parseIndex(INDEX)
  assert.equal(index.reportedCount, 2)
  assert.equal(index.cards.length, 2)
  assert.deepEqual(index.verification, {
    Version: 'TataDex Tatari dataset snapshot',
    'Last reviewed': '2026-09-17',
    Source: 'TataDex sources and verification',
    'Source link': '/sources/',
  })
  assert.deepEqual(index.cards[0], {
    order: 0,
    slug: 'emberling',
    href: '/tatari/emberling/',
    name: 'Emberling',
    subtitle: 'Tier 1',
    art: '/assets/tatari/emberling.png',
    element: 'fire',
    elementLabel: 'Fire',
    elementIcon: '/assets/elements/fire.webp',
    role: 'dps',
    roleLabel: 'DPS',
    roleIcon: '/assets/roles/dps.png',
    tier: 1,
    tierLabel: 'T1',
    rarity: null,
  })
  assert.equal(index.cards[1].slug, 'blazebit')
  assert.equal(index.cards[1].tier, 2)
  assert.equal(index.cards[1].roleIcon, '/assets/roles/tank.webp')
})

test('parseIndex tolerates an index without the counter or aside', () => {
  const index = parseIndex('<p>nothing here</p>')
  assert.equal(index.reportedCount, null)
  assert.deepEqual(index.verification, {})
  assert.deepEqual(index.cards, [])
})

// --- parseDetail ------------------------------------------------------------

test('parseDetail extracts header, art and skill with glossed parameters', () => {
  const { record, unresolved } = parseDetail(DETAIL)
  assert.deepEqual(unresolved, [])
  assert.equal(record.slug, 'emberling')
  assert.equal(record.url, '/tatari/emberling/')
  assert.equal(record.updatedAt, '2026-10-01T11:16:54.437Z')
  assert.equal(record.verified, 'Verified · 2026-07')
  assert.equal(record.name, 'Emberling')
  assert.equal(record.description, 'Never blinks first.')
  assert.equal(record.element, 'fire')
  assert.equal(record.elementLabel, 'Fire')
  assert.equal(record.role, 'dps')
  assert.equal(record.tier, 1)
  assert.equal(record.tierLabel, 'Tier 1')
  assert.equal(record.rarity, 'Common')
  // The absent Glitter form is null, not an empty string.
  assert.deepEqual(record.art, { normal: '/assets/tatari/emberling.png', glitter: null })

  assert.equal(record.skill.icon, '/assets/tatari/skills/emberling.png')
  assert.equal(record.skill.name, 'Fire Spit')
  assert.equal(record.skill.description, 'Spits a small fireball.')
  // The first section inside <details> has no heading: base parameters.
  assert.deepEqual(record.skill.baseParameters, [
    { label: 'Damage coefficient', value: '65%' },
    { label: 'Burst count', labelZh: '连发次数', value: '3' },
  ])
  // The outside effect section keeps its own description; the matching
  // section inside <details> contributes the parameters.
  assert.equal(record.skill.effects.length, 1)
  assert.deepEqual(record.skill.effects[0], {
    name: 'Slow',
    description: 'Reduces movement speed',
    parameters: [{ label: 'Duration', labelZh: '持续时间', value: '3s' }],
  })
})

test('parseDetail reads evolution, requirements and foods, skipping the excluded panels', () => {
  const { record } = parseDetail(DETAIL)
  assert.deepEqual(record.evolutionLine, [
    { slug: 'emberling', url: '/tatari/emberling/', name: 'Emberling', tier: 1, art: '/assets/tatari/emberling.png', current: true },
    { slug: 'blazebit', url: '/tatari/blazebit/', name: 'Blazebit', tier: 2, art: '/assets/tatari/blazebit.png', current: false },
  ])
  assert.deepEqual(record.requirements, [{ text: 'Reach 6 stars.' }])
  assert.deepEqual(record.foods, [{ slug: 'cookies', url: '/foods/cookies/', icon: '/assets/foods/cookies.png', name: 'Cookies' }])
  // Animations, Wild Tatari Dex and Zobo Horde are out of scope: the fields
  // are not merely empty, they are never written.
  assert.equal('animations' in record, false)
  assert.equal('wildDex' in record, false)
  assert.equal('horde' in record, false)
})

test('parseDetail reads tier references, related links and the feeding timeline', () => {
  const { record, unresolved } = parseDetail(DETAIL)
  assert.deepEqual(unresolved, [])
  assert.deepEqual(record.tierReferences, [{
    url: '/tier-lists/overall-july-2026/',
    rank: 'B',
    category: 'Overall',
    date: '2026-07-04',
    title: 'Pocket Gamer July 2026 Overall Tier List',
    categoryZh: '综合',
    titleZh: 'Pocket Gamer 2026年7月综合强度榜',
  }])
  assert.deepEqual(record.related, [{
    cluster: 'Events and Badge Dojo',
    url: '/badge-dojo/fire/',
    icon: '/assets/badge-dojo/pet-badge-icon-fire.png',
    label: 'Same-element Dojo',
    title: 'Fire Dojo',
  }])
  // The badge renders inside the <strong>, so the grade prefix has to go.
  assert.deepEqual(record.feeding, [
    { stat: 'ATK', icon: '/assets/tatari/stats/attack.png', grade: 'D', initial: true, effect: 'ATK +5%', requirement: 'Initial' },
    { stat: 'HP', icon: '/assets/tatari/stats/hp.png', grade: 'E', initial: false, effect: 'HP +10%', requirement: '3 ★' },
  ])
})

test('parseDetail tolerates absent optional panels', () => {
  const minimal = '<article data-tatari-live-page="x" data-tatari-updated-at="t"><header class="detail-summary"><h1>X</h1></header></article>'
  const { record, unresolved } = parseDetail(minimal)
  assert.deepEqual(unresolved, [])
  assert.equal(record.slug, 'x')
  assert.equal(record.name, 'X')
  assert.deepEqual(record.evolutionLine, [])
  assert.deepEqual(record.foods, [])
  assert.deepEqual(record.feeding, [])
  // The excluded panels are never written, absent or not.
  assert.equal('animations' in record, false)
  assert.equal('wildDex' in record, false)
  assert.equal('horde' in record, false)
})
