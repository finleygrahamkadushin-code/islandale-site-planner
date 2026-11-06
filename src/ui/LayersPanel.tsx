import { useShallow } from 'zustand/react/shallow'
import { contoursShown, usePlanStore } from '../store/planStore'
import { LAYER_IDS, LAYER_NAMES, layerOf } from '../store/types'
import { Eye, EyeOff, Lock, LockOpen } from 'lucide-react'
import { useBeginner } from '../guide/mode'
import { Tip } from '../guide/Tip'
import { Term } from '../guide/Term'

const ICON = 15

/** Eye and padlock per category, shown when nothing is selected. */
export function LayersPanel() {
  const layers = usePlanStore((s) => s.layers)
  const setLayer = usePlanStore((s) => s.setLayer)
  const lockAll = usePlanStore((s) => s.lockAll)
  const showAll = usePlanStore((s) => s.showAll)
  const setbacksShown = usePlanStore((s) => s.setbacks.shown)
  const setSetbacks = usePlanStore((s) => s.setSetbacks)
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
  const contours = usePlanStore(contoursShown)
  const setContours = usePlanStore((s) => s.setContours)
  const beginner = useBeginner()

  return (
    <section className="panel layers" aria-label="Layers">
      <header>
        <strong>Layers</strong>
        <div className="actions">
          <button onClick={() => lockAll(!allLocked)} data-tour="lock-all" data-testid="lock-all">
            {allLocked ? 'Unlock all' : 'Lock all'}
          </button>
          <button onClick={showAll}>Show all</button>
        </div>
      </header>
      <ul className={`list${beginner ? ' no-locks' : ''}`}>
        <Tip label="The ground and the lot line cannot be moved">
          <li className="layer muted" tabIndex={0}>
            <span className="icon" aria-hidden="true">
              <Eye size={ICON} />
            </span>
            {!beginner && <span className="icon" aria-hidden="true">{siteLocked ? <Lock size={ICON} /> : <LockOpen size={ICON} />}</span>}
            <span>Terrain and lot</span>
          </li>
        </Tip>
        {LAYER_IDS.map((id) => (
          <li key={id} className="layer">
            <button
              className={`icon${layers[id].visible ? '' : ' off'}`}
              aria-label={`${layers[id].visible ? 'Hide' : 'Show'} ${LAYER_NAMES[id]}`}
              aria-pressed={!layers[id].visible}
              onClick={() => setLayer(id, { visible: !layers[id].visible })}
            >
              {layers[id].visible ? <Eye size={ICON} aria-hidden="true" /> : <EyeOff size={ICON} aria-hidden="true" />}
            </button>
            {!beginner && (
              <button
                className={`icon${layers[id].locked ? ' on' : ''}`}
                aria-label={`${layers[id].locked ? 'Unlock' : 'Lock'} ${LAYER_NAMES[id]}`}
                aria-pressed={layers[id].locked}
                onClick={() => setLayer(id, { locked: !layers[id].locked })}
              >
                {layers[id].locked ? <Lock size={ICON} aria-hidden="true" /> : <LockOpen size={ICON} aria-hidden="true" />}
              </button>
            )}
            <span>{LAYER_NAMES[id]}</span>
            {id !== 'labels' && <span className="muted small count">{counts[id] ?? 0}</span>}
          </li>
        ))}
        <li className="layer">
          <button className={`icon${contours ? '' : ' off'}`} aria-label={`${contours ? 'Hide' : 'Show'} Contours`} aria-pressed={!contours} onClick={() => setContours(!contours)}>
            {contours ? <Eye size={ICON} aria-hidden="true" /> : <EyeOff size={ICON} aria-hidden="true" />}
          </button>
          {!beginner && <span className="icon" />}
          <span>
            <Term term="contour">Contours</Term>
          </span>
          <span className="muted small count">2 ft, darker every 10</span>
        </li>
        <li className="layer">
          <button
            className={`icon${setbacksShown ? '' : ' off'}`}
            aria-label={`${setbacksShown ? 'Hide' : 'Show'} Setbacks`}
            aria-pressed={!setbacksShown}
            onClick={() => setSetbacks({ shown: !setbacksShown })}
          >
            {setbacksShown ? <Eye size={ICON} aria-hidden="true" /> : <EyeOff size={ICON} aria-hidden="true" />}
          </button>
          {!beginner && <span className="icon" />}
          <span>
            <Term term="setback">Setbacks</Term>
          </span>
          <span className="muted small count">ground tints, buffer line</span>
        </li>
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
