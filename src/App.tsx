import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import SiteHeader from './SiteHeader'
import type { PageView } from './SiteHeader'
import { useGlassSpecular } from './useGlassSpecular'

const CardSamplesPage = lazy(() => import('./cardSamples/CardSamplesPage'))
const CodexPage = lazy(() => import('./CodexPage'))
const RosterPage = lazy(() => import('./RosterPage'))
const TrialsPage = lazy(() => import('./TrialsPage'))
import './RosterPage.css'

type Theme = 'light' | 'dark'

const VIEW_PARAM = 'view'

function themeFromDocument(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

const VIEWS: PageView[] = ['roster', 'codex', 'trials', 'samples']

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

  useGlassSpecular()

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

  // The theme lives in component state and on the document element only: it is
  // re-derived from the OS preference on the next load, never written to
  // storage.
  const handleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  const handleNavigate = useCallback((next: PageView) => {
    pushView(next)
    setView(next)
    window.scrollTo({ top: 0 })
  }, [])

  const fallback = (
    <div className="route-fallback" role="status">
      <span className="route-fallback-chip">Loading…</span>
    </div>
  )

  if (view === 'codex') {
    return <Suspense fallback={fallback}><CodexPage theme={theme} onToggleTheme={handleTheme} onNavigate={handleNavigate} /></Suspense>
  }

  if (view === 'trials') {
    return <Suspense fallback={fallback}><TrialsPage theme={theme} onToggleTheme={handleTheme} onNavigate={handleNavigate} /></Suspense>
  }

  if (view === 'samples') {
    return <Suspense fallback={fallback}><CardSamplesPage header={<SiteHeader theme={theme} view="samples" onToggleTheme={handleTheme} onNavigate={handleNavigate} />} /></Suspense>
  }

  return <Suspense fallback={fallback}><RosterPage header={<SiteHeader theme={theme} view="roster" onToggleTheme={handleTheme} onNavigate={handleNavigate} />} /></Suspense>
}
