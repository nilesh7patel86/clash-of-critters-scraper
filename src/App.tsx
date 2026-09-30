import { useCallback, useEffect, useState } from 'react'
import CardSamplesPage from './cardSamples/CardSamplesPage'
import CodexPage from './CodexPage'
import RosterPage from './RosterPage'
import SiteHeader from './SiteHeader'
import type { PageView } from './SiteHeader'
import './RosterPage.css'

type Theme = 'light' | 'dark'

const VIEW_PARAM = 'view'

function themeFromDocument(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

const VIEWS: PageView[] = ['roster', 'codex', 'samples']

function viewFromLocation(): PageView {
  if (typeof window === 'undefined') return 'roster'
  const requested = new URLSearchParams(window.location.search).get(VIEW_PARAM)
  return VIEWS.includes(requested as PageView) ? (requested as PageView) : 'roster'
}

function pushView(view: PageView) {
  try {
    const url = new URL(window.location.href)
    if (view === 'roster') url.searchParams.delete(VIEW_PARAM)
    else url.searchParams.set(VIEW_PARAM, view)
    window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`)
  } catch {
    // Without history support the page still switches; only the URL is stale.
  }
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(themeFromDocument)
  const [view, setView] = useState<PageView>(viewFromLocation)

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }, [theme])

  useEffect(() => {
    const onPop = () => setView(viewFromLocation())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const handleTheme = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark'
      try {
        window.localStorage.setItem('tt_theme', next)
      } catch {
        // A blocked store only costs the preference, not the toggle.
      }
      return next
    })
  }, [])

  const handleNavigate = useCallback((next: PageView) => {
    pushView(next)
    setView(next)
    window.scrollTo({ top: 0 })
  }, [])

  if (view === 'codex') return <CodexPage theme={theme} onToggleTheme={handleTheme} onNavigate={handleNavigate} />

  if (view === 'samples') {
    return <CardSamplesPage header={<SiteHeader theme={theme} view="samples" onToggleTheme={handleTheme} onNavigate={handleNavigate} />} />
  }

  return <RosterPage header={<SiteHeader theme={theme} view="roster" onToggleTheme={handleTheme} onNavigate={handleNavigate} />} />
}
