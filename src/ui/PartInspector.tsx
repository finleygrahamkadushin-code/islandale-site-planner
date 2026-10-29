import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { num } from '../buildings/footprint'
import { buildingMasses, partName, type Mass, type MassKind } from '../buildings/masses'
import { kindPatch, MAX_LEVEL_FT, minSizeFt, railSummary, stairSummary } from '../buildings/partFields'
import { isRailable } from '../buildings/railRules'
import { wingAt } from '../buildings/wingEdits'
import { objectRails } from '../scene/railSite'
import { stairInfo } from '../scene/stairSite'
import { useRailWorld } from '../scene/useRailWorld'
import { isObjectLocked, usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { FeetInchesField } from './FeetInchesField'
import { NumField, TextField } from './fields'

const KINDS: readonly { readonly id: MassKind; readonly label: string }[] = [
  { id: 'wall', label: 'Walls' },
  { id: 'porch', label: 'Porch' },
  { id: 'deck', label: 'Deck' },
  { id: 'stair', label: 'Stair' },
  { id: 'ramp', label: 'Ramp' },
]
/** Offsets reach well past any cabin, both ways. */
const OFFSET_LIMIT_FT = -1000

/** The picked part's own fields (legacy Wings panel row): every change one undo step, all disabled when locked. */
export function PartInspector({ id, mass }: { readonly id: string; readonly mass: number }) {
  const o = usePlanStore((s) => s.plan.objects[id])
  const locked = usePlanStore((s) => isObjectLocked(s, id))
  const a = usePlanStore(
    useShallow((s) => ({ update: s.updateWing, remove: s.removeWing, pick: s.pickPart, resize: s.resizeObject, params: s.setObjectParams, toast: s.showToast })),
  )
  const m = useMemo(() => (o ? buildingMasses(o.params)[mass] : undefined), [o, mass])
  if (!o || !m) return null
  const name = partName(m, mass)
  const set = (patch: Record<string, unknown>) => a.update(id, mass, patch)
  const remove = () => {
    const before = usePlanStore.getState().plan
    a.remove(id, mass)
    if (usePlanStore.getState().plan !== before) a.toast(`Removed ${name}`)
  }
  return (
    <section className="part-inspector" data-testid="part-inspector" aria-label={`Part: ${name}`}>
      <div className="row between">
        <strong>{name}</strong>
        <button type="button" className="link" onClick={() => a.pick(null)}>
          Back to cabin
        </button>
      </div>
      {mass === 0 ? (
        <div className="grid2">
          <span className="muted small span2">Main walls</span>
          <FeetInchesField label="Width" value={m.w} min={3} disabled={locked} onCommit={(w) => a.resize(id, { w, d: m.d })} />
          <FeetInchesField label="Depth" value={m.d} min={3} disabled={locked} onCommit={(d) => a.resize(id, { w: m.w, d })} />
          <FeetInchesField label="Wall height" value={m.h} min={1} disabled={locked} onCommit={(h) => a.params(id, { h })} />
        </div>
      ) : (
        <WingFields o={o} m={m} mass={mass} locked={locked} set={set} />
      )}
      {mass > 0 && <PartNotes o={o} m={m} mass={mass} />}
      {mass > 0 && (
        <div className="actions">
          <button type="button" className="danger" disabled={locked} onClick={remove}>
            Remove {name}
          </button>
        </div>
      )}
    </section>
  )
}

interface WingProps {
  readonly o: PlanObject
  readonly m: Mass
  readonly mass: number
  readonly locked: boolean
  readonly set: (patch: Record<string, unknown>) => void
}

function WingFields({ o, m, mass, locked, set }: WingProps) {
  const access = m.kind === 'stair' || m.kind === 'ramp'
  const min = minSizeFt(m.kind)
  const raw = wingAt(o.params, mass)
  return (
    <div className="grid2">
      <label className="field">
        <span className="muted small">Kind</span>
        <select value={m.kind} disabled={locked} onChange={(e) => set(kindPatch(raw, e.target.value as MassKind, num(o.params.h, 9)))}>
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <TextField label="Name" value={m.name ?? ''} allowEmpty disabled={locked} onCommit={(v) => set({ name: v || undefined })} />
      <FeetInchesField label="Width" value={m.w} min={min} disabled={locked} onCommit={(w) => set({ w })} />
      <FeetInchesField label={access ? 'Run' : 'Depth'} value={m.d} min={min} disabled={locked} onCommit={(d) => set({ d })} />
      {!access && <FeetInchesField label="Wall height" value={m.h} min={m.kind === 'deck' ? 0 : 1} disabled={locked} onCommit={(h) => set({ h })} />}
      <FeetInchesField label="Level" value={m.lvl} min={0} disabled={locked} onCommit={(lvl) => set({ lvl: Math.min(MAX_LEVEL_FT, lvl) })} />
      <FeetInchesField label="Offset →" value={m.dx} min={OFFSET_LIMIT_FT} disabled={locked} onCommit={(dx) => set({ dx })} />
      <FeetInchesField label="Offset front" value={m.dz} min={OFFSET_LIMIT_FT} disabled={locked} onCommit={(dz) => set({ dz })} />
      <NumField label="Angle" unit="°" value={m.rot} disabled={locked} onCommit={(rot) => set({ rot })} />
    </div>
  )
}

/** A deck's or porch's rails in brief, or a stair's or ramp's numbers with any warning. */
function PartNotes({ o, m, mass }: { readonly o: PlanObject; readonly m: Mass; readonly mass: number }) {
  const world = useRailWorld()
  const notes = useMemo(() => {
    if (isRailable(m)) {
      const rails = objectRails(world, o)[mass]
      return rails ? { lines: [railSummary(rails)], warn: rails.some((r) => r.required && !r.drawn) ? 'A guard is required over 30 in' : null } : null
    }
    const info = stairInfo(world, o, mass)
    return info ? stairSummary(info) : null
  }, [world, o, m, mass])
  if (!notes) return null
  return (
    <ul className="part-notes" data-testid="part-notes">
      {notes.lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
      {notes.warn && <li className="warn">{notes.warn}</li>}
    </ul>
  )
}
