import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { floorPlans } from './plan/floorPlans'
import { elevationView, sheetBuildings } from './model/model'
import { SIDES } from './elevation/sides'
import { tablesCsv } from './tables/table'
import { largestScaleThatFits, smallestPaper, tileDrawing } from './tiles'
import type { Extent } from './Page'
import { PAPERS, SCALE_LABEL, SITE_SCALE_LABEL, type ElevationView, type PaperId, type Scale, type SheetBuilding, type SiteScale } from './types'
import { usePlanStore } from '../../store/planStore'
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
import { cutMarkPadFt, padExtent, sectionCuts, type CutId, type CutOffsets } from './section/sectionCuts'
import { planGround, sectionSource, type SectionSource } from './section/sectionSource'
import { sectionView } from './section/sectionView'
import { sectionLayout } from './section/sectionLayout'
import { SectionSheets } from './section/SectionSheet'
import { CUT_HANDLE_ATTR } from './section/SectionMarks'

interface Props {
  readonly onClose: () => void
  /** Takes the focus back when the sheets close: the button that opened them. */
  readonly opener?: HTMLElement | null
}

const ALL = 'all'
/** The Scale list's first entry: every building's plans, elevations and sections at their own largest scale that fits one page. */
const AUTO = 'auto'

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
  // null until the user picks one: the sheets open at the largest scale that fits one page (R9.4)
  const [chosenScale, setScale] = useState<Scale | null>(null)
  const [show, setShow] = useState({ site: true, plan: true, elevations: true, sections: true, measurements: true, grid: true, rooms: true, furniture: false, supports: true })
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
  const shown = useMemo(() => {
    const one = buildings.filter((b) => b.id === pick)
    return pick === ALL ? buildings : one.length ? one : buildings.slice(0, 1)
  }, [buildings, pick])
  const pickName = pick === ALL ? 'All buildings' : (shown[0]?.name ?? 'Building')
  // the Show boxes that change a plan's extent
  const fitShow = useMemo<PlanFitShow>(() => ({ rooms: show.rooms, sections: show.sections, supports: show.supports }), [show.rooms, show.sections, show.supports])
  // each building's plans (the foundation plan with them) at its own largest scale that fits one page, so a large building never shrinks a small one
  const planScales = useMemo(
    () => new Map(shown.map((b) => [b.id, largestScaleThatFits(SCALES, paper, (s) => planExtents(b, s, fitShow))])),
    [shown, paper, fitShow],
  )
  // the elevations' own fit: they are wide and low, so they often take a larger scale than the plan
  const elevationViews = useMemo(
    () => new Map(show.elevations ? shown.map((b) => [b.id, SIDES.map((side) => elevationView(objects, terrain, b, side))] as const) : []),
    [show.elevations, shown, objects, terrain],
  )
  const elevationScales = useMemo(
    () =>
      new Map(
        shown.flatMap((b) => {
          const views = elevationViews.get(b.id)
          return views ? [[b.id, largestScaleThatFits(SCALES, paper, (s) => views.map((v) => elevationLayout(b, v, undefined, s).extent))] as const] : []
        }),
      ),
    [shown, elevationViews, paper],
  )
  const planScaleOf = useCallback((id: string): Scale => chosenScale ?? planScales.get(id) ?? SCALES[0], [chosenScale, planScales])
  const elevationScaleOf = useCallback((id: string): Scale => chosenScale ?? elevationScales.get(id) ?? planScaleOf(id), [chosenScale, elevationScales, planScaleOf])
  // what the Scale list shows: the picked scale, or the one every shown plan fitted to, or "fit each building" when they differ
  const fittedPlanScales = [...new Set(shown.map((b) => planScales.get(b.id)))]
  const scaleValue = chosenScale ?? (fittedPlanScales.length === 1 && fittedPlanScales[0] !== undefined ? fittedPlanScales[0] : AUTO)
  // the section cuts: where the plan sheets' marks have moved them (view state, like the paper and scale: not saved or undone)
  const [cutOffsets, setCutOffsets] = useState<CutOffsets>({})
  const moveCut = useCallback((id: string) => (cut: CutId, offsetFt: number) => setCutOffsets((all) => ({ ...all, [id]: { ...all[id], [cut]: offsetFt } })), [])
  const cutsOf = useMemo(() => new Map(buildings.map((b) => [b.id, sectionCuts(b, cutOffsets[b.id]) ?? []])), [buildings, cutOffsets])
  const sectionGround = useMemo(() => (show.sections ? attempt(() => planGround(objects, terrain)) : null), [show.sections, objects, terrain])
  const sources = useMemo(() => {
    if (!sectionGround?.ok) return new Map<string, SectionSource>()
    return new Map(buildings.flatMap((b) => {
      const o = plan.objects[b.id]
      const src = o ? attempt(() => sectionSource(o, b, sectionGround.value)) : null
      return src?.ok ? [[b.id, src.value] as const] : []
    }))
  }, [buildings, plan.objects, sectionGround])
  // the sections' own fit, at their default cuts, so dragging a cut never changes the scale under it
  const sectionScales = useMemo(
    () =>
      new Map(
        shown.flatMap((b) => {
          const src = sources.get(b.id)
          if (!src) return []
          const fit = attempt(() => largestScaleThatFits(SCALES, paper, (s) => (sectionCuts(b) ?? []).map((c) => sectionLayout(sectionView(b, src, c), b.levels.floorNavdFt, s).extent)))
          // a section that can't be cut says so on its own sheet, at the plan's scale
          return fit.ok ? [[b.id, fit.value] as const] : []
        }),
      ),
    [shown, sources, paper],
  )
  const sectionScaleOf = (id: string): Scale => chosenScale ?? sectionScales.get(id) ?? planScaleOf(id)
  const movedCuts = Object.keys(cutOffsets).length > 0
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
      // keep the planner's shortcuts (Delete, arrows, undo) off the plan behind the sheets; a section cut's bubble takes its own keys and stops them itself
      if (!(e.target instanceof Element && e.target.closest(`[${CUT_HANDLE_ATTR}]`))) e.stopPropagation()
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
          <select value={scaleValue} onChange={(e) => setScale(e.target.value === AUTO ? null : (Number(e.target.value) as Scale))} aria-label="Drawing scale">
              <option value={AUTO}>Fit each building</option>
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
          <Check label="Sections" on={show.sections} onChange={() => toggle('sections')} title="A long section (A–A) and a cross section (B–B) of each building: walls, floors, roofs, openings and the ground where the cut passes, with heights above the floor and in NAVD88. Drag a cut's lettered bubble on the plan to move it" />
          <Check label="Measurements" on={show.measurements} onChange={() => toggle('measurements')} />
          <Check label="Grid" on={show.grid} onChange={() => toggle('grid')} title="A 1 ft grid on the plan, darker every 4 ft" />
          <Check label="Rooms" on={show.rooms} onChange={() => toggle('rooms')} title="The rooms from the interior plan: partitions, interior doors, each room's name, size and area" />
          <Check label="Furniture" on={show.furniture} onChange={() => toggle('furniture')} title="The furniture and fixtures from the interior plan" />
          <Check label="Supports" on={show.supports} onChange={() => toggle('supports')} title="A foundation plan after the floor plans: what each part stands on (posts, piers and piles at their size, beams dashed, a mast or stilts), with one spacing chain per row of posts" />
        </fieldset>
        <button onClick={() => window.print()} disabled={(!shown.length && !siteBuild) || drawing}>
          {drawing ? 'Drawing elevations…' : 'Print'}
        </button>
        {show.sections && movedCuts && <button onClick={() => setCutOffsets({})}>Reset cuts</button>}
        <button onClick={() => downloadCsv(plan.name, pickName, shown)} disabled={!shown.length}>
          Download measurements
        </button>
        {siteBuild && <SiteFit build={siteBuild.build} notes={siteBuild.notes} paper={paper} scale={siteScale} notesTooTall={notesTooTall} />}
        <PaperFit buildings={shown} views={elevationViews} paper={paper} planScaleOf={planScaleOf} elevationScaleOf={elevationScaleOf} fitShow={fitShow} showPlan={show.plan} showElevations={show.elevations} />
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
        {(show.plan || show.elevations || show.sections || show.measurements ? shown : []).map((b) => {
          const sheet = { paper, scale: planScaleOf(b.id), planName: plan.name, buildingName: b.name }
          const object = plan.objects[b.id]
          const source = sources.get(b.id)
          const cuts = cutsOf.get(b.id) ?? []
          return (
            <div key={b.id} className="sheets-building">
              {show.plan &&
                floorPlans(b).map((f) => (
                  <PlanSheet
                    key={f.floor?.index ?? 0}
                    building={f.building}
                    info={sheet}
                    grid={show.grid}
                    floor={f.floor}
                    rooms={show.rooms}
                    furniture={show.furniture}
                    title={f.title}
                    cuts={show.sections && source ? cuts : undefined}
                    onMoveCut={moveCut(b.id)}
                  />
                ))}
              {show.plan && show.supports && hasSupports(b) && <FoundationSheet building={b} info={sheet} grid={show.grid} />}
              {show.elevations && object && <ElevationSheet building={b} object={object} objects={objects} terrain={terrain} info={{ ...sheet, scale: elevationScaleOf(b.id) }} onBusy={busyCallbacks.get(b.id)} />}
              {show.sections && source && <SectionSheets building={b} source={source} cuts={cuts} info={{ ...sheet, scale: sectionScaleOf(b.id) }} />}
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

/** The Show boxes that change how much room a building's plans take. */
interface PlanFitShow {
  readonly rooms: boolean
  readonly sections: boolean
  readonly supports: boolean
}

/** What a building's plan scale must hold on one page: each floor plan with its section marks, and the foundation plan. */
function planExtents(b: SheetBuilding, scale: Scale, show: PlanFitShow): Extent[] {
  const plans = floorPlans(b).map((f) => withCutMarks(planLayout(f.building, scale, show.rooms ? f.floor : null).extent, scale, show.sections))
  return show.supports && hasSupports(b) ? [...plans, planLayout({ ...b, earthworks: null }, scale, null, true).extent] : plans
}

interface FitProps {
  readonly buildings: readonly SheetBuilding[]
  /** Each building's four elevation views, by building id (empty with the elevations off). */
  readonly views: ReadonlyMap<string, readonly ElevationView[]>
  readonly paper: PaperId
  readonly planScaleOf: (id: string) => Scale
  readonly elevationScaleOf: (id: string) => Scale
  readonly fitShow: PlanFitShow
  readonly showPlan: boolean
  readonly showElevations: boolean
}

/** Each building's scales, how many pages its plans and elevations take on this paper, and the smallest paper that fits its plan on one. */
function PaperFit({ buildings, views, paper, planScaleOf, elevationScaleOf, fitShow, showPlan, showElevations }: FitProps) {
  const fits = useMemo(
    () =>
      buildings.map((b) => {
        const planScale = planScaleOf(b.id)
        const elevationScale = elevationScaleOf(b.id)
        const plans = planExtents(b, planScale, { ...fitShow, supports: false })
        const sides = (views.get(b.id) ?? []).map((v) => elevationLayout(b, v, undefined, elevationScale).extent)
        return {
          name: b.name,
          planScale,
          elevationScale,
          planPages: planExtents(b, planScale, fitShow).reduce((n, e) => n + tileDrawing(e.w, e.h, paper, planScale).length, 0),
          elevationPages: sides.reduce((n, e) => n + tileDrawing(e.w, e.h, paper, elevationScale).length, 0),
          smallest: smallestPaper(Math.max(...plans.map((e) => e.w)), Math.max(...plans.map((e) => e.h)), planScale),
        }
      }),
    [buildings, views, paper, planScaleOf, elevationScaleOf, fitShow],
  )
  if (!fits.length || !(showPlan || showElevations)) return null
  const pages = (n: number) => `${n} page${n === 1 ? '' : 's'}`
  return (
    <p className="sheets-fit" aria-live="polite">
      {fits.map((f) => {
        const parts = [showPlan && `plan ${pages(f.planPages)} at ${SCALE_LABEL[f.planScale]}`, showElevations && `elevations ${pages(f.elevationPages)} at ${SCALE_LABEL[f.elevationScale]}`].filter(Boolean).join(', ')
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

/** A floor plan's extent with the room its section marks take, when the sections are shown. */
const withCutMarks = (e: Extent, scale: Scale, sections: boolean): Extent => (sections ? padExtent(e, cutMarkPadFt(scale)) : e)

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
