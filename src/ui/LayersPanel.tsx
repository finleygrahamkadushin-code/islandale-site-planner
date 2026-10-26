import { useShallow } from 'zustand/react/shallow'
import { usePlanStore } from '../store/planStore'
import { LAYER_IDS, LAYER_NAMES, layerOf } from '../store/types'

const LATER_LAYERS = ['Setbacks', 'Contours'] as const

/** Eye and padlock per category, shown when nothing is selected. */
export function LayersPanel() {
  const layers = usePlanStore((s) => s.layers)
  const setLayer = usePlanStore((s) => s.setLayer)
  const lockAll = usePlanStore((s) => s.lockAll)
  const showAll = usePlanStore((s) => s.showAll)
  const siteLocked = usePlanStore((s) => s.siteLocked)
  const hiddenIds = usePlanStore(useShallow((s) => s.plan.order.filter((id) => s.plan.objects[id].hidden)))
  const setHidden = usePlanStore((s) => s.setHidden)
  const counts = usePlanStore(
    useShallow((s) => {
      const c: Record<string, number> = {}
      for (const id of s.plan.order) {
        const l = layerOf(s.plan.objects[id])
        c[l] = (c[l] ?? 0) + 1
      }
      return c
    }),
  )
  const allLocked = LAYER_IDS.every((id) => layers[id].locked)

  return (
    <section className="panel layers" aria-label="Layers">
      <header>
        <strong>Layers</strong>
        <div className="actions">
          <button onClick={() => lockAll(!allLocked)}>{allLocked ? 'Unlock all' : 'Lock all'}</button>
          <button onClick={showAll}>Show all</button>
        </div>
      </header>
      <ul className="list">
        <li className="layer muted" title="The ground and the lot line cannot be moved">
          <span className="icon">👁</span>
          <span className="icon">{siteLocked ? '🔒' : '🔓'}</span>
          <span>Terrain and lot</span>
        </li>
        {LAYER_IDS.map((id) => (
          <li key={id} className="layer">
            <button
              className={`icon${layers[id].visible ? '' : ' off'}`}
              aria-label={`${layers[id].visible ? 'Hide' : 'Show'} ${LAYER_NAMES[id]}`}
              aria-pressed={!layers[id].visible}
              onClick={() => setLayer(id, { visible: !layers[id].visible })}
            >
              👁
            </button>
            <button
              className={`icon${layers[id].locked ? ' on' : ''}`}
              aria-label={`${layers[id].locked ? 'Unlock' : 'Lock'} ${LAYER_NAMES[id]}`}
              aria-pressed={layers[id].locked}
              onClick={() => setLayer(id, { locked: !layers[id].locked })}
            >
              {layers[id].locked ? '🔒' : '🔓'}
            </button>
            <span>{LAYER_NAMES[id]}</span>
            {id !== 'labels' && <span className="muted small count">{counts[id] ?? 0}</span>}
          </li>
        ))}
        {LATER_LAYERS.map((name) => (
          <li key={name} className="layer muted" title="Comes with the site rules in a later phase">
            <span className="icon">👁</span>
            <span className="icon">🔓</span>
            <span>{name}</span>
            <span className="small">later</span>
          </li>
        ))}
      </ul>
      {hiddenIds.length > 0 && (
        <div className="hidden-list">
          <span className="muted small">Hidden objects</span>
          {hiddenIds.map((id) => (
            <HiddenRow key={id} id={id} onShow={() => setHidden(id, false)} />
          ))}
        </div>
      )}
      <p className="muted small">Click an object to see its settings here.</p>
    </section>
  )
}

function HiddenRow({ id, onShow }: { readonly id: string; readonly onShow: () => void }) {
  const name = usePlanStore((s) => s.plan.objects[id]?.name ?? '')
  return (
    <div className="row">
      <span>{name}</span>
      <button onClick={onShow}>Show</button>
    </div>
  )
}
