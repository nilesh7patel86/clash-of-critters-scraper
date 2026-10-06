import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  fileName,
  parseParams,
  plain,
  splitCells,
  splitChunks,
  splitTopLevel,
  squash,
  tableRows,
  templateBody,
  templateBodies,
  templateCall,
  templateParams,
} from '../lib/wikitext.js'

test('squash collapses runs of whitespace and trims', () => {
  assert.equal(squash('  a\n\tb   c  '), 'a b c')
})

test('templateCall returns the body and the index past the closing braces', () => {
  const call = templateCall('{{Infobox critter|image=X.png}} tail', 'Infobox critter')
  assert.equal(call.body, '|image=X.png')
  assert.equal(call.end, '{{Infobox critter|image=X.png}}'.length)
})

test('templateCall is null when the template is absent', () => {
  assert.equal(templateCall('no templates here', 'Infobox critter'), null)
})

test('templateCall survives an unterminated template', () => {
  assert.equal(templateCall('{{Infobox critter|image=X.png', 'Infobox critter'), null)
})

test('templateCall tracks brace depth so a nested template cannot close it early', () => {
  // The first `}}` on the page closes {{st|AoE}}, not the infobox.
  const text = '{{Infobox critter|skillTypes={{st|AoE}}|rarity=Gold}}'
  const call = templateCall(text, 'Infobox critter')
  assert.equal(call.body, '|skillTypes={{st|AoE}}|rarity=Gold')
  assert.equal(text.slice(call.end), '')
})

test('templateCall walks repeated calls via the end index', () => {
  const text = '{{Feedrow|a=1}} middle {{Feedrow|a=2}}'
  const first = templateCall(text, 'Feedrow')
  assert.equal(first.body, '|a=1')
  const second = templateCall(text, 'Feedrow', first.end)
  assert.equal(second.body, '|a=2')
  assert.equal(templateCall(text, 'Feedrow', second.end), null)
})

test('templateBody returns the first call or null', () => {
  assert.equal(templateBody('{{T|x=1}}{{T|x=2}}', 'T'), '|x=1')
  assert.equal(templateBody('nothing', 'T'), null)
})

test('templateBodies returns every call in order', () => {
  // The body starts after `{{Name`; text between calls is not part of either.
  assert.deepEqual(templateBodies('{{T|a=1}} {{T|a=2}}{{T|a=3}}', 'T'), ['|a=1', '|a=2', '|a=3'])
  assert.deepEqual(templateBodies('none at all', 'T'), [])
})

test('splitTopLevel splits at depth 0 and keeps the separators', () => {
  assert.deepEqual(splitTopLevel('a=b', '='), ['a', '=', 'b'])
  assert.deepEqual(splitTopLevel('plain', '='), ['plain'])
})

test('splitTopLevel ignores separators inside templates and tables', () => {
  // Only the top-level `=` splits; `c` continues the chunk after the closed
  // template because no separator separated them.
  assert.deepEqual(splitTopLevel('{{a=b}}c=d', '='), ['{{a=b}}c', '=', 'd'])
  assert.deepEqual(splitTopLevel('{|a=b|}c=d', '='), ['{|a=b|}c', '=', 'd'])
  assert.deepEqual(splitTopLevel('a={{x=y}}', '='), ['a', '=', '{{x=y}}'])
})

test('splitChunks keeps only the chunks', () => {
  assert.deepEqual(splitChunks('a|b|c', '|'), ['a', 'b', 'c'])
})

test('parseParams keys by lowercased, whitespace-collapsed name', () => {
  const params = parseParams('| Skill Name = Volt Bolt')
  assert.equal(params.get('skill name'), ' Volt Bolt')
  // Values keep the page's own spacing (only the first `=` is consumed);
  // callers run them through plain()/squash() when they want display text.
  assert.equal(squash(params.get('skill name')), 'Volt Bolt')
})

test('parseParams splits on the first = only', () => {
  const params = parseParams('|effect=a=b=c')
  assert.equal(params.get('effect'), 'a=b=c')
})

test('parseParams leaves a nested template with its pipes intact', () => {
  const params = parseParams('|a=1|desc={{x|y=z}}')
  assert.equal(params.get('a'), '1')
  assert.equal(params.get('desc'), '{{x|y=z}}')
})

test('parseParams skips arguments with no key', () => {
  const params = parseParams('||a=1')
  assert.deepEqual([...params.keys()], ['a'])
})

test('templateParams is null when the template is absent', () => {
  assert.equal(templateParams('nothing', 'Infobox critter'), null)
  assert.equal(templateParams('{{Infobox critter|rarity=Gold}}', 'Infobox critter').get('rarity'), 'Gold')
})

test('plain strips file links, keeps link text, and drops markup', () => {
  assert.equal(plain('[[File:Icon.png|100px]]'), '')
  assert.equal(plain('[[Firefox|Flametail]]'), 'Flametail')
  assert.equal(plain('[[Firefox]]'), 'Firefox')
  assert.equal(plain("'''Bold''' and ''italic''"), 'Bold and italic')
  assert.equal(plain('line one<br/>line two'), 'line one line two')
  assert.equal(plain('<span class="x">tagged</span>'), 'tagged')
  assert.equal(plain('  spaced   out  '), 'spaced out')
})

test('fileName reads the name out of a File link', () => {
  assert.equal(fileName('[[File:Some Name.png|100px]]'), 'Some Name.png')
  assert.equal(fileName('plain text'), null)
})

test('splitCells splits on pipe lines and appends continuation lines', () => {
  const row = '| first\n| second wrapped\nover two lines\n| third'
  assert.deepEqual(splitCells(row), [' first', ' second wrapped\nover two lines', ' third'])
})

test('splitCells excludes the row separator', () => {
  assert.deepEqual(splitCells('|-\n| only'), [' only'])
})

test('tableRows throws when the marker is missing', () => {
  assert.throws(() => tableRows('no table here', '!Star'), /marker not found/)
})

test('tableRows returns data rows and drops the header block', () => {
  const table = `{| class="wikitable"
!Star || Visual || Level
|-
| a || b || c
|-
| d || e || f
|}`
  assert.deepEqual(tableRows(table, '!Star').map((row) => row.trim()), ['| a || b || c', '| d || e || f'])
})

test('tableRows picks the table that contains the marker, not the first', () => {
  const two = `{| class="wikitable"
!Other || Header
|-
| wrong row
|}
{| class="wikitable"
!Star || Header
|-
| right row
|}`
  assert.deepEqual(tableRows(two, '!Star').map((row) => row.trim()), ['| right row'])
})

test('tableRows: an empty row between separators cannot leak a phantom cell', () => {
  const table = `{| class="wikitable"
!Star
|-
|-
| real
|}`
  const rows = tableRows(table, '!Star')
  assert.equal(rows.length, 1)
  // The leftover separator sits inside the row text, where splitCells already
  // excludes `|-` lines - so the row still parses as exactly one cell.
  assert.deepEqual(
    splitCells(rows[0]).map((cell) => cell.trim()),
    ['real'],
  )
})

test('tableRows walks back from a marker in the header to the opening brace', () => {
  const table = `text before
{| class="wikitable"
!Base Skill || Notes
|-
| Slash || notes
|}`
  assert.deepEqual(tableRows(table, '!Base Skill').map((row) => row.trim()), ['| Slash || notes'])
})
