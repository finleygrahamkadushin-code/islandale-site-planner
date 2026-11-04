import type { LocalPoint } from '../../buildings/footprint'
import { buildingToMass, massToBuilding, type Mass } from '../../buildings/masses'
import type { FittedArc, SheetEllipse } from './types'

/**
 * An ellipse part, exactly (centre, axes, turn), and the draftsman's
 * four-centre construction of it: two small arcs swung at the ends of the
 * long axis and two large ones at the ends of the short axis, each pair
 * meeting on the line through their centres so the curve has no kink. The
 * small radius is chosen to keep the four arcs as close to the true ellipse
 * as the construction allows.
 */

/** Used only when every outline vertex lies within this of the four arcs, feet (1/16" on paper at 1/4" = 1'-0"); else the outline's own fitted arcs stand. */
export const FOUR_CENTRE_MAX_FT = 0.25
/** Axes closer than this make a circle, feet. */
const ROUND_FT = 1 / 48
const SEARCH_STEPS = 200
const SAMPLES = 180
const DEG = 180 / Math.PI

interface FourCentre {
  /** Small radius at the ends of the long axis, large at the ends of the short. */
  readonly r1: number
  readonly r2: number
  /** Turn from the long axis to the line joining the centres, radians: where the arcs meet. */
  readonly phi: number
}

/** The large radius that meets r1 without a kink, for semi-axes a ≥ b. */
const largeRadius = (a: number, b: number, r1: number) => (a * a + b * b - 2 * a * r1) / (2 * (b - r1))

/** Distance from a point (long axis U, short axis V, first quadrant) to the four-centre curve. */
function offCurve(a: number, b: number, fc: FourCentre, u: number, v: number): number {
  const c1u = a - fc.r1
  const c2v = b - fc.r2
  const onLarge = Math.atan2(v - c2v, u) >= Math.atan2(-c2v, c1u)
  return onLarge ? Math.abs(Math.hypot(u, v - c2v) - fc.r2) : Math.abs(Math.hypot(u - c1u, v) - fc.r1)
}

function worstOff(a: number, b: number, fc: FourCentre): number {
  let worst = 0
  for (let k = 0; k <= SAMPLES; k++) {
    const t = ((Math.PI / 2) * k) / SAMPLES
    worst = Math.max(worst, offCurve(a, b, fc, a * Math.cos(t), b * Math.sin(t)))
  }
  return worst
}

function construction(a: number, b: number, r1: number): FourCentre {
  const r2 = largeRadius(a, b, r1)
  return { r1, r2, phi: Math.atan2(r2 - b, a - r1) }
}

/** The four-centre construction of semi-axes a > b closest to the ellipse: r1 between the ellipse's own end curvature b²/a and b. */
export function fourCentre(a: number, b: number): FourCentre & { readonly errorFt: number } {
  const lo = (b * b) / a
  let best = construction(a, b, (lo + b) / 2)
  let bestErr = worstOff(a, b, best)
  for (let k = 1; k < SEARCH_STEPS; k++) {
    const fc = construction(a, b, lo + ((b - lo) * k) / SEARCH_STEPS)
    const err = worstOff(a, b, fc)
    if (err < bestErr) {
      best = fc
      bestErr = err
    }
  }
  return { ...best, errorFt: bestErr }
}

/** The ellipse a part is, in the building frame, with how close its four-centre arcs come (null when they are not used); null for any other shape. */
export function ellipseOf(m: Mass, fourCentreErrorFt: number | null): SheetEllipse | null {
  if (m.shape !== 'ellipse') return null
  return { centre: massToBuilding(m, [0, 0]), widthFt: m.w, depthFt: m.d, rotDeg: m.rot, fourCentreErrorFt }
}

/**
 * The four arcs of an ellipse part, each over the outline edges whose
 * middles lie in its sector, building frame; null for a circle (one fitted
 * arc says it all), or when the construction strays past FOUR_CENTRE_MAX_FT
 * from the drawn outline.
 */
export function fourCentreArcs(m: Mass, outline: readonly LocalPoint[]): { readonly arcs: FittedArc[]; readonly errorFt: number } | null {
  const p = m.w / 2
  const q = m.d / 2
  if (m.shape !== 'ellipse' || Math.abs(p - q) < ROUND_FT || outline.length < 8) return null
  const wide = p >= q
  const a = Math.max(p, q)
  const b = Math.min(p, q)
  const fc = fourCentre(a, b)
  // canonical (u along the long axis, v along the short) ↔ the mass frame
  const toMass = (u: number, v: number): LocalPoint => (wide ? [u, v] : [v, u])
  const fromMass = ([x, z]: LocalPoint): [number, number] => (wide ? [x, z] : [z, x])
  // arcs 0..3: +u end (small), +v end (large), −u end, −v end
  const centres: LocalPoint[] = [toMass(a - fc.r1, 0), toMass(0, b - fc.r2), toMass(-(a - fc.r1), 0), toMass(0, -(b - fc.r2))]
  const radii = [fc.r1, fc.r2, fc.r1, fc.r2]
  const sweeps = [2 * fc.phi, Math.PI - 2 * fc.phi, 2 * fc.phi, Math.PI - 2 * fc.phi]
  const local = outline.map((pt) => fromMass(buildingToMass(m, pt)))
  const sectorOf = (i: number): number => {
    const s = local[i]
    const e = local[(i + 1) % local.length]
    const u = (s[0] + e[0]) / 2
    const v = (s[1] + e[1]) / 2
    const onLarge = Math.atan2(Math.abs(v) - (b - fc.r2), Math.abs(u)) >= Math.atan2(fc.r2 - b, a - fc.r1)
    return onLarge ? (v >= 0 ? 1 : 3) : u >= 0 ? 0 : 2
  }
  const sector = local.map((_, i) => sectorOf(i))
  const start = sector.findIndex((s, i) => s !== sector[(i - 1 + sector.length) % sector.length])
  if (start < 0) return null
  const runs: { k: number; edges: number[] }[] = []
  for (let j = 0; j < sector.length; j++) {
    const i = (start + j) % sector.length
    const last = runs[runs.length - 1]
    if (last && last.k === sector[i]) last.edges.push(i)
    else runs.push({ k: sector[i], edges: [i] })
  }
  if (runs.length !== 4 || new Set(runs.map((r) => r.k)).size !== 4) return null
  const arcs = runs.map(({ k, edges }): FittedArc => {
    const centre = massToBuilding(m, centres[k])
    const verts = [outline[edges[0]], ...edges.map((i) => outline[(i + 1) % outline.length])]
    const off = Math.max(...verts.map((v) => Math.abs(Math.hypot(v[0] - centre[0], v[1] - centre[1]) - radii[k])))
    return {
      fromEdge: edges[0],
      toEdge: edges[edges.length - 1],
      centre,
      radiusFt: radii[k],
      sweepDeg: sweeps[k] * DEG,
      lengthFt: radii[k] * sweeps[k],
      chordFt: 2 * radii[k] * Math.sin(sweeps[k] / 2),
      fitErrorFt: off,
    }
  })
  const errorFt = Math.max(...arcs.map((x) => x.fitErrorFt))
  return errorFt <= FOUR_CENTRE_MAX_FT ? { arcs: arcs.sort((x, y) => x.fromEdge - y.fromEdge), errorFt } : null
}
