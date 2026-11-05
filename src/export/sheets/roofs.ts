import type { LocalPoint } from '../../buildings/footprint'
import { prowOutline, SHELL_M } from '../../buildings/roofs/fittedRoof'
import type { V3 } from '../../buildings/geom'
import { massPoly, massToBuilding, type Mass } from '../../buildings/masses'
import { offsetOutline } from '../../buildings/outline'
import { buildRoof, normaliseRoof, offsetPolygon, roofForm, roofParamsOf, sculptOptionsOf, tipColumnTop, TIP_POST, type RoofForm, type RoofMesh } from '../../buildings/roofs/roof'
import { roofIsolines, roofLineSets, sculptedSurface, type SculptedSurface } from '../../buildings/roofs/sculptRoof'
import { ftToM, mToFt } from '../../site/units'
import { chainSegments, roofCreases, roofFaces, straighten, type Crease, type RoofFace } from './roofCreases'
import type { SheetRoof, SheetRoofLevel, SheetRoofLine, SheetRoofLineKind } from './types'

/**
 * A part's roof on the sheets, from the very roof the scene builds (the
 * same parameters, finish and builder): its eave, named heights, slopes,
 * plan linework, the slope of a one-plane roof and a prow shell's tip
 * column.
 */

const FT = 0.3048
/** Heights closer than this are one level, feet (1 in). */
const SAME_FT = 1 / 12
/** Slopes are listed one by one up to this many; past it the stored pitch is given as nominal. */
const MAX_SLOPES = 3
/** A slope counts when its faces cover more than this share of the roof on plan. */
const SLOPE_SHARE = 0.02
/** Faces of one plane: normals within this of their mean, degrees. */
const PLANE_DEG = 2
/** A shell's lip: the run of its eave at least this share of the way up to the rim's highest point. */
const LIP_SHARE = 0.5
/** Plan linework points closer than this are one point, and a point this near the line through its neighbours is left out, feet. */
const JOIN_FT = 1e-3
const STRAIGHT_FT = 0.01
/** The slope arrow runs this share of the roof's length down the slope, beside its centre by this share of its half-width. */
const ARROW_RUN = 0.5
const ARROW_ASIDE = 0.35

const level = (label: string, riseM: number): SheetRoofLevel => ({ label, riseFt: mToFt(riseM) })
const fmtSlope = (v: number) => (Math.abs(v - Math.round(v)) < 0.005 ? String(Math.round(v)) : v.toFixed(2))

/** Building-frame feet from the roof's own metres (x, z of a mass-local point). */
const toBuilding = (m: Mass, x: number, z: number): LocalPoint => massToBuilding(m, [x / FT, z / FT])

/**
 * The eave line, building frame, as each builder grows it: a prow's own
 * outline, a sculpted slab's outline, a flat or pyramid roof's mitred ring,
 * else the walls grown by the overhang (the box of a rectangle, the fitted
 * roof's outline).
 */
function eaveOf(m: Mass, poly: readonly LocalPoint[], form: RoofForm, sculpted: SculptedSurface | null): LocalPoint[] {
  const metres = (P: readonly (readonly [number, number])[]) => P.map(([x, z]) => toBuilding(m, x, z))
  if (form === 'prow') return metres(prowOutline(poly, m.overhang, m.roofPts))
  if (form === 'sculpted' && sculpted) return metres(sculpted.outline)
  const ring = form === 'flat' || form === 'pyramid' ? offsetPolygon(poly, m.overhang) : offsetOutline(poly, m.overhang)
  return ring.map((p) => massToBuilding(m, p))
}

/** Its slopes as rise per 12: each slope covering a fair share of the roof, steepest first; the stored pitch as nominal when there are too many (a faceted or dipped roof). */
function slopesOf(faces: readonly RoofFace[], pitch: number): string {
  const total = faces.reduce((s, f) => s + f.planArea, 0)
  if (total <= 0) return `${pitch}:12`
  const share = new Map<number, number>()
  for (const f of faces) {
    const s = Math.round((Math.hypot(f.n[0], f.n[2]) / f.n[1]) * 12 * 100) / 100
    share.set(s, (share.get(s) ?? 0) + f.planArea / total)
  }
  const kept = [...share].filter(([, a]) => a > SLOPE_SHARE).map(([s]) => s).sort((a, b) => b - a)
  if (kept.length === 1 && kept[0] === 0) return 'flat'
  if (kept.length === 0 || kept.length > MAX_SLOPES) return `${pitch}:12, nominal`
  return kept.map((s) => `${fmtSlope(s)}:12`).join(' / ')
}

/** Ridges, hips, valleys and (on a gambrel, the level creases below its ridge) breaks, joined into lines, building frame. */
function creaseLines(m: Mass, creases: readonly Crease[], gambrel: boolean, rise: number): SheetRoofLine[] {
  const kindOf = (c: Crease): SheetRoofLineKind => (gambrel && c.kind === 'ridge' && Math.max(c.a[1], c.b[1]) < rise - ftToM(SAME_FT) ? 'break' : c.kind)
  const kinds: SheetRoofLineKind[] = ['ridge', 'break', 'hip', 'valley']
  return kinds.flatMap((kind) => {
    const segs = creases.filter((c) => kindOf(c) === kind).map((c) => [toBuilding(m, c.a[0], c.a[2]), toBuilding(m, c.b[0], c.b[2])] as const)
    return chainSegments(segs, JOIN_FT).map((pts) => ({ kind, pts: straighten(pts, STRAIGHT_FT) }))
  })
}

/** A roof of one sloping plane (a shed): an arrow down its slope beside its centre, from its high side to its low. */
function slopeArrow(m: Mass, faces: readonly RoofFace[], creases: readonly Crease[], eave: readonly LocalPoint[]): SheetRoof['slope'] {
  if (creases.length || !faces.length) return null
  const sum = faces.reduce<V3>((s, f) => [s[0] + f.n[0] * f.planArea, s[1] + f.n[1] * f.planArea, s[2] + f.n[2] * f.planArea], [0, 0, 0])
  const l = Math.hypot(...sum)
  const n: V3 = [sum[0] / l, sum[1] / l, sum[2] / l]
  const cos = Math.cos((PLANE_DEG * Math.PI) / 180)
  const flat = Math.hypot(n[0], n[2])
  if (flat < 1e-3 || faces.some((f) => f.n[0] * n[0] + f.n[1] * n[1] + f.n[2] * n[2] < cos)) return null
  // downhill on plan, in the mass's frame (its normal leans that way), turned with the eave into the building frame
  const a = (m.rot * Math.PI) / 180
  const dx = (n[0] / flat) * Math.cos(a) + (n[2] / flat) * Math.sin(a)
  const dz = -(n[0] / flat) * Math.sin(a) + (n[2] / flat) * Math.cos(a)
  const c: LocalPoint = [eave.reduce((s, p) => s + p[0], 0) / eave.length, eave.reduce((s, p) => s + p[1], 0) / eave.length]
  const along = eave.map((p) => (p[0] - c[0]) * dx + (p[1] - c[1]) * dz)
  const across = eave.map((p) => -(p[0] - c[0]) * dz + (p[1] - c[1]) * dx)
  const lo = Math.min(...along) * ARROW_RUN
  const hi = Math.max(...along) * ARROW_RUN
  const off = Math.max(...across) * ARROW_ASIDE
  const at = (t: number): LocalPoint => [c[0] + dx * t - dz * off, c[1] + dz * t + dx * off]
  return { high: at(lo), low: at(hi) }
}

/** A classic roof's heights by its type, from its mesh: eave and ridge, a shed's low and high eaves, a butterfly's valley and eaves, a gambrel's breaks, a pyramid's apex, a flat roof's top; a prow shell's dipped tip and its column. */
function classicLevels(m: Mass, type: string, built: RoofMesh, creases: readonly Crease[]): SheetRoofLevel[] {
  const ys = built.roof.positions.filter((_, i) => i % 3 === 1)
  const low = ys.length ? Math.min(...ys) : 0
  const top = built.rise
  const named: SheetRoofLevel[] =
    type === 'shed' ? [level('low eave', 0), level('high eave', top)]
      : type === 'butterfly' ? [level('valley', low), level('eaves', top)]
        : type === 'flat' ? [level('eave', 0), level('roof top', top)]
          : type === 'pyramid' ? [level('eave', 0), level('apex', top)]
            : [level('eave', 0), ...(type === 'gambrel' ? breakLevels(creases, top) : []), level('ridge', top)]
  const dipped = type !== 'butterfly' && mToFt(low) < -SAME_FT
  const tipLevels = dipped ? [level(type === 'prow' ? 'tip eave' : 'low point', low), ...(m.vault && type === 'prow' ? [level('tip eave, underside', low - SHELL_M)] : [])] : []
  const column = built.tip ? [level('tip column top', tipColumnTop(built.tip, ftToM(m.h)))] : []
  return [...named, ...tipLevels, ...column]
}

/** A gambrel's break heights: its level creases below the ridge, one per height. */
function breakLevels(creases: readonly Crease[], top: number): SheetRoofLevel[] {
  const ys = creases.filter((c) => c.kind === 'ridge').map((c) => Math.max(c.a[1], c.b[1])).filter((y) => y < top - ftToM(SAME_FT))
  const distinct = [...ys].sort((a, b) => a - b).filter((y, i, a) => i === 0 || mToFt(y - a[i - 1]) >= SAME_FT)
  return distinct.map((y) => level('gambrel break', y))
}

/** A sculpted roof's heights from its rim: eave and crown; a shell's low end and its high open lip (the rim's highest underside, and the slab's top there); a saddle's low and high corners. */
function sculptedLevels(s: SculptedSurface, rise: number): SheetRoofLevel[] {
  const ring = s.surf.ring
  if (!ring.length) return [level('crown', rise)]
  const lowest = ring.reduce((a, r) => (r.h < a.h ? r : a), ring[0])
  const highest = ring.reduce((a, r) => (r.h > a.h ? r : a), ring[0])
  const rim = highest.h + highest.th
  const crown = mToFt(rise - rim) >= SAME_FT ? [level('crown', rise)] : []
  if (s.type === 'shell') return [level('eave, low end', lowest.h), level('lip, underside', highest.h), level('lip, top', rim), ...crown]
  if (s.type === 'saddle') return [level('low corners', lowest.h), level('high corners, underside', highest.h), level('high corners, top', rim), ...crown]
  return [level('eave', lowest.h), level('crown', rise)]
}

/** A sculpted roof's plan linework as the legacy plan drew it (roofLineSets' plan set): dome and sod contours, vault crown and ribs, shell ribs and contours, saddle rulings; and a shell's lip. */
function sculptedLines(m: Mass, s: SculptedSurface): SheetRoofLine[] {
  const sets = roofLineSets(s.surf, s.finish, true).flatMap((set) => {
    const v = roofIsolines(s.surf, set.val, set.levels, 0)
    const segs = Array.from({ length: Math.floor(v.length / 2) }, (_, k) => [toBuilding(m, v[2 * k][0], v[2 * k][2]), toBuilding(m, v[2 * k + 1][0], v[2 * k + 1][2])] as const)
    const kind: SheetRoofLineKind = set.kind === 'contour' || set.kind === 'crown' ? set.kind : 'rib'
    return chainSegments(segs, JOIN_FT).map((pts) => ({ kind, pts: straighten(pts, STRAIGHT_FT) }))
  })
  return s.type === 'shell' ? [...sets, ...lipLines(m, s)] : sets
}

/** A shell's lip: the runs of its eave standing well up off the wall top, building frame. */
function lipLines(m: Mass, s: SculptedSurface): SheetRoofLine[] {
  const ring = s.surf.ring
  const top = Math.max(0, ...ring.map((r) => r.h))
  if (top <= 0) return []
  const up = ring.map((r) => r.h >= top * LIP_SHARE)
  // start the walk round the rim at a point that is not on the lip, so each run is whole
  const start = up.findIndex((u) => !u)
  if (start < 0) return [{ kind: 'lip', pts: [...ring, ring[0]].map((r) => toBuilding(m, r.x, r.z)) }]
  const runs: LocalPoint[][] = []
  let run: LocalPoint[] = []
  for (let k = 1; k <= ring.length; k++) {
    const i = (start + k) % ring.length
    if (up[i]) run.push(toBuilding(m, ring[i].x, ring[i].z))
    else if (run.length) {
      runs.push(run)
      run = []
    }
  }
  return runs.filter((r) => r.length >= 2).map((pts) => ({ kind: 'lip', pts }))
}

/** A part's roof as the sheets draw and measure it; null for no roof. */
export function sheetRoof(m: Mass, finish: string | null): SheetRoof | null {
  const type = normaliseRoof(m.roof)
  const poly = massPoly(m)
  if (type === 'none' || poly.length < 3) return null
  const params = roofParamsOf(m, finish)
  const built = buildRoof(poly, params)
  const form = roofForm(type, poly)
  const s = form === 'sculpted' ? sculptedSurface(poly, sculptOptionsOf(params)) : null
  const eave = eaveOf(m, poly, form, s)
  const base = { type, pitch: m.pitch, finish, overhangFt: m.overhang, eave, riseFt: mToFt(built.rise) }
  if (form === 'sculpted') {
    const curl = type === 'shell' ? `, curl ${m.curl ?? 0.5}` : ''
    return { ...base, slopes: `curved${curl}`, levels: sortLevels(s ? sculptedLevels(s, built.rise) : [level('crown', built.rise)]), lines: s ? sculptedLines(m, s) : [], slope: null, tip: null }
  }
  const faces = roofFaces(built.roof)
  // a prow's dip bends its facets toward the tip without moving them on plan: their seams are read off the roof undipped
  const seamed = params.prow?.dip ? roofFaces(buildRoof(poly, { ...params, prow: { ...params.prow, dip: 0 } }).roof) : faces
  const creases = roofCreases(seamed)
  const tip = built.tip ? { at: toBuilding(m, built.tip.x, built.tip.z), diameterFt: mToFt(2 * TIP_POST.footR), topFt: mToFt(tipColumnTop(built.tip, ftToM(m.h))) } : null
  return {
    ...base,
    slopes: slopesOf(faces, m.pitch),
    levels: sortLevels(classicLevels(m, type, built, creases)),
    lines: creaseLines(m, creases, type === 'gambrel', built.rise),
    slope: slopeArrow(m, faces, creases, eave),
    tip,
  }
}

const sortLevels = (l: readonly SheetRoofLevel[]) => [...l].sort((a, b) => a.riseFt - b.riseFt)
