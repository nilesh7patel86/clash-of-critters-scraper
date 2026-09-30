// Runs the two scrapers in order and merges their output.
//
//   node scraper/scrape_all.js [options]
//
// The wiki is the master source: it is scraped first, because it owns the
// roster, the family structure and all prose. The game data is scraped second
// and then used only to enrich the wiki's tataris.json - it never replaces a
// wiki value wholesale, and it never rewrites the vocabularies.
//
// Options are forwarded to the wiki scraper, so --force and --skip-images work
// as they do on their own. Add --no-fix-rarity to report rarity disagreements
// without correcting them.

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)

const log = (message) => console.log(`[${new Date().toISOString()}] [INFO]  ${message}`)

function run(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(HERE, script), ...args], {
      stdio: 'inherit',
      cwd: path.resolve(HERE, '..'),
    })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`))))
  })
}

async function main() {
  const forward = argv.filter((arg) => arg !== '--no-fix-rarity')
  const fixRarity = !argv.includes('--no-fix-rarity')

  // --out only renames the roster; the other three wiki files sit beside it, so
  // the enrichment has to be pointed at that directory too or it would rewrite
  // the default tataris.json while the wiki scraper wrote somewhere else.
  const outFlag = forward.indexOf('--out')
  const outFile = outFlag >= 0 && forward[outFlag + 1]
    ? path.resolve(HERE, '..', forward[outFlag + 1])
    : undefined

  log('Step 1/3: scraping the wiki (master source)')
  await run('wiki_gg_scraper.js', forward)

  log('Step 2/3: scraping the game data (enrichment source)')
  await run('tatary_xyz_scraper.js', forward)

  log('Step 3/3: enriching the wiki roster from the game data')
  const { enrichWikiData } = await import('./tatary_enrichment.js')
  const report = await enrichWikiData({
    fixRarity,
    tatarisFile: outFile,
    dataDir: outFile && path.dirname(outFile),
  })
  if (!report) log('Enrichment skipped: no game cache to enrich from')
  log('Done.')
}

main().catch((error) => {
  console.log(`[${new Date().toISOString()}] [ERROR] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
