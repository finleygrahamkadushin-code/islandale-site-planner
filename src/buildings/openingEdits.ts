import { pointInPolygon } from './foundation'
import { buildingMasses, massBuildingPoly, massPoly, massToBuilding, type Mass } from './masses'
import { layoutOpenings, type CutData, type FitNote } from './openingLayout'
import type { LocalPoint } from './footprint'

/**
 * Pure edits to a cabin's openings. Mass 0 is the main walls (params.cuts);
 * mass n is the n-th wing (params.wings, counting only well-formed wings, as
 * buildingMasses does). Every edit returns new params and the fit notes; the
 * stored numbers are always the fitted ones, so what is drawn matches the data.
 */

type Params = Record<string, unknown>
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Index into params.wings of each wing mass (mass n is wings[wingSlots[n - 1]]). */
function wingSlots(p: Params): number[] {
  const wings = Array.isArray(p.wings) ? p.wings : []
  return wings.flatMap((w, i) => (isRecord(w) ? [i] : []))
}

export function massCuts(p: Params, massIndex: number): CutData[] {
  const m = buildingMasses(p)[massIndex]
  return m ? (m.cuts as CutData[]).map((c) => ({ ...c })) : []
}

/** New params with one mass's cuts replaced; every other field, and every other wing, unchanged. */
export function withMassCuts(p: Params, massIndex: number, cuts: readonly CutData[]): Params {
  if (massIndex === 0) return { ...p, cuts: [...cuts] }
  const slot = wingSlots(p)[massIndex - 1]
  if (slot === undefined) throw new Error(`no mass ${massIndex}`)
  const wings = (p.wings as unknown[]).map((w, i) => (i === slot ? { ...(w as Params), cuts: [...cuts] } : w))
  return { ...p, wings }
}

/** Whether a point in mass `mi`'s frame lies inside another enclosed mass of the building. */
function buriedTest(masses: readonly Mass[], mi: number): (p: LocalPoint) => boolean {
  const others = masses.flatMap((m, i) => (i !== mi && m.kind === 'wall' ? [massBuildingPoly(m)] : []))
  return (p) => {
    const [x, z] = massToBuilding(masses[mi], p)
    return others.some((poly) => pointInPolygon(poly, x, z))
  }
}

/** Fit one mass's cuts by the shared rules. */
export function fitMass(p: Params, massIndex: number, cuts: readonly CutData[] = massCuts(p, massIndex)) {
  const masses = buildingMasses(p)
  const m = masses[massIndex]
  if (!m) throw new Error(`no mass ${massIndex}`)
  return { mass: m, ...layoutOpenings(massPoly(m), cuts, { wallHeightFt: m.h, buried: buriedTest(masses, massIndex) }) }
}

export interface EditResult {
  readonly params: Params
  readonly notes: readonly FitNote[]
}

/** Change one mass's cuts and store the fitted result. */
export function editCuts(p: Params, massIndex: number, change: (cuts: CutData[]) => CutData[]): EditResult {
  const fitted = fitMass(p, massIndex, change(massCuts(p, massIndex)))
  return { params: withMassCuts(p, massIndex, fitted.cuts), notes: fitted.notes }
}

/** Fit every mass's cuts, after the cabin's size or shape changed. */
export function refitAll(p: Params): EditResult {
  let params = p
  const notes: FitNote[] = []
  buildingMasses(p).forEach((m, i) => {
    if (m.kind !== 'wall' || m.cuts.length === 0) return
    const r = fitMass(params, i)
    if (r.notes.length === 0) return
    params = withMassCuts(params, i, r.cuts)
    notes.push(...r.notes)
  })
  return { params, notes }
}

/** One more than the largest cut id anywhere on the cabin. */
export function nextCutId(p: Params): number {
  const ids = buildingMasses(p).flatMap((m) => (m.cuts as CutData[]).map((c, i) => (typeof c.id === 'number' ? c.id : i + 1)))
  return Math.max(0, ...ids) + 1
}

/** Give every cut on the cabin a unique id, keeping the ones it has. */
export function withCutIds(p: Params): Params {
  let next = nextCutId(p)
  let params = p
  const seen = new Set<number>()
  buildingMasses(p).forEach((m, i) => {
    const cuts = m.cuts as CutData[]
    const named = cuts.map((c) => {
      if (typeof c.id === 'number' && !seen.has(c.id)) {
        seen.add(c.id)
        return c
      }
      const id = next++
      seen.add(id)
      return { ...c, id }
    })
    if (named.some((c, k) => c !== cuts[k])) params = withMassCuts(params, i, named)
  })
  return params
}

/** "Main · front 3", "Wing 2 · left 1", "porch 1 · curved wall", as the old planner names walls. */
export function wallLabel(p: Params, massIndex: number, edge: number | 'along'): string {
  const m = buildingMasses(p)[massIndex]
  const name = massIndex === 0 ? 'Main' : m?.kind === 'wall' ? `Wing ${massIndex}` : `${m?.kind ?? 'porch'} ${massIndex}`
  if (!m || edge === 'along') return `${name} · curved wall`
  const poly = massPoly(m)
  const a = poly[edge]
  const b = poly[(edge + 1) % poly.length]
  if (!a || !b) return `${name} · edge ${edge + 1}`
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  // the outward normal in the mass frame, turned into the cabin frame (+z front)
  const [ox, oz] = massToBuilding({ ...m, dx: 0, dz: 0 }, [(b[1] - a[1]) / len, -(b[0] - a[0]) / len])
  const dirs: [number, number, string][] = [
    [0, 1, 'front'],
    [0, -1, 'back'],
    [1, 0, 'right'],
    [-1, 0, 'left'],
  ]
  const best = dirs.reduce((q, d) => (d[0] * ox + d[1] * oz > q[0] * ox + q[1] * oz ? d : q))
  return `${name} · ${best[2]} ${edge + 1}`
}

/** The walls of an enclosed mass, for the wall picker. */
export function massWalls(p: Params, massIndex: number): { edge: number; label: string; lengthFt: number }[] {
  const m = buildingMasses(p)[massIndex]
  if (!m || m.kind !== 'wall') return []
  const poly = massPoly(m)
  return poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length]
    return { edge: i, label: wallLabel(p, massIndex, i), lengthFt: Math.hypot(b[0] - a[0], b[1] - a[1]) }
  })
}
