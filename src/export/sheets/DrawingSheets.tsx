import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { floorPlans } from './plan/floorPlans'
import { elevationView, sheetBuildings } from './model/model'
import { SIDES } from './elevation/sides'
import { tablesCsv } from './tables/table'
import { smallestPaper, tileDrawing } from './tiles'
import { PAPERS, SCALE_LABEL, SITE_SCALE_LABEL, type PaperId, type Scale, type SheetBuilding, type SiteScale } from './types'
import { usePlanStore } from '../../store/planStore'
import type { Terrain } from '../../site/types'
import type { PlanObject } from '../../store/types'
import { ElevationSheet, elevationLayout } from './elevation/ElevationSheet'
import { MeasureTables } from './tables/MeasureTables'
import { planLayout, PlanSheet } from './plan/PlanSheet'
import { FoundationSheet } from './foundation/FoundationSheet'
import { hasSupports } from './plan/planLayout'
import { Tip } from '../../guide/Tip'
import { useEarthworks } from '../../site/earthworks/useEarthworks'
import { buildSiteSheet, SiteSheet, type SiteSheetInput } from './site/SiteSheet'
import { siteNotes } from './site/siteNotes'
import { SiteFit } from './site/SiteFit'

interface Props {
  readonly onClose: () => void
  /** Takes the focus back when the sheets close: the button that opened them. */
  readonly opener?: HTMLElement | null
}

const ALL = 'all'

type Attempt<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown }

/** Run a sheet's build, keeping a failure to that sheet (logged for whoever is debugging it). */
function attempt<T>(f: () => T): Attempt<T> {
  try {
    return { ok: true, value: f() }
  } catch (error) {
    console.error('Drawing sheets: a sheet could not be built', error)
    return { ok: false, error }
  }
}
const SCALES = Object.keys(SCALE_LABEL).map(Number) as Scale[]
const SITE_SCALES = Object.keys(SITE_SCALE_LABEL).map(Number) as SiteScale[]
const PAPER_IDS = Object.keys(PAPERS) as PaperId[]

/**
 * Floor plans, elevations and measurement tables of each building at a true
 * scale, shown as the printed sheets over the planner, for drawing by hand.
 */
export function DrawingSheets({ onClose, opener }: Props) {
  const { plan, terrain, selection, site, setbacks, environment, layers } = usePlanStore(
    useShallow((s) => ({ plan: s.plan, terrain: s.site.terrain, selection: s.selection, site: s.site, setbacks: s.setbacks, environment: s.environment, layers: s.layers })),
  )
  // the same reshaped ground the Code check and the 3D marks use, so the site sheet's numbers and contours match them
  const { works, ground } = useEarthworks()
  // layers only change the notes' nearest object, so they don't redraw the site plan itself
  const siteInput = useMemo<SiteSheetInput>(() => ({ plan, site, setbacks, environment, works, ground }), [plan, site, setbacks, environment, works, ground])
  const [siteScale, setSiteScale] = useState<SiteScale>(0.05)
  const [northUp, setNorthUp] = useState(false)
  const objects = useMemo(() => plan.order.map((id) => plan.objects[id]).filter((o) => o !== undefined), [plan])
  const buildings = useMemo(() => sheetBuildings(objects, terrain), [objects, terrain])
  const [pick, setPick] = useState(() => selection.find((id) => buildings.some((b) => b.id === id)) ?? buildings[0]?.id ?? ALL)
  const [paper, setPaper] = useState<PaperId>('tabloid')
  const [scale, setScale] = useState<Scale>(0.25)
  const [show, setShow] = useState({ site: true, plan: true, elevations: true, measurements: true, grid: true, rooms: true, furniture: false, supports: true })
  // a site plan that can't be drawn says so in one line, and the building sheets carry on
  const siteResult = useMemo(() => (show.site ? attempt(() => buildSiteSheet(siteInput, paper, siteScale, northUp)) : null), [show.site, siteInput, paper, siteScale, northUp])
  const siteNotesResult = useMemo(() => (show.site ? attempt(() => siteNotes({ plan, site, setbacks, layers, routeGround: ground })) : null), [show.site, plan, site, setbacks, layers, ground])
  const siteBuild = siteResult?.ok && siteNotesResult?.ok ? { build: siteResult.value, notes: siteNotesResult.value } : null
  // the notes column measured too tall beside the drawing, for this drawing and these notes (a new drawing or notes measures again)
  const [tooTallFor, setTooTallFor] = useState<{ readonly build: unknown; readonly notes: unknown } | null>(null)
  const notesTooTall = !!siteBuild && tooTallFor?.build === siteBuild.build && tooTallFor.notes === siteBuild.notes
  const siteBuildValue = siteResult?.ok ? siteResult.value : null
  const siteNotesValue = siteNotesResult?.ok ? siteNotesResult.value : null
  const onNotesTooTall = useCallback(() => setTooTallFor({ build: siteBuildValue, notes: siteNotesValue }), [siteBuildValue, siteNotesValue])
  const siteFailed = (siteResult && !siteResult.ok) || (siteNotesResult && !siteNotesResult.ok)
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
        {show.site && (
          <label>
            <span>Site scale</span>
            <select value={siteScale} onChange={(e) => setSiteScale(Number(e.target.value) as SiteScale)} aria-label="Site plan scale">
              {SITE_SCALES.map((s) => (
                <option key={s} value={s}>
                  {SITE_SCALE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        )}
        <fieldset className="sheets-show">
          <legend>Show</legend>
          <Check label="Site plan" on={show.site} onChange={() => toggle('site')} title="The whole lot at a site scale: contours, buildings and roofs, walks, setbacks and the buffer, with the lot coverage, program budget and code check beside it" />
          {show.site && <Check label="North up" on={northUp} onChange={() => setNorthUp((v) => !v)} title="Draw the site plan with north straight up; otherwise it is turned so the lot fits the paper, and the north arrow shows the turn" />}
          <Check label="Plan" on={show.plan} onChange={() => toggle('plan')} />
          <Check label="Elevations" on={show.elevations} onChange={() => toggle('elevations')} />
          <Check label="Measurements" on={show.measurements} onChange={() => toggle('measurements')} />
          <Check label="Grid" on={show.grid} onChange={() => toggle('grid')} title="A 1 ft grid on the plan, darker every 4 ft" />
          <Check label="Rooms" on={show.rooms} onChange={() => toggle('rooms')} title="The rooms from the interior plan: partitions, interior doors, each room's name, size and area" />
          <Check label="Furniture" on={show.furniture} onChange={() => toggle('furniture')} title="The furniture and fixtures from the interior plan" />
          <Check label="Supports" on={show.supports} onChange={() => toggle('supports')} title="A foundation plan after the floor plans: what each part stands on (posts, piers and piles at their size, beams dashed, a mast or stilts), with one spacing chain per row of posts" />
        </fieldset>
        <button onClick={() => window.print()} disabled={(!shown.length && !siteBuild) || drawing}>
          {drawing ? 'Drawing elevations…' : 'Print'}
        </button>
        <button onClick={() => downloadCsv(plan.name, pickName, shown)} disabled={!shown.length}>
          Download measurements
        </button>
        {siteBuild && <SiteFit build={siteBuild.build} notes={siteBuild.notes} paper={paper} scale={siteScale} notesTooTall={notesTooTall} />}
        <PaperFit buildings={shown} objects={objects} terrain={terrain} paper={paper} scale={scale} show={show} />
        <p className="sheets-hint">Print at 100% (Actual size), not Fit to page. Check the 1 inch bar on each sheet with a ruler.</p>
      </div>
      <div className="sheets-pages">
        {siteFailed && (
          <p className="sheets-empty" role="alert" data-testid="site-failed">
            The site plan couldn't be drawn for this plan. The other sheets are below.
          </p>
        )}
        {siteBuild && (
          <div className="sheets-building" data-testid="site-sheet">
            <SiteSheet build={siteBuild.build} notes={siteBuild.notes} notesTooTall={notesTooTall} onNotesTooTall={onNotesTooTall} paper={paper} scale={siteScale} planName={plan.name} />
          </div>
        )}
        {/* print breaks a page after every sheet but the last child's last: so the empty note shows only with nothing else to print,
            and a building with none of its sheets shown leaves no empty block after the site plan */}
        {!shown.length && !siteBuild && <p className="sheets-empty">There are no buildings in this plan to draw.</p>}
        {(show.plan || show.elevations || show.measurements ? shown : []).map((b) => {
          const sheet = { ...info, buildingName: b.name }
          const object = plan.objects[b.id]
          return (
            <div key={b.id} className="sheets-building">
              {show.plan &&
                floorPlans(b).map((f) => (
                  <PlanSheet key={f.floor?.index ?? 0} building={f.building} info={sheet} grid={show.grid} floor={f.floor} rooms={show.rooms} furniture={show.furniture} title={f.title} />
                ))}
              {show.plan && show.supports && hasSupports(b) && <FoundationSheet building={b} info={sheet} grid={show.grid} />}
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
  const box = (
    <label className="sheets-check">
      <input type="checkbox" checked={on} onChange={onChange} aria-label={label} />
      <span>{label}</span>
    </label>
  )
  return title ? <Tip label={title}>{box}</Tip> : box
}

interface FitProps {
  readonly buildings: readonly SheetBuilding[]
  readonly objects: readonly PlanObject[]
  readonly terrain: Terrain
  readonly paper: PaperId
  readonly scale: Scale
  readonly show: { readonly plan: boolean; readonly elevations: boolean; readonly rooms: boolean; readonly supports: boolean }
}

/** How many pages the plans and elevations take on this paper, and the smallest paper that fits each plan on one. */
function PaperFit({ buildings, objects, terrain, paper, scale, show }: FitProps) {
  const fits = useMemo(
    () =>
      buildings.map((b) => {
        const plans = floorPlans(b).map((f) => planLayout(f.building, scale, show.rooms ? f.floor : null).extent)
        const foundation = show.supports && hasSupports(b) ? planLayout({ ...b, earthworks: null }, scale, null, true).extent : null
        const sides = SIDES.map((side) => elevationLayout(b, elevationView(objects, terrain, b, side), undefined, scale).extent)
        return {
          name: b.name,
          planPages: [...plans, ...(foundation ? [foundation] : [])].reduce((n, e) => n + tileDrawing(e.w, e.h, paper, scale).length, 0),
          elevationPages: sides.reduce((n, e) => n + tileDrawing(e.w, e.h, paper, scale).length, 0),
          smallest: smallestPaper(Math.max(...plans.map((e) => e.w)), Math.max(...plans.map((e) => e.h)), scale),
        }
      }),
    [buildings, objects, terrain, paper, scale, show.rooms, show.supports],
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
