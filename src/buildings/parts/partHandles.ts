import { siteToLocal, type LocalPoint } from '../footprint'
import { buildingToMass, massBuildingPoly, massPoly, massToBuilding, type Mass } from '../masses'
import { MIN_PART_FT, RECT_EDGES } from './wingEdits'

/**
 * The maths behind the picked part's handles (legacy ext:wing-select):
 * edge squares that drag one side, a grip that moves a wing, a knob that
 * turns it, and arrow-key nudges. Building frame, feet; pure.
 *
 * Deliberate changes (PLAN.md): edges and the grip snap to 1 in, not 1 ft,
 * and the grip slides a wing along the host edge it touches.
 */

/** Edge and grip drags snap to the inch. */
export const SNAP_FT = 1 / 12
/** The knob turns in 5° steps. */
export const KNOB_STEP_DEG = 5
/** The knob sits this far out from the wing's front edge. */
export const KNOB_OUT_FT = 4
/** A wing edge this close to another part's edge, and as parallel as this, hangs off it. */
const HOST_NEAR_FT = 0.6
const HOST_PARALLEL = Math.sin((10 * Math.PI) / 180)
const round4 = (v: number) => Math.round(v * 1e4) / 1e4 + 0

/** Snap to `step` feet, or with snapping off keep a thousandth (legacy snapFt). */
export function snapFt(v: number, on: boolean, step = SNAP_FT): number {
  return on ? Math.round(v / step) * step : Math.round(v * 1000) / 1000
}

/** A rect part with four corners has edge handles. */
export function isRectPart(m: Pick<Mass, 'shape' | 'w' | 'd' | 'pts' | 'taper' | 'skew'>): boolean {
  return m.shape === 'rect' && massPoly(m as Mass).length === 4
}

/** The midpoint of edge i, building frame. */
export function edgeMid(m: Mass, i: number): LocalPoint {
  const P = massBuildingPoly(m)
  const a = P[i]
  const b = P[(i + 1) % P.length]
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

/** The outward direction of rect edge i, building frame. */
export function edgeNormal(m: Mass, i: number): LocalPoint {
  const [nx, nz] = RECT_EDGES[i]
  return massToBuilding({ ...m, dx: 0, dz: 0 }, [nx, nz])
}

/**
 * How far the pointer (building frame) has pulled rect edge i of the part
 * as it was when the drag began, feet out from where the edge was, snapped.
 */
export function edgeDeltaFt(m0: Mass, edge: number, pointer: LocalPoint, snap: boolean): number {
  const [nx, nz, key] = RECT_EDGES[edge]
  const [x, z] = buildingToMass(m0, pointer)
  return snapFt(x * nx + z * nz - m0[key] / 2, snap)
}

/**
 * A wing with rect edge i moved out by delta (legacy resizeWingEdge): at
 * least 3 ft, the opposite edge staying put. Null when the size would not
 * change.
 */
export function resizedWing(m0: Mass, edge: number, delta: number): Record<string, number> | null {
  const [nx, nz, key] = RECT_EDGES[edge]
  const size = round4(Math.max(MIN_PART_FT, m0[key] + delta))
  const applied = size - m0[key]
  if (Math.abs(applied) < 1e-9) return null
  const [sx, sz] = massToBuilding({ ...m0, dx: 0, dz: 0 }, [(nx * applied) / 2, (nz * applied) / 2])
  return { [key]: size, dx: round4(m0.dx + sx), dz: round4(m0.dz + sz) }
}

/**
 * The direction (building frame) of the edge of another part that wing mi
 * hangs off: the nearest edge lying along one of its own, within 0.6 ft and
 * 10°. Stairs and ramps are nobody's host. Null when it touches nothing.
 */
export function hostDirection(masses: readonly Mass[], mi: number): LocalPoint | null {
  const self = masses[mi]
  if (!self) return null
  const P = massBuildingPoly(self)
  let best: { d: number; u: LocalPoint } | null = null
  masses.forEach((m, j) => {
    if (j === mi || m.kind === 'stair' || m.kind === 'ramp') return
    const Q = massBuildingPoly(m)
    Q.forEach((A, k) => {
      const B = Q[(k + 1) % Q.length]
      const L = Math.hypot(B[0] - A[0], B[1] - A[1])
      if (L < 1e-6) return
      const U: LocalPoint = [(B[0] - A[0]) / L, (B[1] - A[1]) / L]
      P.forEach((a, i) => {
        const b = P[(i + 1) % P.length]
        const l = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (l < 1e-6) return
        if (Math.abs(((b[0] - a[0]) / l) * U[1] - ((b[1] - a[1]) / l) * U[0]) > HOST_PARALLEL) return
        const mid: LocalPoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        const t = Math.max(0, Math.min(L, (mid[0] - A[0]) * U[0] + (mid[1] - A[1]) * U[1]))
        const d = Math.hypot(A[0] + U[0] * t - mid[0], A[1] + U[1] * t - mid[1])
        if (d < HOST_NEAR_FT && (!best || d < best.d)) best = { d, u: U }
      })
    })
  })
  return (best as { d: number; u: LocalPoint } | null)?.u ?? null
}

/**
 * Where the grip puts a wing's centre: along its host edge from where it
 * started (the slide snapped to the inch), or anywhere on the ground with
 * each building axis snapped when it has no host.
 */
export function gripCentre(c0: LocalPoint, target: LocalPoint, host: LocalPoint | null, snap: boolean): LocalPoint {
  if (!host) return [round4(snapFt(target[0], snap)), round4(snapFt(target[1], snap))]
  const t = snapFt((target[0] - c0[0]) * host[0] + (target[1] - c0[1]) * host[1], snap)
  return [round4(c0[0] + host[0] * t), round4(c0[1] + host[1] * t)]
}

/** The knob, building frame: 4 ft beyond the wing's front edge. */
export function knobPoint(m: Mass): LocalPoint {
  return massToBuilding(m, [0, m.d / 2 + KNOB_OUT_FT])
}

/** The wing's turn with its front pointing at the pointer (legacy knobAngle), 5° steps or free. */
export function knobAngle(m: Pick<Mass, 'dx' | 'dz'>, pointer: LocalPoint, snap: boolean): number {
  const a = (Math.atan2(pointer[0] - m.dx, pointer[1] - m.dz) * 180) / Math.PI
  return snapFt(a, snap, KNOB_STEP_DEG)
}

/** A step east and north (metres) as a shift of a wing's dx, dz in its building's frame (legacy nudgeLocal), feet. */
export function nudgeLocal(rotationDeg: number, dE: number, dN: number): LocalPoint {
  const [x, z] = siteToLocal({ x: 0, n: 0 }, rotationDeg, [dE, dN])
  return [round4(x), round4(z)]
}

/**
 * The resize cursor for an edge whose outward normal points this way on
 * screen (legacy cursorFor): the angle folded to 0-180°.
 */
export function cursorFor(sx: number, sy: number): string {
  let a = (Math.atan2(sy, sx) * 180) / Math.PI
  a = ((a % 180) + 180) % 180
  if (a < 22.5 || a >= 157.5) return 'ew-resize'
  if (a < 67.5) return 'nwse-resize'
  if (a < 112.5) return 'ns-resize'
  return 'nesw-resize'
}
