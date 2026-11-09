import { useId } from 'react'
import type { Ground, SiteEarthworks } from '../../../site/earthworks/earthworks'
import type { Site } from '../../../site/types'
import type { Environment, Layers, Plan, PlanObject, Setbacks } from '../../../store/types'
import { Page, TiledDrawing, type Extent, type PageInfo } from '../Page'
import { PAPERS, MARGIN_IN, type PaperId, type SiteScale } from '../types'
import { siteAnnotate, shoreDistance, type SiteAnnotations } from './siteAnnotate'
import { insidePoly } from './siteGeom'
import { bankTicks, hatchWhere, stipple, waterLines } from './siteHatch'
import { NOTES_GAP_IN, NOTES_IN, siteLayout, sitePens, turnModel, type SiteLayout, type SitePens } from './siteLayout'
import { SiteDrawing, type SiteTextures } from './SiteMarks'
import { siteSheetModel, type SiteSheetModel } from './siteModel'
import { siteNotes, type SiteNotes } from './siteNotes'
import { SiteNotesColumn } from './NotesColumn'

/** How far out the water lines run from the OHWM, feet. */
const WATER_OFFSETS_FT = [2.5, 5.5, 9.5]
/** Pads that read as gravel and get the stipple. */
const GRAVEL = /gravel|drive|lane|park/i
/** Hatch angles on the sheet: the buffer one way, the side setback the other. */
const SHORE_HATCH_DEG = -45
const SIDE_HATCH_DEG = 45

export interface SiteSheetInput {
  readonly plan: Plan
  readonly site: Site
  readonly setbacks: Setbacks
  readonly environment: Environment
  readonly layers?: Layers
  /** The ground as useEarthworks gives the app's panels. */
  readonly works: SiteEarthworks
  readonly ground: Ground
}

export interface SiteSheetBuild {
  readonly model: SiteSheetModel
  readonly notes: SiteNotes
  readonly layout: SiteLayout
  readonly pens: SitePens
  readonly textures: SiteTextures
  readonly annotations: SiteAnnotations
}

const objectsOf = (plan: Plan): PlanObject[] => plan.order.map((id) => plan.objects[id]).filter((o): o is PlanObject => o !== undefined)

/** Everything the site sheet draws, worked out once: model, notes, page layout, textures and words. */
export function buildSiteSheet(input: SiteSheetInput, paper: PaperId, scale: SiteScale, northUp: boolean): SiteSheetBuild {
  const raw = siteSheetModel({ objects: objectsOf(input.plan), site: input.site, setbacks: input.setbacks, environment: input.environment, works: input.works, ground: input.ground })
  const notes = siteNotes({ plan: input.plan, site: input.site, setbacks: input.setbacks, layers: input.layers, routeGround: input.ground })
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
  }
  return { model, notes, layout, pens, textures, annotations: siteAnnotate(model, pens, e, scale) }
}

interface Props {
  readonly build: SiteSheetBuild
  readonly paper: PaperId
  readonly scale: SiteScale
  readonly planName: string
}

function DrawingSvg({ build, extent, scale }: { readonly build: SiteSheetBuild; readonly extent: Extent; readonly scale: SiteScale }) {
  const clipId = `site-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <svg
      className="sheet-svg"
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
export function SiteSheet({ build, paper, scale, planName }: Props) {
  const { layout } = build
  const info: PageInfo = { paper, scale, planName, buildingName: 'Islandale · Lopez Island', sheetTitle: 'Site plan', northDeg: layout.frame.northDeg }
  const notesPage = (
    <Page {...info} sheetTitle="Site plan · notes" northDeg={null} flow>
      <SiteNotesColumn notes={build.notes} sun={build.model.sun} columns={3} widthIn={PAPERS[paper].w - 2 * MARGIN_IN} />
    </Page>
  )
  if (layout.mode === 'beside') {
    return (
      <Page {...info}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: `${NOTES_GAP_IN}in`, width: '100%', height: '100%' }}>
          <div style={{ alignSelf: 'center' }}>
            <DrawingSvg build={build} extent={layout.extent} scale={scale} />
          </div>
          <SiteNotesColumn notes={build.notes} sun={build.model.sun} widthIn={NOTES_IN} />
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
  const clipId = `site-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <>
      <SiteDefs clipId={clipId} extent={build.layout.extent} />
      <SiteDrawing m={build.model} a={build.annotations} t={build.textures} pens={build.pens} clipId={clipId} />
    </>
  )
}
