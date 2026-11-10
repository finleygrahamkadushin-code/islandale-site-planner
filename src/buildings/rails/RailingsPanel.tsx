import { useMemo } from 'react'
import { buildingMasses, deckObjectMass, type Mass } from '../masses'
import { railRowText, railTarget } from '../parts/partFields'
import { buildingRailStyle, RAIL_STYLES, stairSideState, type RailState, type RailStyle } from './railEdits'
import { wingAt } from '../parts/wingEdits'
import { wingHost } from '../stairs/stairWing'
import { isRailable, type EdgeRail } from './railRules'
import { objectRails } from './railSite'
import { useRailWorld } from './useRailWorld'
import { isObjectLocked, pickedPartOf, usePlanStore } from '../../store/planStore'
import type { PlanObject } from '../../store/types'
import { InspectorSection } from '../../ui/InspectorSection'

const STATES: readonly RailState[] = ['on', 'off', 'auto']
const STYLE_LABELS: Record<RailStyle, string> = { wood: 'wood', steel: 'steel', cable: 'cable', glass: 'glass', none: 'none (hidden)' }
const isAccess = (m: Mass) => m.kind === 'stair' || m.kind === 'ramp'
/** Decks and porches rail per edge; stairs and ramps per handrail side. */
const hasRails = (m: Mass) => isRailable(m) || isAccess(m)
const HINT = 'Auto = a guard wherever the floor is more than 30 in above the ground (IRC R312.1). Click the rail chips in 3D to cycle auto → on → off.'

/**
 * Railings for a standalone deck, or for the picked deck or porch of a
 * cabin (legacy rail-edit panel): each edge on, off or auto with its drop,
 * what opens it and a warning where a required guard is off; all on, all
 * off or auto; and the building's rail style. With no railable part
 * picked it lists the cabin's decks and porches to pick from.
 */
export function RailingsPanel({ id }: { readonly id: string }) {
  const o = usePlanStore((s) => s.plan.objects[id])
  const part = usePlanStore(pickedPartOf)
  const locked = usePlanStore((s) => isObjectLocked(s, id))
  const pickPart = usePlanStore((s) => s.pickPart)
  const masses = useMemo(() => (o ? (o.type === 'deck' ? [deckObjectMass(o.params)] : buildingMasses(o.params)) : []), [o])
  if (!o || (o.type !== 'house' && o.type !== 'deck')) return null
  const deck = o.type === 'deck'
  const mi = deck ? 0 : part?.objectId === id && part.mass > 0 && masses[part.mass] && hasRails(masses[part.mass]) ? part.mass : null
  const railable = deck ? [] : masses.flatMap((m, i) => (i > 0 && hasRails(m) ? [i] : []))
  if (!deck && !railable.length) return null
  return (
    <InspectorSection
      id="railings"
      className="railings"
      title={
        <>
          Railings <span className="muted small">{mi === null ? '' : deck ? o.name : railTarget(masses[mi], mi)}</span>
        </>
      }
    >
      {mi === null ? (
        <>
          <p className="muted small">Pick a deck, porch or stair to set its railings (or click it again in 3D):</p>
          <div className="actions">
            {railable.map((i) => (
              <button key={i} type="button" onClick={() => pickPart({ objectId: id, mass: i })}>
                {railTarget(masses[i], i)} · {Math.round(masses[i].w)} × {Math.round(masses[i].d)} ft
              </button>
            ))}
          </div>
        </>
      ) : isAccess(masses[mi]) ? (
        <StairRails o={o} masses={masses} mi={mi} locked={locked} />
      ) : (
        <RailEdges o={o} m={masses[mi]} mi={mi} locked={locked} />
      )}
    </InspectorSection>
  )
}

function RailEdges({ o, m, mi, locked }: { readonly o: PlanObject; readonly m: Mass; readonly mi: number; readonly locked: boolean }) {
  const world = useRailWorld()
  const setRail = usePlanStore((s) => s.setRail)
  const setRailStyle = usePlanStore((s) => s.setRailStyle)
  const edges = useMemo(() => objectRails(world, o)[mi] ?? [], [world, o, mi])
  return (
    <>
      <ul className="rail-rows">
        {edges.map((e) => (
          <RailRow key={e.i} m={m} e={e} mi={mi} locked={locked} onSet={(s) => setRail(o.id, mi, e.i, s)} />
        ))}
      </ul>
      <div className="actions">
        <button type="button" disabled={locked} onClick={() => setRail(o.id, mi, 'all', 'on')}>
          All on
        </button>
        <button type="button" disabled={locked} onClick={() => setRail(o.id, mi, 'all', 'off')}>
          All off
        </button>
        <button type="button" disabled={locked} onClick={() => setRail(o.id, mi, 'all', 'auto')}>
          Auto
        </button>
      </div>
      <label className="row">
        <span>Rail style</span>
        <select data-testid="rail-style" value={buildingRailStyle(o.params)} disabled={locked} onChange={(e) => setRailStyle(o.id, e.target.value as RailStyle)}>
          {RAIL_STYLES.map((s) => (
            <option key={s} value={s}>
              {STYLE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small">{HINT}</p>
    </>
  )
}

const SIDES: readonly { readonly edge: number; readonly label: string }[] = [
  { edge: 3, label: 'Left handrail' },
  { edge: 1, label: 'Right handrail' },
]

/** A stair's or ramp's handrails (deliberate addition, PLAN.md): each side on or off, and joined to the railing at its top. */
function StairRails({ o, masses, mi, locked }: { readonly o: PlanObject; readonly masses: readonly Mass[]; readonly mi: number; readonly locked: boolean }) {
  const setRail = usePlanStore((s) => s.setRail)
  const setRailJoin = usePlanStore((s) => s.setRailJoin)
  const raw = wingAt(o.params, mi)
  const hosted = !!wingHost(masses, mi)
  return (
    <>
      <ul className="rail-rows">
        {SIDES.map(({ edge, label }) => {
          const st = stairSideState(raw, edge)
          return (
            <li key={edge} className="rail-row" data-testid={`stair-rail-${mi}-${edge}`}>
              <span>{label}</span>
              <span className="seg">
                {(['on', 'off'] as const).map((s) => (
                  <button key={s} type="button" className={st.on === (s === 'on') ? 'on' : ''} disabled={locked} aria-pressed={st.on === (s === 'on')} onClick={() => setRail(o.id, mi, edge, s)}>
                    {s}
                  </button>
                ))}
              </span>
              {hosted && (
                <label className="row small">
                  <input type="checkbox" checked={st.join} disabled={locked || !st.on} onChange={(e) => setRailJoin(o.id, mi, edge, e.target.checked)} /> join
                </label>
              )}
            </li>
          )
        })}
      </ul>
      <p className="muted small">Join carries a handrail over the landing to the railing at the top. Click a rail in 3D to remove it on its own.</p>
    </>
  )
}

interface RowProps {
  readonly m: Mass
  readonly e: EdgeRail
  readonly mi: number
  readonly locked: boolean
  readonly onSet: (s: RailState) => void
}

function RailRow({ m, e, mi, locked, onSet }: RowProps) {
  const warn = e.required && !e.drawn
  return (
    <li className={`rail-row${warn ? ' warn' : ''}${e.free ? '' : ' muted'}`} data-testid={`rail-edge-${mi}-${e.i}`}>
      <span>{railRowText(m, e)}</span>
      {e.free && (
        <span className="seg">
          {STATES.map((s) => (
            <button key={s} type="button" className={e.state === s ? 'on' : ''} disabled={locked} aria-pressed={e.state === s} onClick={() => onSet(s)}>
              {s}
            </button>
          ))}
        </span>
      )}
    </li>
  )
}
