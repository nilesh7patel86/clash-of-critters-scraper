import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDirectory = dirname(fileURLToPath(import.meta.url))
const gameDataDirectory = resolve(rootDirectory, 'public', 'tatary-cache', 'data')

// The game tables are a static dump, so they are read at config time and baked
// into the bundle: a consumer never waits on a 1.6MB request to render the
// roster. The wiki data is fetched at runtime instead, because it is refreshed
// by the scraper and a stale copy in the bundle would be the wrong trade.
async function readGameData(fileName: string): Promise<unknown> {
  const filePath = resolve(gameDataDirectory, fileName)
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`Missing or invalid cached ${fileName}. Run npm run scrape_tatary first.`, { cause: error })
  }
}

export default defineConfig(async () => {
  const [units, petNames, trials] = await Promise.all([
    readGameData('units.json'),
    readGameData('pet_names.json'),
    readGameData('trials.json'),
  ])

  return {
    plugins: [react()],
    define: {
      __GAME_DATA__: JSON.stringify({ units, petNames, trials }),
    },
  }
})
