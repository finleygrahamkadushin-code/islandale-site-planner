import type { LocalPoint } from '../footprint'
import { pointInPolygon } from '../foundation/foundation'
import { edgeName, massBuildingPoly, massPoly, massToBuilding, partName, wingMass, type Mass } from '../masses'
import { massWalls } from '../openings/openingEdits'
import type { CutData } from '../openings/openingLayout'
import { edgeFree, outwardNormal } from '../rails/railRules'
import { SLAB_M } from '../rails/rails'

/**
 * Adding parts to a cabin's edges (legacy ext:attach-core and
 * ext:attach-add): each edge of a mass with its walking surface, which
 * edges get a + chip, and how a new deck, porch, stair, ramp or door is
 * sized and placed off an edge. Building frame, feet; elevations metres.
 */

type Params = Record<string, unknown>
const FT = 0.3048
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const r3 = (v: number) => Math.round(v * 1000) / 1000
const isAccess = (m: Pick<Mass, 'kind'>) => m.kind === 'stair' || m.kind === 'ramp'

/** Ground and floor under one building, for walking surfaces and drops. */
export interface AttachSite {
  /** The building floor (a standalone deck: its top), metres. */
  readonly floor: number
  /** Ground under a building-local point (feet), metres. */
  readonly groundAt: (p: LocalPoint) => number
  /** The slab between the floor and the walking surface, metres (0 for a standalone deck). */
  readonly slabM?: number
}

/** One edge of a mass, building frame (legacy attach.edges). */
export interface PartEdge {
  readonly i: number
  readonly a: LocalPoint
  readonly b: LocalPoint
  readonly mid: LocalPoint
  /** Unit vector a → b. */
  readonly u: LocalPoint
  /** Outward unit normal. */
  readonly n: LocalPoint
  readonly lenFt: number
  /** Walking surface at the edge's midpoint, metres. */
  readonly z: number
}

/**
 * The walking surface of mass mi at a point of its own frame, metres: the
 * floor plus its level and slab, or for a stair or ramp the line from its
 * top (flush with the floor) down to its foot (legacy surfZ).
 */
export function surfaceAt(masses: readonly Mass[], mi: number, site: AttachSite, [, z]: LocalPoint): number {
  const m = masses[mi]
  const floor = site.floor + m.lvl * FT
  if (!isAccess(m)) return floor + (site.slabM ?? SLAB_M)
  const foot = m.footZ ?? site.groundAt(massToBuilding(m, [0, m.d / 2]))
  const t = clamp((z + m.d / 2) / m.d, 0, 1)
  return floor + ((Number.isFinite(foot) ? foot : floor) - floor) * t
}

/** Every edge of mass mi, building frame, with its walking surface. */
export function partEdges(masses: readonly Mass[], mi: number, site: AttachSite): PartEdge[] {
  const m = masses[mi]
  const own = massPoly(m)
  const P = massBuildingPoly(m)
  return P.map((a, i) => {
    const b = P[(i + 1) % P.length]
    const lenFt = Math.hypot(b[0] - a[0], b[1] - a[1])
    const u: LocalPoint = lenFt ? [(b[0] - a[0]) / lenFt, (b[1] - a[1]) / lenFt] : [1, 0]
    const oa = own[i]
    const ob = own[(i + 1) % own.length]
    const z = surfaceAt(masses, mi, site, [(oa[0] + ob[0]) / 2, (oa[1] + ob[1]) / 2])
    return { i, a, b, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], u, n: outwardNormal(P, i), lenFt, z }
  })
}

/** Outlines with more edges than this get thinned-out chips (legacy chipEdgesOfMass). */
const MAX_CHIP_EDGES = 12

/**
 * The edges of mass mi that get a + chip (legacy chipEdgesOfMass): none
 * on stairs and ramps, every free edge on an outline of 12 edges or fewer,
 * and on a longer (curved) one a free edge about every tenth of the way
 * round, at least 8 ft apart, with the old code's quirk kept.
 */
export function chipEdges(masses: readonly Mass[], mi: number): number[] {
  const m = masses[mi]
  if (!m || isAccess(m)) return []
  const P = massBuildingPoly(m)
  const free = (i: number) => edgeFree(masses, mi, i)
  if (P.length <= MAX_CHIP_EDGES) return P.flatMap((_, i) => (free(i) ? [i] : []))
  const lens = P.map((a, i) => Math.hypot(P[(i + 1) % P.length][0] - a[0], P[(i + 1) % P.length][1] - a[1]))
  const step = Math.max(8, lens.reduce((s, l) => s + l, 0) / 10)
  let acc = step / 2
  const out: number[] = []
  lens.forEach((L, i) => {
    if (acc <= L && free(i)) {
      out.push(i)
      acc = step
    } else acc -= L
    if (acc <= 0) acc = step
  })
  return out
}

export type AttachKind = 'deck' | 'porch' | 'stair' | 'ramp'
export const ATTACH_KINDS: readonly AttachKind[] = ['deck', 'porch', 'stair', 'ramp']
export const ACCESS_HOST_TEXT = 'Stairs and ramps join other things with Connect…'
export const NOT_FREE_TEXT = 'That edge is against another part of the building'
export const DOOR_WALLS_TEXT = 'Doors go on enclosed walls — pick a wall of the house or a closed wing'
export const NO_DOOR_ROOM_TEXT = 'No room for a door on that wall'
export const rampTooLongText = (needFt: number) => `Needs ${needFt} ft of ramp — use Connect to route it with landings`

/** A wing to add, or why not. */
export type AttachResult =
  | { readonly wing: Params; readonly overlaps: boolean; readonly dropFt: number }
  | { readonly reason: string }

/** Fields of each new kind that never change with the edge (legacy attachSpec). */
function kindFields(kind: AttachKind, mainH: number): Params {
  if (kind === 'deck') return { kind, open: true, h: 1, roof: 'none', pitch: 0, ridge: 'x', overhang: 0 }
  if (kind === 'porch') return { kind, open: true, h: Math.max(7, (mainH || 8) - 1), roof: 'shed', pitch: 3, ridge: 'x', overhang: 1 }
  return { kind, open: true, roof: 'none', h: 0, pitch: 0, ridge: 'x', overhang: 0 }
}

const STAIR_RUN_PER_FT = 1.6
const RAMP_SLOPE = 12
const RAMP_MAX_FT = 40

/**
 * How a new part is sized and placed off edge i of mass mi (legacy
 * attachSpec): its back edge on the host edge, its front pointing out, on
 * the host's level. A stair's run comes from the drop (1.6 ft of run per
 * foot), a ramp's from 1:12 (refused past 40 ft); if it overlaps another
 * part it slides along the edge a foot at a time to the first clear spot.
 */
export function attachSpec(masses: readonly Mass[], mi: number, i: number, kind: AttachKind, site: AttachSite, mainH: number): AttachResult {
  const host = masses[mi]
  if (!host) throw new Error(`no mass ${mi}`)
  if (isAccess(host)) return { reason: ACCESS_HOST_TEXT }
  if (!edgeFree(masses, mi, i)) return { reason: NOT_FREE_TEXT }
  const E = partEdges(masses, mi, site)[i]
  if (!E) throw new Error(`no edge ${i} of mass ${mi}`)
  const ground = (dist: number) => {
    const g = site.groundAt([E.mid[0] + E.n[0] * dist, E.mid[1] + E.n[1] * dist])
    return Number.isFinite(g) ? g : E.z
  }
  const dropAt = (dist: number) => Math.max(0, (E.z - ground(dist)) / FT)
  let w = 12
  let d = kind === 'porch' ? 8 : 10
  let dropFt = dropAt(d)
  if (kind === 'stair') {
    w = 5
    d = 10
    for (let k = 0; k < 3; k++) {
      dropFt = dropAt(d)
      d = clamp(Math.round(dropFt * STAIR_RUN_PER_FT), 6, 14)
    }
  } else if (kind === 'ramp') {
    w = 4
    d = 12
    let need = d
    for (let k = 0; k < 4; k++) {
      dropFt = dropAt(Math.min(d, RAMP_MAX_FT))
      need = Math.max(8, Math.ceil(dropFt * RAMP_SLOPE))
      d = Math.min(RAMP_MAX_FT, need)
    }
    if (need > RAMP_MAX_FT) return { reason: rampTooLongText(need) }
  }
  const rot = r3((Math.atan2(E.n[0], E.n[1]) * 180) / Math.PI)
  const place = (off: number): Params => ({
    ...kindFields(kind, mainH),
    shape: 'rect',
    w,
    d,
    rot,
    lvl: host.lvl,
    dx: r3(E.mid[0] + (E.n[0] * d) / 2 + E.u[0] * off),
    dz: r3(E.mid[1] + (E.n[1] * d) / 2 + E.u[1] * off),
  })
  const first = place(0)
  if (!overlapsAny(masses, first)) return { wing: first, overlaps: false, dropFt }
  for (let k = 1; k <= Math.floor(E.lenFt / 2); k++) {
    for (const sg of [1, -1]) {
      const spec = place(sg * k)
      if (!overlapsAny(masses, spec)) return { wing: spec, overlaps: false, dropFt }
    }
  }
  return { wing: first, overlaps: true, dropFt }
}

/** The new wing's outline pulled in 0.15 ft, so touching its host is not an overlap (legacy overlapsAny). */
const INSET_FT = 0.15

/** Whether a wing (raw) overlaps any mass: a corner of either outline inside the other, or an edge crossing one. */
export function overlapsAny(masses: readonly Mass[], wing: Params): boolean {
  const P = massBuildingPoly(wingMass(wing))
  const cx = P.reduce((s, p) => s + p[0], 0) / P.length
  const cz = P.reduce((s, p) => s + p[1], 0) / P.length
  const inset = P.map(([x, z]): LocalPoint => {
    const L = Math.hypot(cx - x, cz - z) || 1
    return [x + ((cx - x) / L) * INSET_FT, z + ((cz - z) / L) * INSET_FT]
  })
  return masses.some((m) => {
    const Q = massBuildingPoly(m)
    if (Q.length < 3) return false
    if (inset.some(([x, z]) => pointInPolygon(Q, x, z))) return true
    if (Q.some(([x, z]) => pointInPolygon(inset, x, z))) return true
    return inset.some((a, k) => Q.some((c, j) => crosses(a, inset[(k + 1) % inset.length], c, Q[(j + 1) % Q.length])))
  })
}

const orient = (a: LocalPoint, b: LocalPoint, c: LocalPoint) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

/** Segments a-b and c-d cross properly (not just touching). */
function crosses(a: LocalPoint, b: LocalPoint, c: LocalPoint, d: LocalPoint): boolean {
  const d1 = orient(c, d, a)
  const d2 = orient(c, d, b)
  const d3 = orient(a, b, c)
  const d4 = orient(a, b, d)
  return d1 * d2 < 0 && d3 * d4 < 0
}

const DOOR_W = 3
const DOOR_END_FT = 0.2
const DOOR_GAP_FT = 0.3
const DOOR_MIN_WALL_FT = 3.6

/**
 * A 3 ft door on edge i of an enclosed mass (legacy doorCut): centred on
 * the wall to the half foot, or the nearest half-foot spot either side that
 * keeps 0.2 ft from the wall ends and 0.3 ft from the other openings.
 */
export function doorCut(p: Params, masses: readonly Mass[], mi: number, i: number): { readonly cut: CutData } | { readonly reason: string } {
  const m = masses[mi]
  if (!m || m.kind !== 'wall') return { reason: DOOR_WALLS_TEXT }
  const wall = massWalls(p, mi).find((x) => x.edge === i)
  if (!wall) throw new Error(`no wall ${i} on mass ${mi}`)
  const L = wall.lengthFt
  if (L < DOOR_MIN_WALL_FT) return { reason: `Wall is only ${L.toFixed(1)} ft long — too short for a ${DOOR_W} ft door` }
  const others = (m.cuts as CutData[]).filter((c) => !c.along && c.edge === i)
  const lo = DOOR_END_FT
  const hi = L - DOOR_END_FT - DOOR_W
  const clash = (x: number) => others.some((c) => x < (c.x ?? 0) + (c.w ?? 3) + DOOR_GAP_FT && x + DOOR_W > (c.x ?? 0) - DOOR_GAP_FT)
  const x0 = Math.round(((L - DOOR_W) / 2) * 2) / 2
  for (let k = 0; k <= Math.ceil(2 * L); k++) {
    for (const x of k === 0 ? [x0] : [x0 + k * 0.5, x0 - k * 0.5]) {
      if (x >= lo && x <= hi && !clash(x)) return { cut: { kind: 'door', edge: i, x, sill: 0, w: DOOR_W, h: clamp(m.h || 7, 1, 7) } }
    }
  }
  return { reason: NO_DOOR_ROOM_TEXT }
}

const KIND_LABELS: Record<AttachKind | 'door', string> = { deck: 'Deck', porch: 'Porch', stair: 'Stair', ramp: 'Ramp', door: 'Door' }
const round1 = (v: number) => String(+v.toFixed(1))

/** "Added Deck · 12 × 10 ft off Main front · Undo to remove" (legacy attachAddApply). */
export function addedText(kind: AttachKind, wing: Params, overlaps: boolean, host: Mass, mi: number, i: number): string {
  const over = overlaps ? ' — it overlaps another part, drag it clear' : ''
  return `Added ${KIND_LABELS[kind]} · ${round1(Number(wing.w))} × ${round1(Number(wing.d))} ft off ${partName(host, mi)} ${edgeName(host, i)}${over} · Undo to remove`
}

/** "Door added · Main · front — move or resize it in Openings". */
export function doorAddedText(host: Mass, mi: number, i: number): string {
  return `Door added · ${partName(host, mi)} · ${edgeName(host, i)} — move or resize it in Openings`
}

export const kindLabel = (kind: AttachKind | 'door'): string => KIND_LABELS[kind]
