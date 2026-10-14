export type PageView = 'roster' | 'codex' | 'trials' | 'samples'

function viewHref(view: PageView): string {
  return view === 'roster' ? window.location.pathname : `?view=${view}`
}

interface SiteHeaderProps {
  theme: 'light' | 'dark'
  view: PageView
  onToggleTheme: () => void
  onNavigate: (view: PageView) => void
}

const LINKS: { view: PageView; label: string; hint: string }[] = [
  { view: 'roster', label: 'Roster', hint: 'Your owned Tatari, with stars, evolution and badge maths' },
  { view: 'codex', label: 'Codex', hint: 'Every documented Tatari, straight from the wiki cache' },
  { view: 'trials', label: 'Trials', hint: 'Every evolution quest each Tatari asks for, from the game tables' },
  { view: 'samples', label: 'Card lab', hint: 'Layout samples for the roster card, side by side' },
]

// The build-free reference viewer that ships beside the SPA (cards.html). It is
// a separate document rather than a view the app can swap in itself, so this is
// a plain navigation. The href stays relative for the same reason the page does:
// it resolves under whatever base path the build is served from.
const VIEWER_LINKS: { href: string; label: string; hint: string }[] = [
  { href: 'cards.html', label: 'Reference', hint: 'Build-free Tatari reference viewer (cards.html)' },
]

export default function SiteHeader({ theme, view, onToggleTheme, onNavigate }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href={viewHref('roster')} aria-label="Tatari home"><span className="brand-mark">T</span><span>Tatari</span></a>
        <div className="header-nav">
          <nav className="site-nav" aria-label="Sections">
            {LINKS.map((link) => (
              <a
                key={link.view}
                className={`site-nav-link${view === link.view ? ' site-nav-link-active' : ''}`}
                href={viewHref(link.view)}
                title={link.hint}
                aria-current={view === link.view ? 'page' : undefined}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
                  event.preventDefault()
                  onNavigate(link.view)
                }}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <span className="site-nav-label" aria-hidden="true">Viewers</span>
          <nav className="site-nav" aria-label="Scraper viewers">
            {VIEWER_LINKS.map((link) => (
              <a key={link.href} className="site-nav-link" href={link.href} title={link.hint}>
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="header-actions">
          {view === 'roster' ? <span className="local-label">Local roster</span> : null}
          <button type="button" className="theme-toggle" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>{theme === 'dark' ? 'Light' : 'Dark'}</button>
        </div>
      </div>
    </header>
  )
}
