import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './app/styles.css'
import { usePlanStore } from './store/planStore'

// For end-to-end tests and debugging in the console.
declare global {
  interface Window {
    islandale: { store: typeof usePlanStore }
  }
}
window.islandale = { store: usePlanStore }

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Missing #root element')
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
