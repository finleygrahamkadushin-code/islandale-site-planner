import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { sheetBuildings } from '../export/sheets/model'
import { tablesCsv } from '../export/sheets/table'
import { PAPERS, SCALE_LABEL, type PaperId, type Scale, type SheetBuilding } from '../export/sheets/types'
import { usePlanStore } from '../store/planStore'
import { ElevationSheet } from './sheets/ElevationSheet'
import { MeasureTables } from './sheets/MeasureTables'
import { PlanSheet } from './sheets/PlanSheet'

interface Props {
  readonly onClose: () => void
}

const ALL = 'all'
const SCALES = Object.keys(SCALE_LABEL).map(Number) as Scale[]
const PAPER_IDS = Object.keys(PAPERS) as PaperId[]
const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/**
 * Floor plans, elevations and measurement tables of each building at a true
 * scale, shown as the printed sheets over the planner, for drawing by hand.
 */
export function DrawingSheets({ onClose }: Props) {
  const { plan, terrain, selection } = usePlanStore(useShallow((s) => ({ plan: s.plan, terrain: s.site.terrain, selection: s.selection })))
  const objects = useMemo(() => plan.order.map((id) => plan.objects[id]).filter((o) => o !== undefined), [plan])
  const buildings = useMemo(() => sheetBuildings(objects, terrain), [objects, terrain])
  const [pick, setPick] = useState(() => selection.find((id) => buildings.some((b) => b.id === id)) ?? buildings[0]?.id ?? ALL)
  const [paper, setPaper] = useState<PaperId>('tabloid')
  const [scale, setScale] = useState<Scale>(0.25)
  const [show, setShow] = useState({ plan: true, elevations: true, measurements: true, grid: true })
  const picked = buildings.filter((b) => b.id === pick)
  const shown = pick === ALL ? buildings : picked.length ? picked : buildings.slice(0, 1)
  const pickName = pick === ALL ? 'All buildings' : (shown[0]?.name ?? 'Building')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && TYPING_TAGS.has(e.target.tagName) && !(e.target instanceof HTMLInputElement && e.target.type === 'checkbox')
      if (e.key === 'Escape' && !typing) onClose()
      // keep the planner's shortcuts (Delete, arrows, undo) off the plan behind the sheets
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const toggle = (key: keyof typeof show) => setShow((s) => ({ ...s, [key]: !s[key] }))
  const p = PAPERS[paper]
  const info = { paper, scale, planName: plan.name }

  return createPortal(
    <div className="drawing-sheets" role="dialog" aria-label="Drawing sheets">
      <style>{`@page { size: ${p.w}in ${p.h}in; margin: 0 }`}</style>
      <div className="sheets-bar" role="toolbar" aria-label="Drawing sheet settings">
        <button onClick={onClose}>Back to the planner</button>
        <label>
          <span>Building</span>
          <select value={pick === ALL || picked.length ? pick : (buildings[0]?.id ?? ALL)} onChange={(e) => setPick(e.target.value)} aria-label="Building">
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
            {buildings.length > 1 && <option value={ALL}>All buildings</option>}
          </select>
        </label>
        <label>
          <span>Paper</span>
          <select value={paper} onChange={(e) => setPaper(e.target.value as PaperId)} aria-label="Paper size">
            {PAPER_IDS.map((id) => (
              <option key={id} value={id}>
                {PAPERS[id].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Scale</span>
          <select value={scale} onChange={(e) => setScale(Number(e.target.value) as Scale)} aria-label="Drawing scale">
            {SCALES.map((s) => (
              <option key={s} value={s}>
                {SCALE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="sheets-show">
          <legend>Show</legend>
          <Check label="Plan" on={show.plan} onChange={() => toggle('plan')} />
          <Check label="Elevations" on={show.elevations} onChange={() => toggle('elevations')} />
          <Check label="Measurements" on={show.measurements} onChange={() => toggle('measurements')} />
          <Check label="Grid" on={show.grid} onChange={() => toggle('grid')} title="A 1 ft grid on the plan, darker every 4 ft" />
        </fieldset>
        <button onClick={() => window.print()} disabled={!shown.length}>
          Print
        </button>
        <button onClick={() => downloadCsv(plan.name, pickName, shown)} disabled={!shown.length}>
          Download measurements
        </button>
        <p className="sheets-hint">Print at 100% (Actual size), not Fit to page. Check the 1 inch bar on each sheet with a ruler.</p>
      </div>
      <div className="sheets-pages">
        {!shown.length && <p className="sheets-empty">There are no buildings in this plan to draw.</p>}
        {shown.map((b) => {
          const sheet = { ...info, buildingName: b.name }
          const object = plan.objects[b.id]
          return (
            <div key={b.id} className="sheets-building">
              {show.plan && <PlanSheet building={b} info={sheet} grid={show.grid} />}
              {show.elevations && object && <ElevationSheet building={b} object={object} objects={objects} terrain={terrain} info={sheet} />}
              {show.measurements && <MeasureTables building={b} info={sheet} />}
            </div>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}

function Check({ label, on, onChange, title }: { readonly label: string; readonly on: boolean; readonly onChange: () => void; readonly title?: string }) {
  return (
    <label className="sheets-check" title={title}>
      <input type="checkbox" checked={on} onChange={onChange} />
      {label}
    </label>
  )
}

/** Characters no file system takes in a name. */
const fileSafe = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'plan'

function downloadCsv(planName: string, buildingName: string, buildings: readonly SheetBuilding[]): void {
  const text = buildings.length === 1 ? tablesCsv(buildings[0]) : buildings.map((b) => `${csvCell(b.name)}\n${tablesCsv(b)}`).join('\n\n')
  const blob = new Blob([text], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileSafe(`${planName} - ${buildingName} measurements`) + '.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
