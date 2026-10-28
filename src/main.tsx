import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './app/styles.css'
import { usePlanStore } from './store/planStore'
import { activeAutosave, startAutosave } from './store/autosave'
import { CHANNEL_NAME, startTabLock } from './store/tabLock'

// For end-to-end tests and debugging in the console.
declare global {
  interface Window {
    islandale: { store: typeof usePlanStore; camera?: () => number[]; renderInfo?: () => Record<string, unknown> }
  }
}
window.islandale = { store: usePlanStore }

// One editing tab at a time; decide that before autosave reads the plan.
const tabLock =
  'locks' in navigator && typeof BroadcastChannel !== 'undefined'
    ? startTabLock({ locks: navigator.locks, channel: new BroadcastChannel(CHANNEL_NAME), autosave: activeAutosave })
    : null
void (tabLock?.ready ?? Promise.resolve()).then(() => startAutosave())

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Missing #root element')
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
