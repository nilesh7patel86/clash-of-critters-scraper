import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  blockByHeading, blocksByAttr, blocksByClass, decodeEntities, deepBlocks,
  findBlocks, firstBlockByAttr, firstBlockByClass, hasAttr, hasClass,
  headingText, hrefOf, innerHtml, labelValuePairs, openingTag, openingTags,
  stripTags, tagAttr, tagWithAttr, textByAttr,
} from '../lib/html.js'

test('decodeEntities resolves named and numeric entities in one pass', () => {
  assert.equal(decodeEntities('ATK &amp; DEF'), 'ATK & DEF')
  assert.equal(decodeEntities('&#39;quoted&#x27;'), "'quoted'")
  // One pass: the decoded '&' must not re-enter as part of a new entity.
  assert.equal(decodeEntities('&amp;#39;'), '&#39;')
  assert.equal(decodeEntities('no entities'), 'no entities')
})

test('stripTags drops script/style and separates adjacent elements', () => {
  assert.equal(stripTags('<p>Reach <strong>6 stars</strong>.</p>'), 'Reach 6 stars.')
  // Two adjacent elements must not fuse into one word.
  assert.equal(stripTags('<small>Tier 1</small><strong>Name</strong>'), 'Tier 1 Name')
  assert.equal(stripTags('<p>keep</p><script>var x = 1</script>'), 'keep')
  assert.equal(stripTags('&#8212;'), '—')
})

test('findBlocks returns outermost blocks only', () => {
  const html = '<section class="outer"><section class="inner">deep</section></section><section>next</section>'
  const blocks = findBlocks(html, 'section')
  assert.equal(blocks.length, 2)
  assert.ok(blocks[0].html.includes('class="inner"'))
  assert.ok(!blocks[0].html.startsWith('<section class="inner"'))
  assert.equal(blocks[1].html, '<section>next</section>')
})

test('findBlocks only counts its own tag, so a li cannot close its ul', () => {
  const html = '<ul><li>a</li><li>b<ul><li>b1</li></ul></li></ul>'
  assert.equal(findBlocks(html, 'ul').length, 1)
  // Outermost only: the nested li rides along inside its parent.
  assert.equal(findBlocks(html, 'li').length, 2)
  assert.equal(deepBlocks(html, 'li').length, 3)
})

test('findBlocks tolerates an unbalanced closing tag', () => {
  const blocks = findBlocks('stray</section><section>x</section>', 'section')
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].html, '<section>x</section>')
})

test('innerHtml strips the fragment wrapper', () => {
  assert.equal(innerHtml('<div class="a">content</div>'), 'content')
  assert.equal(innerHtml('<div>nested <div>inner</div></div>'), 'nested <div>inner</div>')
  // No opening tag: the input is already a slice.
  assert.equal(innerHtml('bare text'), 'bare text')
})

test('deepBlocks descends into nested same-tag blocks', () => {
  const html = '<section class="related"><section class="cluster">a</section><section class="cluster">b</section></section>'
  // Outermost only would see the wrapper and nothing inside it.
  assert.equal(findBlocks(html, 'section').length, 1)
  const deep = deepBlocks(html, 'section')
  assert.equal(deep.length, 3)
  assert.deepEqual(deep.map((block) => block.startsWith('<section class="cluster"')), [false, true, true])
})

test('openingTag and tagAttr read the first tag of a fragment', () => {
  const article = '<article class="detail" data-slug="sparkrow" data-empty="">x</article>'
  assert.equal(openingTag(article, 'article'), '<article class="detail" data-slug="sparkrow" data-empty="">')
  assert.equal(tagAttr(article, 'article', 'class'), 'detail')
  assert.equal(tagAttr(article, 'article', 'data-slug'), 'sparkrow')
  assert.equal(tagAttr(article, 'article', 'missing'), null)
  assert.equal(tagAttr(article, 'div', 'class'), null)
  assert.equal(tagAttr('<a title="A &amp; B">', 'a', 'title'), 'A & B')
  // A block fragment starts with its own tag, so the first match is its own;
  // for any other tag name the search reaches into the fragment's interior.
  assert.equal(tagAttr('<div data-x="1">', 'div', 'data-x'), '1')
  assert.equal(tagAttr('<div><img src="/x.png"></div>', 'img', 'src'), '/x.png')
})

test('openingTags and tagWithAttr find every tag and the first with an attribute', () => {
  const html = '<img src="/a.png"><img data-glitter-art src="/b.png"><img src="">'
  assert.equal(openingTags(html, 'img').length, 3)
  assert.equal(tagWithAttr(html, 'img', 'data-glitter-art'), '<img data-glitter-art src="/b.png">')
  assert.equal(tagWithAttr(html, 'img', 'data-none'), null)
})

test('hasAttr sees valueless flags as present', () => {
  assert.equal(hasAttr('<input disabled>', 'input', 'disabled'), true)
  assert.equal(hasAttr('<input disabled>', 'input', 'enable'), false)
  assert.equal(hasAttr('<section data-tatari-media>', 'section', 'data-tatari-media'), true)
  assert.equal(hasAttr('<section class="x">', 'section', 'data-tatari-media'), false)
})

test('hasClass matches whole class words only', () => {
  assert.equal(hasClass('<span class="chip element-fire">', 'span', 'chip'), true)
  assert.equal(hasClass('<span class="chip element-fire">', 'span', 'element-fire'), true)
  // 'fire' is a fragment of 'element-fire', not a class of its own.
  assert.equal(hasClass('<span class="chip element-fire">', 'span', 'fire'), false)
  assert.equal(hasClass('<span class="tatari-card">', 'span', 'chip'), false)
})

test('blocksByClass sees classes inside nested same-tag markup', () => {
  // The site's chips live inside a meta span of the same tag, so an
  // outermost-only scan would return nothing.
  const card = '<span class="tatari-card__meta"><span class="chip element-fire">Fire</span><span class="chip chip-role">DPS</span></span>'
  assert.equal(findBlocks(card, 'span').length, 1)
  const chips = blocksByClass(card, 'span', 'chip')
  assert.equal(chips.length, 2)
  assert.equal(firstBlockByClass(card, 'span', 'chip'), chips[0])
  assert.equal(firstBlockByClass(card, 'span', 'nope'), null)
})

test('blocksByAttr and textByAttr target the live regions', () => {
  const html = '<section>skip</section><section data-horde-skill-panel data-line-id="sparkrow">panel</section>'
  assert.equal(blocksByAttr(html, 'section', 'data-horde-skill-panel').length, 1)
  assert.equal(firstBlockByAttr(html, 'section', 'data-nope'), null)
  assert.equal(
    textByAttr('<h3 data-horde-name>灼烧</h3>', 'h3', 'data-horde-name'),
    '灼烧',
  )
  assert.equal(textByAttr('<p>plain</p>', 'p', 'data-x'), null)
})

test('headingText reads h2/h3 text and blockByHeading anchors on it', () => {
  const html = '<section class="panel"><h2>Evolution line</h2><section class="chain"><h3>Slow</h3></section></section>'
  assert.equal(headingText(html, 2), 'Evolution line')
  assert.equal(headingText(html, 3), 'Slow')
  assert.equal(headingText('<p>no heading</p>', 3), null)
  // The heading sits one section deep, so the outermost-only scan misses it.
  assert.equal(blockByHeading('<section><p>other</p></section>', 'Evolution line'), null)
  assert.ok(blockByHeading(html, 'Evolution line').includes('class="chain"'))
})

test('labelValuePairs reads span/strong pairs and skips other list items', () => {
  const html = '<ul><li><span>Damage coefficient</span><strong>65%</strong></li><li class="marker"><b>I</b></li></ul>'
  assert.deepEqual(labelValuePairs(html), [{ label: 'Damage coefficient', value: '65%' }])
  assert.deepEqual(labelValuePairs('<li>plain</li>'), [])
})

test('hrefOf reads the first anchor href', () => {
  assert.equal(hrefOf('<a class="x" href="/tatari/sparkrow/">go</a>'), '/tatari/sparkrow/')
  assert.equal(hrefOf('<p>no anchor</p>'), null)
})
