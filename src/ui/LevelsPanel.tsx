import { useMemo } from 'react'
import { levelReport } from '../paths/levels'
import { fixPatches, levelEverything } from '../paths/levelsFixes'
import { floorText, LEVEL_EVERYTHING, LEVELS_HINT, LEVELS_TITLE, levelsPanel, NOTHING_MEETS_TEXT, statusText, type LevelRow } from '../paths/levelsPanel'
import type { PlanPatch } from '../paths/levelsFixes'
import { useEarthworks } from '../scene/useEarthworks'
import { isObjectLocked, usePlanStore } from '../store/planStore'
import type { ObjectPatch } from '../store/pathActions'
import type { PlanObject } from '../store/types'

const toPatch = (p: PlanPatch): ObjectPatch => ({ id: p.objectId, params: p.params as Record<string, unknown> | undefined, position: p.position })

/** A building's levels and junctions (old Levels & junctions panel): every wing and everything that meets its edges, flush or stepped, with Fix and Level everything. */
export function LevelsPanel({ o }: { readonly o: PlanObject }) {
  const plan = usePlanStore((s) => s.plan)
  const terrain = usePlanStore((s) => s.site.terrain)
  const locked = usePlanStore((s) => isObjectLocked(s, o.id))
  const applyPathEdit = usePlanStore((s) => s.applyPathEdit)
  const showToast = usePlanStore((s) => s.showToast)
  const { ground } = useEarthworks()
  const objects = useMemo(() => plan.order.map((id) => plan.objects[id]), [plan])
  const model = useMemo(() => levelsPanel(o, objects, terrain, ground), [o, objects, terrain, ground])
  if (!model) return null
  const fix = (k: number) => applyPathEdit([], fixPatches([model.fixes[k]], objects, ground).patches.map(toPatch))
  const everything = () => {
    const r = levelEverything(levelReport(o, objects, terrain, ground), objects, ground)
    if (r.patches.length) applyPathEdit([], r.patches.map(toPatch))
    if (r.message) showToast(r.message)
  }
  const row = (r: LevelRow, i: number) => (
    <li key={i} className={r.ok ? 'ok' : 'miss'}>
      {r.label}
      {r.text && <b> · {r.text}</b>}
      {r.fix >= 0 && (
        <button className="small" disabled={locked} onClick={() => fix(r.fix)} data-testid="level-fix">
          Fix
        </button>
      )}
    </li>
  )
  const rows = [...model.wings, ...model.junctions, ...model.others]
  return (
    <section className="panel" aria-label={LEVELS_TITLE}>
      <header>
        <strong>{LEVELS_TITLE}</strong>
        <span className="muted small">
          {floorText(model.floorM)} · {statusText(model)}
        </span>
      </header>
      {rows.length ? <ul className="int-program">{rows.map(row)}</ul> : <p className="muted small">{NOTHING_MEETS_TEXT}</p>}
      {model.fixes.length > 0 && (
        <button disabled={locked} onClick={everything} data-testid="level-everything">
          {LEVEL_EVERYTHING}
        </button>
      )}
      <p className="muted small">{LEVELS_HINT}</p>
    </section>
  )
}
