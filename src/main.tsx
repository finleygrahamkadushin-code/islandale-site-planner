import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './app/styles.css'
import { usePlanStore } from './store/planStore'
import { startAutosave } from './store/autosave'

// For end-to-end tests and debugging in the console.
declare global {
  interface Window {
    islandale: { store: typeof usePlanStore; camera?: () => number[]; renderInfo?: () => Record<string, unknown> }
  }
}
window.islandale = { store: usePlanStore }
startAutosave()

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Missing #root element')
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
