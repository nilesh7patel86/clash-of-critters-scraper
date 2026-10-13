import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TATADEX_BASE } from '../app/config.js'
import {
  buildArtIndex, buildReference, buildZoboHorde, createPlan, fold, groupJobs, mergeRows, sanitize,
} from '../app/merge.js'

// --- fixtures ---------------------------------------------------------------
//
// A four-row wiki roster plus a tatadex lookup, chosen to exercise every branch
// of the precedence rules: a row with tatadex art and a wiki skill, a row whose
// skill must fall back to tatadex, a row with no tatadex record at all, and a
// row with no wiki portrait either.

function wikiFixture() {
  const row = (name, extra) => ({
    name,
    detailsPage: `https://wiki/${name}`,
    detailsTitle: name,
    type: 'Fire',
    rarity: 'Blue',
    role: 'DPS',
    skillText: '',
    counters: 'Water',
    counteredBy: 'Rock',
    initialStats: { attack: 'D', hp: 'D', defense: 'D' },
    feeding: [],
    ...extra,
  })
  return {
    tataris: [
      row('Emberling', {
        normalImage: 'Emberling.png',
        glitterImage: 'Glitter_Emberling.png',
        skill: { skillName: 'Ember Shot', skillDescription: '', skillTypes: [], skillImage: 'Ember_Shot.png' },
      }),
      row('Blazebit', {
        normalImage: 'Blazebit.png',
        glitterImage: null,
        skill: { skillName: 'Flame Wall', skillDescription: '', skillTypes: [], skillImage: null },
      }),
      row('Waterpup', { normalImage: 'Waterpup.png', glitterImage: null, skill: null }),
      row('Orphan', { normalImage: null, glitterImage: null, skill: null }),
    ],
    families: [],
    documentedFamilies: [],
    fileUrls: new Map([
      ['Emberling.png', 'https://wiki/img/Emberling.png'],
      ['Glitter_Emberling.png', 'https://wiki/img/Glitter_Emberling.png'],
      ['Blazebit.png', 'https://wiki/img/Blazebit.png'],
      ['Waterpup.png', 'https://wiki/img/Waterpup.png'],
      ['Ember_Shot.png', 'https://wiki/img/Ember_Shot.png'],
      ['Fire.png', 'https://wiki/img/Fire.png'],
      ['DPS.png', 'https://wiki/img/DPS.png'],
      ['Attack.png', 'https://wiki/img/Attack.png'],
      ['HP.png', 'https://wiki/img/HP.png'],
      ['Defense.png', 'https://wiki/img/Defense.png'],
    ]),
    referenceParts: {
      meta: { sourceUrl: 's', pageBase: 'p', imageBase: 'i', zoboHordeSource: 'z' },
      types: [{ name: 'Fire', image: 'Fire.png' }],
      roles: [{ name: 'DPS', image: 'DPS.png' }],
      statIcons: { attack: 'Attack.png', hp: 'HP.png', defense: 'Defense.png' },
    },
    counts: { detailsProcessed: 3, detailsFailed: 1 },
  }
}

const tatadexFixture = () => ({
  byName: new Map([
    [fold('Emberling'), { name: 'Emberling', art: { normal: '/assets/tatari/emberling.png', glitter: '/assets/tatari/emberling-glitter.png' }, skillIcon: '/assets/tatari/skills/emberling.png' }],
    [fold('Blazebit'), { name: 'Blazebit', art: { normal: '/assets/tatari/blazebit.png', glitter: null }, skillIcon: '/assets/tatari/skills/blazebit.png' }],
  ]),
})

/** A plan pre-loaded with the tatary icons the run always adds first. */
function planWithTataryAttributes() {
  const plan = createPlan()
  for (const stat of ['atk', 'def', 'hp']) {
    plan.add({ category: 'attributes', filename: `${stat}.png`, url: `https://tatary/img/attr/${stat}.png`, origin: 'tatary', sources: [`attribute:${stat}`] })
  }
  return plan
}

// --- plan -------------------------------------------------------------------

test('sanitize keeps a filename inside its category directory', () => {
  assert.equal(sanitize('../../etc/passwd'), '.._.._etc_passwd')
  assert.equal(sanitize('sub/dir/art.png'), 'sub_dir_art.png')
  assert.equal(sanitize('Volt Bolt.png'), 'Volt Bolt.png')
})

test('the plan dedupes by category/filename and keeps the first source', () => {
  const plan = createPlan()
  const first = plan.add({ category: 'tatari', filename: 'Emberling.png', url: 'a', origin: 'tatadex', sources: ['tatadex:Emberling'] })
  const second = plan.add({ category: 'tatari', filename: 'Emberling.png', url: 'b', origin: 'wiki', sources: ['wiki:Emberling'] })
  assert.equal(first, 'tatari/Emberling.png')
  assert.equal(second, 'tatari/Emberling.png')
  const jobs = plan.jobs()
  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].url, 'a')
  assert.deepEqual([...jobs[0].sources].sort(), ['tatadex:Emberling', 'wiki:Emberling'])
})

// --- merge precedence -------------------------------------------------------

test('Tatari portraits come from tatadex and are named after the row', () => {
  const plan = planWithTataryAttributes()
  const rows = mergeRows(wikiFixture(), tatadexFixture(), plan, wikiFixture().fileUrls, TATADEX_BASE)
  const emberling = rows.find((row) => row.name === 'Emberling')
  assert.equal(emberling.normalImage, 'tatari/Emberling.png')
  assert.equal(emberling.glitterImage, 'tatari-glitter/Emberling_glitter.png')

  const normalJob = plan.jobs().find((job) => job.category === 'tatari' && job.filename === 'Emberling.png')
  assert.equal(normalJob.origin, 'tatadex')
  assert.equal(normalJob.url, `${TATADEX_BASE}/assets/tatari/emberling.png`)
})

test('a row with no tatadex record falls back to the wiki portrait', () => {
  const plan = planWithTataryAttributes()
  const rows = mergeRows(wikiFixture(), tatadexFixture(), plan, wikiFixture().fileUrls, TATADEX_BASE)
  const waterpup = rows.find((row) => row.name === 'Waterpup')
  assert.equal(waterpup.normalImage, 'tatari/Waterpup.png')
  const job = plan.jobs().find((entry) => entry.filename === 'Waterpup.png')
  assert.equal(job.origin, 'wiki')
})

test('a row with no portrait at all keeps a null reference', () => {
  const plan = planWithTataryAttributes()
  const rows = mergeRows(wikiFixture(), tatadexFixture(), plan, wikiFixture().fileUrls, TATADEX_BASE)
  const orphan = rows.find((row) => row.name === 'Orphan')
  assert.equal(orphan.normalImage, null)
  assert.equal(orphan.skill, null)
})

test('skill icons prefer the wiki and fall back to tatadex', () => {
  const plan = planWithTataryAttributes()
  const rows = mergeRows(wikiFixture(), tatadexFixture(), plan, wikiFixture().fileUrls, TATADEX_BASE)
  const emberling = rows.find((row) => row.name === 'Emberling')
  const blazebit = rows.find((row) => row.name === 'Blazebit')
  // Wiki art exists -> wiki wins, even though tatadex has an icon.
  assert.equal(emberling.skill.skillImage, 'tatari-skills/Ember_Shot.png')
  assert.equal(plan.jobs().find((job) => job.filename === 'Ember_Shot.png').origin, 'wiki')
  // No wiki art -> the tatadex icon is used, named after the skill.
  assert.equal(blazebit.skill.skillImage, 'tatari-skills/Flame Wall.png')
  assert.equal(plan.jobs().find((job) => job.filename === 'Flame Wall.png').origin, 'tatadex')
})

test('the glitter fallback to the wiki survives when tatadex has none', () => {
  const wiki = wikiFixture()
  // Give Blazebit a wiki glitter; tatadex has none, so the wiki copy is kept.
  wiki.tataris[1].glitterImage = 'Glitter_Blazebit.png'
  wiki.fileUrls.set('Glitter_Blazebit.png', 'https://wiki/img/Glitter_Blazebit.png')
  const plan = planWithTataryAttributes()
  const rows = mergeRows(wiki, tatadexFixture(), plan, wiki.fileUrls, TATADEX_BASE)
  assert.equal(rows.find((row) => row.name === 'Blazebit').glitterImage, 'tatari-glitter/Glitter_Blazebit.png')
})

// --- reference / zobo / art index -------------------------------------------

test('element and role chips come from the wiki, stat chips from tatary', () => {
  const plan = planWithTataryAttributes()
  const reference = buildReference(wikiFixture(), plan, wikiFixture().fileUrls, 'now')
  assert.equal(reference.types[0].image, 'elements/Fire.png')
  assert.equal(reference.roles[0].image, 'roles/DPS.png')
  assert.deepEqual(reference.statIcons, { attack: 'attributes/atk.png', hp: 'attributes/hp.png', defense: 'attributes/def.png' })
})

test('stat chips fall back to the wiki when tatary has no attr icon', () => {
  const plan = createPlan()
  const reference = buildReference(wikiFixture(), plan, wikiFixture().fileUrls, 'now')
  assert.deepEqual(reference.statIcons, {
    attack: 'attributes/Attack.png',
    hp: 'attributes/HP.png',
    defense: 'attributes/Defense.png',
  })
})

test('zobo horde skills carry category-prefixed wiki images', () => {
  const plan = createPlan()
  const wiki = {
    families: [{ name: 'Emberling', type: 'Fire', members: ['Emberling'], skills: [{ level: 1, name: 'Puffy Blaze', description: 'x', image: 'Puffy_Blaze.png' }], notes: null, documented: true }],
    referenceParts: { meta: { zoboHordeSource: 'z' } },
  }
  wiki.fileUrls = new Map([['Puffy_Blaze.png', 'https://wiki/img/Puffy_Blaze.png']])
  const zobo = buildZoboHorde(wiki, plan, wiki.fileUrls)
  assert.equal(zobo.families[0].skills[0].image, 'tatari-skills/Puffy_Blaze.png')
  assert.equal(plan.jobs()[0].url, 'https://wiki/img/Puffy_Blaze.png')
})

test('the art index keeps only the two portrait columns', () => {
  const index = buildArtIndex([{ name: 'Emberling', normalImage: 'tatari/Emberling.png', glitterImage: 'tatari-glitter/Emberling_glitter.png' }, { name: 'Orphan', normalImage: null, glitterImage: null }], 'now')
  assert.deepEqual(index.rows, {
    Emberling: { normal: 'tatari/Emberling.png', glitter: 'tatari-glitter/Emberling_glitter.png' },
    Orphan: {},
  })
})

// --- grouping ---------------------------------------------------------------

test('groupJobs files each job under its category with a destination path', () => {
  const plan = createPlan()
  plan.add({ category: 'tatari', filename: 'Emberling.png', url: 'u', origin: 'tatadex', sources: [] })
  plan.add({ category: 'tatari', filename: 'Blazebit.png', url: 'u', origin: 'tatadex', sources: [] })
  plan.add({ category: 'grade', filename: 'grade_e.png', url: 'u', origin: 'tatary', sources: [] })
  const groups = groupJobs(plan.jobs(), 'C:/img')
  assert.equal(groups.get('tatari').jobs.length, 2)
  assert.equal(groups.get('grade').jobs.length, 1)
  assert.equal(groups.get('tatari').jobs[0].destination.replaceAll('\\', '/'), 'C:/img/tatari/Emberling.png')
})
