import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { clearLegacyBrowserStorage } from './legacyStorageCleanup'

// Before anything renders: the app no longer uses browser storage, so the keys
// and the IndexedDB database left by older versions are removed rather than
// left to sit in the profile.
clearLegacyBrowserStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
