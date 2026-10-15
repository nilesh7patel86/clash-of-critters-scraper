import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDirectory = dirname(fileURLToPath(import.meta.url))
const gameDataDirectory = resolve(rootDirectory, 'public', 'app-cache', 'data')

// The game tables are a static dump, so they are read at config time and baked
// into the bundle: a consumer never waits on a 1.6MB request to render the
// roster. The wiki data is fetched at runtime instead, because it is refreshed
// by the scraper and a stale copy in the bundle would be the wrong trade.
async function readGameData(fileName: string): Promise<unknown> {
  const filePath = resolve(gameDataDirectory, fileName)
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`Missing or invalid cached ${fileName}. Run npm run scrape_app first.`, { cause: error })
  }
}

export default defineConfig(async () => {
  const [units, trials] = await Promise.all([
    readGameData('units.json'),
    readGameData('trials.json'),
  ])

  // Single client source for pet/stage identity: stage names ship on each unit.
  const unitsData = units as { pets?: Record<string, any>[] }
  const petNames = (unitsData.pets ?? []).reduce(
    (acc: Record<string, { code: string; evos: Record<string, { en: string }> }>, pet: Record<string, any>) => {
      const evos: Record<string, { en: string }> = {}
      for (let stage = 0; stage < (pet.stages?.length ?? 0); stage++) {
        const name = pet.stages[stage]
        if (name) evos[String(stage + 1)] = { en: name }
      }
      acc[String(pet.id)] = { code: pet.name, evos }
      return acc
    },
    {},
  )

  return {
    plugins: [react()],
    // Two entry points: the roster SPA and the build-free reference viewer
    // (cards.html). Without them listed here the build emits only index.html, so
    // the page 404s from `vite preview` and any static host.
    build: {
      rollupOptions: {
        input: {
          main: resolve(rootDirectory, 'index.html'),
          cards: resolve(rootDirectory, 'cards.html'),
        },
      },
    },
    define: {
      __GAME_DATA__: JSON.stringify({ units, petNames, trials }),
    },
  }
})
