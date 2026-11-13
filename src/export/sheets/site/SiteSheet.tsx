import { memo, useId, useLayoutEffect, useRef } from 'react'
import type { Ground, SiteEarthworks } from '../../../site/earthworks/earthworks'
import type { Site } from '../../../site/types'
import type { Environment, Plan, PlanObject, Setbacks } from '../../../store/types'
import { Page, TiledDrawing, type Extent, type PageInfo } from '../Page'
import { PAPERS, MARGIN_IN, type PaperId, type SiteScale } from '../types'
import { siteAnnotate, shoreDistance, type SiteAnnotations } from './siteAnnotate'
import { insidePoly } from './siteGeom'
import { bankTicks, hatchWhere, stipple, waterLines } from './siteHatch'
import { fitNotes, NOTES_GAP_IN, NOTES_IN, siteLayout, sitePens, turnModel, type SiteLayout, type SitePens } from './siteLayout'
import { SiteDrawing, type SiteTextures } from './SiteMarks'
import { siteSheetModel, type SiteSheetModel } from './siteModel'
import type { SiteNotes } from './siteNotes'
import { SiteNotesColumn } from './NotesColumn'

/** How far out the water lines run from the lot line at the water, feet. */
const WATER_OFFSETS_FT = [2.5, 5.5, 9.5]
/** Pads that read as gravel and get the stipple. */
const GRAVEL = /gravel|drive|lane|park/i
/** The lot, as the old site plan's title block named it. */
export const SITE_ADDRESS = '1484 Islandale Road, Lopez Island, WA'

/** Meadow tufts this far apart, printed inches. */
const TUFT_IN = 0.16
/** A glass roof's grid and a metal roof's standing seams, feet apart (the old site plan's 2.5 ft grid; seams 16 in, or wider when they'd print closer than 1/20 in). */
const GLASS_GRID_FT = 2.5
const SEAM_FT = 16 / 12

const roofsWith = (m: SiteSheetModel, finish: string) => m.buildings.flatMap((b) => b.roofs.filter((r) => r.finish === finish))
const shrinkPoly = (poly: readonly (readonly [number, number])[], k: number): [number, number][] => {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length
  return poly.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k])
}
const boxExtent = (poly: readonly (readonly [number, number])[]): Extent => {
  const xs = poly.map((p) => p[0])
  const ys = poly.map((p) => p[1])
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

/** Hatch angles on the sheet: the buffer one way, the side setback the other. */
const SHORE_HATCH_DEG = -45
const SIDE_HATCH_DEG = 45

export interface SiteSheetInput {
  readonly plan: Plan
  readonly site: Site
  readonly setbacks: Setbacks
  readonly environment: Environment
  /** The ground as useEarthworks gives the app's panels. */
  readonly works: SiteEarthworks
  readonly ground: Ground
}

export interface SiteSheetBuild {
  readonly model: SiteSheetModel
  readonly layout: SiteLayout
  readonly pens: SitePens
  readonly textures: SiteTextures
  readonly annotations: SiteAnnotations
}

const objectsOf = (plan: Plan): PlanObject[] => plan.order.map((id) => plan.objects[id]).filter((o): o is PlanObject => o !== undefined)

/** Everything the site sheet draws, worked out once: model, page layout, textures and words (the notes are worked out apart, see siteNotes). */
export function buildSiteSheet(input: SiteSheetInput, paper: PaperId, scale: SiteScale, northUp: boolean): SiteSheetBuild {
  const raw = siteSheetModel({ objects: objectsOf(input.plan), site: input.site, setbacks: input.setbacks, environment: input.environment, works: input.works, ground: input.ground })
  const layout = siteLayout(raw, paper, scale, northUp)
  const model = turnModel(raw, layout.frame)
  const pens = sitePens(scale)
  const e = layout.extent
  const onLand = (p: readonly [number, number]) => insidePoly(model.ring, p)
  const textures: SiteTextures = {
    shoreHatch: hatchWhere((p) => model.bandAt(p) === 'shore', e, pens.hatchShore, SHORE_HATCH_DEG, pens.hatchStep),
    sideHatch: hatchWhere((p) => model.bandAt(p) === 'side', e, pens.hatchSide, SIDE_HATCH_DEG, pens.hatchStep),
    water: waterLines(model.shoreline, onLand, WATER_OFFSETS_FT),
    bankTicks: model.topOfBank.flatMap((l) => bankTicks(l, shoreDistance(model), 0.07 / scale, 0.045 / scale)),
    gravel: model.things.filter((t) => t.kind === 'pad' && GRAVEL.test(t.name)).flatMap((t, i) => stipple(t.outline, (0.05 / scale) ** 2, 7919 * (i + 1))),
    // shrunk toward the middle for a margin, then kept to the true outline (a concave shape's shrunk copy can poke out of it)
    tufts: model.things.filter((t) => t.kind === 'meadow').flatMap((t, i) => stipple(shrinkPoly(t.outline, 0.9), (TUFT_IN / scale) ** 2, 104729 * (i + 1)).filter((p) => insidePoly(t.outline, p))),
    sodTufts: roofsWith(model, 'sod').flatMap((r, i) => stipple(shrinkPoly(r.eave, 0.9), (TUFT_IN * 0.8 / scale) ** 2, 1299709 * (i + 1)).filter((p) => insidePoly(r.eave, p))),
    water2: model.things.filter((t) => t.kind === 'pond' || t.kind === 'pool').flatMap((t) => {
      const inner = shrinkPoly(t.outline, t.kind === 'pool' ? 0.84 : 0.9)
      return hatchWhere((p) => insidePoly(inner, p) && insidePoly(t.outline, p), boxExtent(inner), 0.07 / scale, 0, pens.hatchStep)
    }),
    roofHatch: [
      ...roofsWith(model, 'glass').flatMap((r) => [45, -45].flatMap((deg) => hatchWhere((p) => insidePoly(r.eave, p), boxExtent(r.eave), GLASS_GRID_FT, deg, pens.hatchStep))),
      ...[...roofsWith(model, 'metal'), ...roofsWith(model, 'copper')].flatMap((r) =>
        hatchWhere((p) => insidePoly(r.eave, p), boxExtent(r.eave), Math.max(SEAM_FT, 0.05 / scale), r.ridgeDir ? (Math.atan2(r.ridgeDir[1], r.ridgeDir[0]) * 180) / Math.PI + 90 : 0, pens.hatchStep),
      ),
    ],
  }
  return { model, layout, pens, textures, annotations: siteAnnotate(model, pens, e, scale) }
}

interface Props {
  readonly build: SiteSheetBuild
  readonly notes: SiteNotes
  /** The notes column was measured running past the page beside the drawing: they take a page of their own. */
  readonly notesTooTall: boolean
  /** Told when the notes column, drawn beside the drawing, turns out taller than the page holds. */
  readonly onNotesTooTall: () => void
  readonly paper: PaperId
  readonly scale: SiteScale
  readonly planName: string
}

function DrawingSvg({ build, extent, scale }: { readonly build: SiteSheetBuild; readonly extent: Extent; readonly scale: SiteScale }) {
  const clipId = `site-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <svg
      // its own class, not .sheet-svg: the building sheets' tests and styles find a building's drawing as the first .sheet-svg
      className="site-svg"
      style={{ display: 'block', flex: 'none', maxWidth: 'none' }}
      width={`${extent.w * scale}in`}
      height={`${extent.h * scale}in`}
      viewBox={`${extent.x} ${extent.y} ${extent.w} ${extent.h}`}
      role="img"
      aria-label="Site plan"
      data-testid="site-plan-svg"
      fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
    >
      <SiteDefs clipId={clipId} extent={extent} />
      <SiteDrawing m={build.model} a={build.annotations} t={build.textures} pens={build.pens} clipId={clipId} />
    </svg>
  )
}

function SiteDefs({ clipId, extent }: { readonly clipId: string; readonly extent: Extent }) {
  return (
    <defs>
      <clipPath id={clipId}>
        <rect x={extent.x} y={extent.y} width={extent.w} height={extent.h} />
      </clipPath>
    </defs>
  )
}

/** The site plan: the lot at a site scale with its notes beside it, or on a page of their own when the drawing needs the room. */
/**
 * Memoised: its props are the modal's memoised build and notes and plain
 * values, so toggling a building sheet (Supports, Rooms …) doesn't redraw the
 * site plan's thousands of lines.
 */
export const SiteSheet = memo(SiteSheetPages)

function SiteSheetPages({ build, notes, notesTooTall, onNotesTooTall, paper, scale, planName }: Props) {
  const layout = fitNotes(build.layout, notes, scale, notesTooTall)
  const besideRef = useRef<HTMLDivElement>(null)
  // measure the notes column as drawn: if it runs past the drawing area (which hides overflow), it goes to a page of its own
  useLayoutEffect(() => {
    const row = besideRef.current
    const column = row?.querySelector<HTMLElement>('[data-testid=site-notes]')
    const area = row?.closest<HTMLElement>('.sheet-draw')
    if (column && area && column.getBoundingClientRect().height > area.clientHeight + 0.5) onNotesTooTall()
  }, [build, notes, paper, scale, layout.mode, onNotesTooTall])
  const info: PageInfo = { paper, scale, planName, buildingName: SITE_ADDRESS, sheetTitle: 'Site plan', northDeg: layout.frame.northDeg }
  const notesPage = (
    <Page {...info} sheetTitle="Site plan · notes" northDeg={null} flow>
      <SiteNotesColumn notes={notes} sun={build.model.sun} columns={3} widthIn={PAPERS[paper].w - 2 * MARGIN_IN} />
    </Page>
  )
  if (layout.mode === 'beside') {
    return (
      <Page {...info}>
        <div ref={besideRef} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: `${NOTES_GAP_IN}in`, width: '100%', height: '100%' }}>
          <div style={{ alignSelf: 'center' }}>
            <DrawingSvg build={build} extent={layout.extent} scale={scale} />
          </div>
          <SiteNotesColumn notes={notes} sun={build.model.sun} widthIn={NOTES_IN} />
        </div>
      </Page>
    )
  }
  if (layout.mode === 'notesPage') {
    return (
      <>
        <Page {...info}>
          <DrawingSvg build={build} extent={layout.extent} scale={scale} />
        </Page>
        {notesPage}
      </>
    )
  }
  return (
    <>
      <TiledDrawing info={info} extent={layout.extent} label="Site plan">
        <TiledSite build={build} />
      </TiledDrawing>
      {notesPage}
    </>
  )
}

function TiledSite({ build }: { readonly build: SiteSheetBuild }) {
  // no clip here: each tile's own viewBox crops it, and one clip path per tile would repeat its id
  return <SiteDrawing m={build.model} a={build.annotations} t={build.textures} pens={build.pens} clipId={null} />
}
