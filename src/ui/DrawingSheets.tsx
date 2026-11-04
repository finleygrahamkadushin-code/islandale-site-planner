import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { elevationView, sheetBuildings } from '../export/sheets/model'
import { SIDES } from '../export/sheets/sides'
import { tablesCsv } from '../export/sheets/table'
import { smallestPaper, tileDrawing } from '../export/sheets/tiles'
import { PAPERS, SCALE_LABEL, type PaperId, type Scale, type SheetBuilding } from '../export/sheets/types'
import { usePlanStore } from '../store/planStore'
import type { Terrain } from '../site/types'
import type { PlanObject } from '../store/types'
import { ElevationSheet, elevationLayout } from './sheets/ElevationSheet'
import { MeasureTables } from './sheets/MeasureTables'
import { planLayout, PlanSheet } from './sheets/PlanSheet'

interface Props {
  readonly onClose: () => void
  /** Takes the focus back when the sheets close: the button that opened them. */
  readonly opener?: HTMLElement | null
}

const ALL = 'all'
const SCALES = Object.keys(SCALE_LABEL).map(Number) as Scale[]
const PAPER_IDS = Object.keys(PAPERS) as PaperId[]

/**
 * Floor plans, elevations and measurement tables of each building at a true
 * scale, shown as the printed sheets over the planner, for drawing by hand.
 */
export function DrawingSheets({ onClose, opener }: Props) {
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
  const back = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const busyFor = useCallback(
    (id: string) => (on: boolean) =>
      setBusy((s) => {
        if (s.has(id) === on) return s
        const next = new Set(s)
        if (on) next.add(id)
        else next.delete(id)
        return next
      }),
    [],
  )
  const busyCallbacks = useMemo(() => new Map(buildings.map((b) => [b.id, busyFor(b.id)])), [buildings, busyFor])
  const drawing = show.elevations && shown.some((b) => busy.has(b.id))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape closes from anywhere, a toolbar select included (an open select's own list takes it first)
      if (e.key === 'Escape') onClose()
      // keep the planner's shortcuts (Delete, arrows, undo) off the plan behind the sheets
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // a modal: the planner behind can't be tabbed to or clicked, and the focus goes back to the opener on close
  useEffect(() => {
    const root = document.getElementById('root')
    const wasInert = root?.inert ?? false
    if (root) root.inert = true
    back.current?.focus()
    return () => {
      if (root) root.inert = wasInert
      opener?.focus()
    }
  }, [opener])

  const toggle = (key: keyof typeof show) => setShow((s) => ({ ...s, [key]: !s[key] }))
  const p = PAPERS[paper]
  const info = { paper, scale, planName: plan.name }

  return createPortal(
    <div className="drawing-sheets" role="dialog" aria-modal="true" aria-label="Drawing sheets">
      <style>{`@page { size: ${p.w}in ${p.h}in; margin: 0 }`}</style>
      <div className="sheets-bar" role="toolbar" aria-label="Drawing sheet settings">
        <button ref={back} onClick={onClose}>
          Back to the planner
        </button>
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
        <button onClick={() => window.print()} disabled={!shown.length || drawing} title={drawing ? 'Waiting for the elevations to finish drawing' : undefined}>
          {drawing ? 'Drawing elevations…' : 'Print'}
        </button>
        <button onClick={() => downloadCsv(plan.name, pickName, shown)} disabled={!shown.length}>
          Download measurements
        </button>
        <PaperFit buildings={shown} objects={objects} terrain={terrain} paper={paper} scale={scale} show={show} />
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
              {show.elevations && object && <ElevationSheet building={b} object={object} objects={objects} terrain={terrain} info={sheet} onBusy={busyCallbacks.get(b.id)} />}
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
      <input type="checkbox" checked={on} onChange={onChange} aria-label={label} />
      <span>{label}</span>
    </label>
  )
}

interface FitProps {
  readonly buildings: readonly SheetBuilding[]
  readonly objects: readonly PlanObject[]
  readonly terrain: Terrain
  readonly paper: PaperId
  readonly scale: Scale
  readonly show: { readonly plan: boolean; readonly elevations: boolean }
}

/** How many pages the plans and elevations take on this paper, and the smallest paper that fits each plan on one. */
function PaperFit({ buildings, objects, terrain, paper, scale, show }: FitProps) {
  const fits = useMemo(
    () =>
      buildings.map((b) => {
        const plan = planLayout(b, scale).extent
        const sides = SIDES.map((side) => elevationLayout(b, elevationView(objects, terrain, b, side), undefined, scale).extent)
        return {
          name: b.name,
          planPages: tileDrawing(plan.w, plan.h, paper, scale).length,
          elevationPages: sides.reduce((n, e) => n + tileDrawing(e.w, e.h, paper, scale).length, 0),
          smallest: smallestPaper(plan.w, plan.h, scale),
        }
      }),
    [buildings, objects, terrain, paper, scale],
  )
  if (!fits.length || !(show.plan || show.elevations)) return null
  const pages = (n: number) => `${n} page${n === 1 ? '' : 's'}`
  return (
    <p className="sheets-fit" aria-live="polite">
      {fits.map((f) => {
        const parts = [show.plan && `plan ${pages(f.planPages)}`, show.elevations && `elevations ${pages(f.elevationPages)}`].filter(Boolean).join(', ')
        const one = f.smallest ? `the plan fits one page of ${PAPERS[f.smallest].label}` : 'no paper here holds the plan on one page'
        return (
          <span key={f.name}>
            {f.name}: {parts} on {PAPERS[paper].label}; {one}.
          </span>
        )
      })}
    </p>
  )
}

/** Characters no file system takes in a name. */
const fileSafe = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'plan'

function downloadCsv(planName: string, buildingName: string, buildings: readonly SheetBuilding[]): void {
  const text = buildings.length === 1 ? tablesCsv(buildings[0]) : buildings.map((b) => `${csvCell(b.name)}\n${tablesCsv(b)}`).join('\n\n')
  // the byte-order mark tells Excel the file is UTF-8, so ″, ′ and × come through
  const blob = new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileSafe(`${planName} - ${buildingName} measurements`) + '.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // on a later tick: some browsers start the download only after click() returns
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
