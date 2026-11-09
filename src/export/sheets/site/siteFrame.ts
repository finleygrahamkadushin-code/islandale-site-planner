/**
 * The site plan's sheet frame: how site feet (x east, y north) turn onto
 * the page (x right, y down). Turned so the lot's long side runs across the
 * sheet and its box is as small as it can be, or with north straight up.
 * Pure.
 */
import type { Extent } from '../Page'
import type { Pt } from '../svgDims'
import { boxOf, type Box } from './siteGeom'

export interface SiteFrame {
  /** The turn, degrees counter-clockwise, applied to the site before it is drawn. */
  readonly turnDeg: number
  /** Degrees clockwise from up that north points on the sheet (Page's north arrow). */
  readonly northDeg: number
  readonly toSheet: (p: Pt) => Pt
  readonly fromSheet: (p: Pt) => Pt
}

/** Turns are searched this finely, degrees, then refined. */
const COARSE_STEP = 1
const FINE_STEP = 0.05

/** A frame turned `turnDeg` counter-clockwise; sheet y runs down. */
export function frameAt(turnDeg: number): SiteFrame {
  const a = (turnDeg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return {
    turnDeg,
    // north (0, 1) lands on (−sin, −cos) on the sheet: that is −turn clockwise from up
    northDeg: normalise(-turnDeg),
    toSheet: ([x, y]) => [x * c - y * s, -(x * s + y * c)],
    fromSheet: ([u, v]) => [u * c - v * s, -u * s - v * c],
  }
}

const normalise = (deg: number) => {
  const d = (((deg % 360) + 360) % 360)
  return d > 180 ? d - 360 : d
}

const boxIn = (pts: readonly Pt[], f: SiteFrame): Box => boxOf(pts.map(f.toSheet))!

/**
 * The turn that gives the lot's smallest box with its long side across the
 * sheet, kept within ±90° so north points more up than down. Ties go to the
 * smaller turn.
 */
export function bestTurn(pts: readonly Pt[]): number {
  const cost = (deg: number) => {
    const b = boxIn(pts, frameAt(deg))
    const w = b.maxx - b.minx
    const h = b.maxy - b.miny
    // a portrait box costs its turned-round twin's area plus a penalty, so the landscape one always wins
    return w >= h ? w * h : w * h * 4
  }
  let best = 0
  let bestCost = cost(0)
  for (let d = -90 + COARSE_STEP; d <= 90; d += COARSE_STEP) {
    const c = cost(d)
    if (c < bestCost - 1e-9) {
      best = d
      bestCost = c
    }
  }
  const lo = best - COARSE_STEP
  for (let d = lo; d <= best + COARSE_STEP + 1e-9; d += FINE_STEP) {
    const c = cost(d)
    if (c < bestCost - 1e-9) {
      best = d
      bestCost = c
    }
  }
  // a turn past ±90° and the one half a turn round give the same box: keep the one with north pointing up
  const turn = Math.round(best * 100) / 100
  return turn > 90 ? turn - 180 : turn <= -90 ? turn + 180 : turn
}

/** The frame for the lot: turned to fit, or north up. */
export function siteFrame(lot: readonly Pt[], northUp: boolean): SiteFrame {
  return frameAt(northUp ? 0 : bestTurn(lot))
}

/** The drawing's extent on the sheet: everything drawn, plus a pad all round, feet. */
export function drawingExtent(points: readonly Pt[], frame: SiteFrame, padFt: number): Extent {
  const b = boxIn(points, frame)
  return { x: b.minx - padFt, y: b.miny - padFt, w: b.maxx - b.minx + 2 * padFt, h: b.maxy - b.miny + 2 * padFt }
}
