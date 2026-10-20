// One-time cleanup for the browser storage earlier versions of this app used.
//
// Nothing reads or writes localStorage, sessionStorage or IndexedDB any more,
// so anything already sitting in them is dead weight that only a manual "clear
// site data" would ever remove. This clears it instead: the legacy roster keys,
// the preference keys, and the IndexedDB database the roster was saved to.
//
// Deliberately idempotent rather than flagged - a "done" marker would itself
// have to live in storage, which is exactly what was removed. Every step checks
// first, so on a browser that never had the old data this costs nothing and
// leaves nothing behind.
const LEGACY_KEYS = [
  'tt_theme',
  'tt_sidebar',
  'tt_trials_filters',
  'tt_codex_filters',
  'tt_roster_card_style',
  'tt_roster_card_tint',
  'coc_roster',
  'coc_roster_ts',
]
const LEGACY_DB_NAME = 'coc_roster_db'

export function clearLegacyBrowserStorage(): void {
  if (typeof window === 'undefined') return

  try {
    for (const key of LEGACY_KEYS) {
      if (window.localStorage.getItem(key) !== null) window.localStorage.removeItem(key)
    }
  } catch {
    // Storage is blocked (private mode, quota): there is nothing to clear.
  }

  try {
    if (typeof indexedDB !== 'undefined') {
      const request = indexedDB.deleteDatabase(LEGACY_DB_NAME)
      // A database still open in another tab blocks the delete until that tab
      // closes; the handlers keep that from surfacing as an error, and the
      // deletion then completes on its own.
      request.onerror = () => {}
      request.onblocked = () => {}
    }
  } catch {
    // No IndexedDB at all: nothing was ever stored there.
  }
}
