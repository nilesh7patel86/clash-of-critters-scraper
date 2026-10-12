import assert from 'node:assert/strict'
import { test } from 'node:test'
import { imageCategory, imageNames, imageStems, inferNames, pageAssets, parseDetail, parseIndex, sitePath } from '../lib/tatadex.js'

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

// --- imageCategory / imageNames --------------------------------------------

test('imageCategory routes each kind of image to its directory', () => {
  // Plain card art: named files and the media library's UUID uploads alike.
  assert.equal(imageCategory('/assets/tatari/emberling.png'), 'tatari')
  assert.equal(imageCategory('/media/tatari/image/4035a61a-9f8e-45da-ae92-b95332b937eb.png'), 'tatari')
  // The sponsored top-up aside's watermarked thumb is page chrome, not art.
  assert.equal(imageCategory('/media/tatari/image/wm-v1/ea1ff553-590e-4903-8f29-82178f24f79c.webp'), 'icons')
  // The Glitter form pairs with it in its own directory.
  assert.equal(imageCategory('/assets/tatari/emberling-glitter.png'), 'tatari-glitter')
  assert.equal(imageCategory('/media/tatari/glitterImage/ff41ba57-e011-4332-a5e1-6a2b6d993a62.png'), 'tatari-glitter')
  // Skill icons, likewise named or UUID.
  assert.equal(imageCategory('/assets/tatari/skills/emberling.png'), 'skills')
  assert.equal(imageCategory('/media/tatari/skillIcon/f37880df-45b6-4ddc-8964-2bf95f876545.png'), 'skills')
  // Content thumbnails, then the page chrome.
  assert.equal(imageCategory('/assets/foods/cookies.png'), 'foods')
  assert.equal(imageCategory('/assets/events/horde.png'), 'events')
  assert.equal(imageCategory('/assets/elements/fire.webp'), 'icons')
  assert.equal(imageCategory('/assets/roles/dps.png'), 'icons')
  assert.equal(imageCategory('/assets/tatari/stats/attack.png'), 'icons')
  // The catch-all also catches what the rules do not know.
  assert.equal(imageCategory('/assets/brand/tatadex-wordmark.png'), 'icons')
  assert.equal(imageCategory('/assets/something-new/x.png'), 'icons')
})

test('imageNames keeps the bare basename and lets art and skill icons share it', () => {
  const names = imageNames([
    '/assets/tatari/skills/sparkrow.png',
    '/assets/tatari/sparkrow.png',
    '/assets/elements/fire.webp',
    '/media/tatari/image/4035a61a-9f8e-45da-ae92-b95332b937eb.png',
  ])
  // The two sparkrows share a basename but sit in different categories...
  assert.equal(names.get('/assets/tatari/sparkrow.png'), 'tatari/sparkrow.png')
  assert.equal(names.get('/assets/tatari/skills/sparkrow.png'), 'skills/sparkrow.png')
  // Unique basenames need no decoration, whatever their origin.
  assert.equal(names.get('/assets/elements/fire.webp'), 'icons/fire.webp')
  assert.equal(names.get('/media/tatari/image/4035a61a-9f8e-45da-ae92-b95332b937eb.png'), 'tatari/4035a61a-9f8e-45da-ae92-b95332b937eb.png')
})

test('imageNames resolves collisions inside one category without touching the others', () => {
  // elements and roles both become icons/; foods has its own directory.
  const names = imageNames(['/assets/roles/fire.png', '/assets/elements/fire.png', '/assets/foods/fire.png'])
  assert.equal(names.get('/assets/elements/fire.png'), 'icons/fire.png') // lexicographic winner
  assert.equal(names.get('/assets/roles/fire.png'), 'icons/roles-fire.png') // prefix from its directory
  assert.equal(names.get('/assets/foods/fire.png'), 'foods/fire.png') // no clash across categories
  // The result does not depend on the order the paths arrive in.
  const reversed = imageNames(['/assets/foods/fire.png', '/assets/roles/fire.png', '/assets/elements/fire.png'])
  assert.deepEqual([...names.entries()].sort(), [...reversed.entries()].sort())
})

test('imageNames strips query strings and never emits two names that differ only in case', () => {
  // A Windows checkout holds one file for `Box.png` and `BOX.PNG`, so a
  // category must treat them as one name - here: one collision group of four,
  // two of which differ by query alone.
  const names = imageNames(['/box.png?a=1', '/box.png?a=2', '/assets/Box.png', '/other/BOX.PNG'])
  assert.equal(names.get('/box.png?a=1'), 'icons/box.png')
  assert.equal(names.get('/box.png?a=2'), 'icons/box-2.png')
  assert.equal(names.get('/assets/Box.png'), 'icons/assets-Box.png')
  assert.equal(names.get('/other/BOX.PNG'), 'icons/other-BOX.PNG')
  const emitted = [...names.values()].map((name) => name.toLowerCase())
  assert.equal(new Set(emitted).size, emitted.length)
})

test('imageStems names every data-referenced path after its tatari, first claim winning', () => {
  const uuidArt = '/media/tatari/image/4035a61a-9f8e-45da-ae92-b95332b937eb.png'
  const uuidGlitter = '/media/tatari/glitterImage/ff41ba57-e011-4332-a5e1-6a2b6d993a62.png'
  const sharedIcon = '/media/tatari/skillIcon/f37880df-45b6-4ddc-8964-2bf95f876545.png'
  const line = [
    { slug: 'emberling', art: uuidArt, current: true },
    { slug: 'voltember', art: '/assets/tatari/voltember.png', current: false },
  ]
  const stems = imageStems(
    { tataris: [{ slug: 'emberling', art: uuidArt }, { slug: 'voltember', art: '/assets/tatari/voltember.png' }] },
    {
      // Records come in catalog order; both lines' members read the same art
      // and skill icon, so the first claim has to win on every path they share.
      emberling: {
        slug: 'emberling',
        art: { normal: uuidArt, glitter: '/assets/tatari/emberling-glitter.png' },
        skill: { icon: sharedIcon },
        evolutionLine: line,
      },
      voltember: {
        slug: 'voltember',
        art: { normal: '/assets/tatari/voltember.png', glitter: uuidGlitter },
        skill: { icon: sharedIcon },
        evolutionLine: line,
      },
    },
  )
  assert.equal(stems.get(uuidArt), 'emberling') // UUID art gets its slug
  assert.equal(stems.get('/assets/tatari/voltember.png'), 'voltember')
  assert.equal(stems.get('/assets/tatari/emberling-glitter.png'), 'emberling-glitter')
  assert.equal(stems.get(uuidGlitter), 'voltember-glitter') // -glitter suffix kept
  assert.equal(stems.get(sharedIcon), 'emberling') // shared icon: first claim
  // Paths no data field names get no stem; imageNames falls back to basename.
  assert.equal(stems.has('/media/tatari/image/wm-v1/ea1ff553-590e-4903-8f29-82178f24f79c.webp'), false)
})

test('imageNames applies data stems to UUID uploads and still resolves collisions', () => {
  const names = imageNames([
    '/media/tatari/image/4035a61a-9f8e-45da-ae92-b95332b937eb.png',
    '/media/tatari/glitterImage/ff41ba57-e011-4332-a5e1-6a2b6d993a62.png',
    '/assets/tatari/skills/emberling.png',
    '/media/tatari/image/wm-v1/ea1ff553-590e-4903-8f29-82178f24f79c.webp',
  ], new Map([
    ['/media/tatari/image/4035a61a-9f8e-45da-ae92-b95332b937eb.png', 'emberling'],
    ['/media/tatari/glitterImage/ff41ba57-e011-4332-a5e1-6a2b6d993a62.png', 'emberling-glitter'],
  ]))
  // UUID bytes take the stem the data gives them, extension untouched, and
  // land beside the named files rather than replacing them.
  assert.equal(names.get('/media/tatari/image/4035a61a-9f8e-45da-ae92-b95332b937eb.png'), 'tatari/emberling.png')
  assert.equal(names.get('/media/tatari/glitterImage/ff41ba57-e011-4332-a5e1-6a2b6d993a62.png'), 'tatari-glitter/emberling-glitter.png')
  assert.equal(names.get('/assets/tatari/skills/emberling.png'), 'skills/emberling.png')
  // A path no data field names keeps its own basename - the sponsored aside's
  // thumbs, whose category is icons.
  assert.equal(names.get('/media/tatari/image/wm-v1/ea1ff553-590e-4903-8f29-82178f24f79c.webp'), 'icons/ea1ff553-590e-4903-8f29-82178f24f79c.webp')
  // Two stems landing on one name inside a category fall back to the prefix.
  const clash = imageNames(
    ['/media/tatari/image/11111111-1111-4111-8111-111111111111.png', '/media/tatari/image/22222222-2222-4222-8222-222222222222.png'],
    new Map([
      ['/media/tatari/image/11111111-1111-4111-8111-111111111111.png', 'shared'],
      ['/media/tatari/image/22222222-2222-4222-8222-222222222222.png', 'shared'],
    ]),
  )
  assert.equal(clash.get('/media/tatari/image/11111111-1111-4111-8111-111111111111.png'), 'tatari/shared.png')
  assert.equal(clash.get('/media/tatari/image/22222222-2222-4222-8222-222222222222.png'), 'tatari/image-shared.png')
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

// --- inferNames -------------------------------------------------------------

// The wiki cache shape inferNames reads: named rows, and families whose members
// are in stage order.
const wikiCache = (names, families) => ({
  tataris: names.map((name) => ({ name })),
  families: families.map(([type, members]) => ({ name: members[0], type, members })),
})

const evolutionLine = (stages) => stages.map(([slug, name]) => ({ slug, name }))

test('inferNames names an unpublished stage through its named evolution line', () => {
  const line = evolutionLine([
    ['cactobud', 'Cactobud'],
    ['cactobloom', 'Cactobloom'],
    ['cactoczar', 'Cactoczar'],
    ['pet-43-4', ''],
  ])
  const records = {
    cactobud: { slug: 'cactobud', name: 'Cactobud', element: 'grass', evolutionLine: line },
    'pet-43-4': { slug: 'pet-43-4', name: '', element: 'grass', evolutionLine: line },
  }
  const cache = wikiCache(
    ['Cactobud', 'Cactobloom', 'Cactoczar', 'Cactobodhi'],
    [['Grass', ['Cactobud', 'Cactobloom', 'Cactoczar', 'Cactobodhi']]],
  )
  const { inferred, unresolved } = inferNames(records, cache)
  assert.equal(inferred.get('pet-43-4'), 'Cactobodhi')
  assert.deepEqual(unresolved, [])
})

test('inferNames names a fully unpublished line by family size and element', () => {
  const records = {
    momopo: { slug: 'momopo', name: 'Momopo', element: 'rock', evolutionLine: [] },
    'pet-69-1': { slug: 'pet-69-1', name: '', element: 'rock', evolutionLine: [] },
    'pet-69-2': { slug: 'pet-69-2', name: '', element: 'rock', evolutionLine: [] },
    'pet-69-3': { slug: 'pet-69-3', name: '', element: 'rock', evolutionLine: [] },
    'pet-69-4': { slug: 'pet-69-4', name: '', element: 'rock', evolutionLine: [] },
  }
  // Momopo's family has a claimed member, so only Popa is fully unclaimed.
  const cache = wikiCache(
    ['Popa', 'Popapouch', 'Popagrind', 'Popafam', 'Momopo', 'Lulupo', 'Lilypo', 'Gemmapo'],
    [
      ['Rock', ['Popa', 'Popapouch', 'Popagrind', 'Popafam']],
      ['Rock', ['Momopo', 'Lulupo', 'Lilypo', 'Gemmapo']],
    ],
  )
  const { inferred, unresolved } = inferNames(records, cache)
  assert.deepEqual([...inferred], [
    ['pet-69-1', 'Popa'],
    ['pet-69-2', 'Popapouch'],
    ['pet-69-3', 'Popagrind'],
    ['pet-69-4', 'Popafam'],
  ])
  assert.deepEqual(unresolved, [])
})

test('inferNames reports an unresolvable line instead of guessing', () => {
  const records = {
    'pet-9-1': { slug: 'pet-9-1', name: '', element: 'rock', evolutionLine: [] },
    'pet-9-2': { slug: 'pet-9-2', name: '', element: 'rock', evolutionLine: [] },
  }
  // Two same-size, same-element candidates: neither may be picked.
  const cache = wikiCache(
    ['A', 'B', 'C', 'D'],
    [['Rock', ['A', 'B']], ['Rock', ['C', 'D']]],
  )
  const { inferred, unresolved } = inferNames(records, cache)
  assert.equal(inferred.size, 0)
  assert.deepEqual(unresolved, ['pet-9-1', 'pet-9-2'])
})
