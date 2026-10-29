import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './app/styles.css'
import { usePlanStore } from './store/planStore'
import { activeAutosave, startAutosave } from './store/autosave'
import { CHANNEL_NAME, startTabLock } from './store/tabLock'
import { defaultHome, type PlanHome } from './store/planHome'
import { artifactDbHome, findArtifactDb, findArtifactDbLikely } from './store/artifactHome'
import { setRailDrawResolver } from './store/railResolver'
import { resolveRailDraws } from './scene/railSite'

// For end-to-end tests and debugging in the console.
declare global {
  interface Window {
    islandale: { store: typeof usePlanStore; camera?: () => number[]; renderInfo?: () => Record<string, unknown> }
  }
}
window.islandale = { store: usePlanStore }

// setRail's first per-edge write keeps what the scene draws, by the scene's own rail rules
setRailDrawResolver(resolveRailDraws)

// One editing tab at a time; decide that before autosave reads the plan.
const tabLock =
  'locks' in navigator && typeof BroadcastChannel !== 'undefined'
    ? startTabLock({ locks: navigator.locks, channel: new BroadcastChannel(CHANNEL_NAME), autosave: activeAutosave })
    : null
// The plan's home: the repo file under the dev server, the artifact's database when hosted on claude.ai.
async function findHome(): Promise<PlanHome | null> {
  const dev = defaultHome()
  if (dev) return dev
  const db = await findArtifactDb()
  return db ? artifactDbHome(db) : null
}
// On claude.ai finding the database can take a few seconds, and an edit made in that time would be
// replaced when the saved plan loads; the plan stays read-only until the home is known. Autosave
// itself treats any read-only reason as a read-only tab, so the flag is cleared before it starts.
const store = usePlanStore.getState()
if (findArtifactDbLikely() && store.readOnly === null) store.setReadOnly('opening')
void Promise.all([tabLock?.ready, findHome()]).then(([, home]) => {
  if (usePlanStore.getState().readOnly === 'opening') usePlanStore.getState().setReadOnly(null)
  startAutosave({ home })
})

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Missing #root element')
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
