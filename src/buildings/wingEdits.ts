import { normalizeDeg } from '../site/units'
import { localToSite, num } from './footprint'
import { massPoly, wingMass, wingSlots } from './masses'

/**
 * Pure edits to a cabin's wings. Mass 0 is the main walls (the cabin's own
 * params), mass n the n-th well-formed wing (wingSlots). Each edit returns
 * new params and leaves every other wing, and the raw fields it does not
 * know, untouched.
 */

type Params = Record<string, unknown>
const isRecord = (v: unknown): v is Params => typeof v === 'object' && v !== null && !Array.isArray(v)

function slotOf(p: Params, mi: number): number {
  if (mi < 1) throw new Error('mass 0 is the main walls, not a wing')
  const slot = wingSlots(p)[mi - 1]
  if (slot === undefined) throw new Error(`no mass ${mi}`)
  return slot
}

/** The raw wing behind mass `mi`. */
export function wingAt(p: Params, mi: number): Params {
  return (p.wings as Params[])[slotOf(p, mi)]
}

/**
 * A changed wing as it is stored: its rotation normalised to (-180, 180]
 * when it changed, and its per-edge rails dropped when its outline changed
 * (shape, points or edge count), since they are keyed by edge index.
 */
export function tidyWing(before: Params, after: Params): Params {
  let w = after
  if (typeof w.rot === 'number' && w.rot !== before.rot) w = { ...w, rot: normalizeDeg(w.rot) }
  if ('rails' in w && outlineChanged(before, w)) {
    const { rails: _stale, ...rest } = w
    w = rest
  }
  return w
}

function outlineChanged(a: Params, b: Params): boolean {
  if ((a.shape ?? 'rect') !== (b.shape ?? 'rect')) return true
  if (a.pts !== b.pts && JSON.stringify(a.pts) !== JSON.stringify(b.pts)) return true
  return massPoly(wingMass(a)).length !== massPoly(wingMass(b)).length
}

/** New params with mass `mi`'s raw wing replaced by `f(wing)`, tidied. */
export function withWing(p: Params, mi: number, f: (w: Params) => Params): Params {
  const slot = slotOf(p, mi)
  const wings = (p.wings as unknown[]).map((w, i) => (i === slot ? tidyWing(w as Params, f(w as Params)) : w))
  return { ...p, wings }
}

/** Shapes drawn from their own points alone, so a new width or depth has to scale the points. */
const POINT_SHAPES = new Set(['poly', 'blob'])
const round2 = (v: number) => Math.round(v * 100) / 100

/**
 * A part's params (a wing, or a cabin's main walls) at a new width and
 * depth. A poly or blob is drawn from its points, so they scale about the
 * part's origin by new/old size, to 0.01 ft (legacy orgScale); every other
 * shape is drawn from w and d and just takes the numbers.
 */
export function withSize(p: Params, w: number, d: number): Params {
  const ow = Number(p.w)
  const od = Number(p.d)
  const sized = { ...p, w, d }
  if (!POINT_SHAPES.has(String(p.shape)) || !Array.isArray(p.pts) || !(ow > 0) || !(od > 0)) return sized
  const sx = w / ow
  const sz = d / od
  if (sx === 1 && sz === 1) return sized
  const pts = p.pts.map((q) => (Array.isArray(q) ? [round2(num(q[0], 0) * sx), round2(num(q[1], 0) * sz)] : q))
  return { ...sized, pts }
}

/** A wing with `patch` applied; a new w or d scales a poly or blob's points too, unless the patch gives its own outline. */
export function withWingPatch(w: Params, patch: Params): Params {
  const next = { ...w, ...patch }
  if (!('w' in patch || 'd' in patch) || 'pts' in patch || 'shape' in patch) return next
  return withSize({ ...next, w: w.w, d: w.d }, num(next.w, num(w.w, 0)), num(next.d, num(w.d, 0)))
}

/** A new wing at the end of the list; it becomes the last mass. */
export function withAddedWing(p: Params, wing: Params): Params {
  const wings = Array.isArray(p.wings) ? p.wings : []
  const tidy = typeof wing.rot === 'number' ? { ...wing, rot: normalizeDeg(wing.rot) } : wing
  return { ...p, wings: [...wings, tidy] }
}

/** Edge i of a rect part, in its own axes: 0 back (-z) and 2 front change d, 1 right and 3 left change w. */
export const RECT_EDGES = [
  [0, -1, 'd'],
  [1, 0, 'w'],
  [0, 1, 'd'],
  [-1, 0, 'w'],
] as const
/** The smallest a dragged edge leaves a part, feet (legacy resizeWingEdge). */
export const MIN_PART_FT = 3
const round4 = (v: number) => Math.round(v * 1e4) / 1e4

interface Placed {
  readonly position: { readonly x: number; readonly n: number }
  readonly rotation: number
  readonly params: Params
}

/**
 * Move edge `edge` of a rect main mass out by `deltaFt` (in when negative),
 * the opposite edge staying put, at least MIN_PART_FT (legacy
 * applyMainResize). The building centre moves by half the change, and every
 * wing's dx/dz moves back by the same amount, so the wings stay where they
 * are on the ground. Returns `o` itself when the size does not change.
 */
export function withMainEdgeResized<T extends Placed>(o: T, edge: number, deltaFt: number): T {
  const p = o.params
  if (p.shape !== undefined && p.shape !== 'rect') throw new Error('only a rect main mass has edges to drag')
  if (!Number.isInteger(edge) || edge < 0 || edge > 3) throw new Error(`no edge ${edge} of 4`)
  const [nx, nz, key] = RECT_EDGES[edge]
  const old = Number(p[key])
  if (!Number.isFinite(old) || !Number.isFinite(deltaFt)) throw new Error('the main mass needs a size and the drag a number')
  const size = round4(Math.max(MIN_PART_FT, old + deltaFt))
  const applied = size - old
  if (applied === 0) return o
  const sx = (nx * applied) / 2
  const sz = (nz * applied) / 2
  const [x, n] = localToSite(o.position, o.rotation, [sx, sz])
  const resized = { ...p, [key]: size }
  const params = Array.isArray(p.wings)
    ? { ...resized, wings: p.wings.map((w) => (isRecord(w) ? { ...w, dx: round4(num(w.dx, 0) - sx), dz: round4(num(w.dz, 0) - sz) } : w)) }
    : resized
  return { ...o, position: { x, n }, params }
}

/**
 * Params without mass `mi`'s wing. Exterior paint keyed by mass index
 * (ext.masses["mi"], ext.walls["mi:ei"]) follows its wing: the removed
 * wing's entries go and every later one shifts down by one.
 */
export function withoutWing(p: Params, mi: number): Params {
  const slot = slotOf(p, mi)
  const wings = (p.wings as unknown[]).filter((_, i) => i !== slot)
  const out: Params = { ...p, wings }
  return isRecord(p.ext) ? { ...out, ext: shiftExt(p.ext, mi) } : out
}

function shiftExt(ext: Params, mi: number): Params {
  let out = ext
  if (isRecord(ext.masses)) out = { ...out, masses: shiftKeys(ext.masses, mi, (k) => [Number(k), '']) }
  if (isRecord(ext.walls)) {
    out = {
      ...out,
      walls: shiftKeys(ext.walls, mi, (k) => {
        const [m, ...rest] = k.split(':')
        return [Number(m), rest.length ? `:${rest.join(':')}` : '']
      }),
    }
  }
  return out
}

/** Drop keys for mass `mi`, shift keys above it down one; other keys stay as they are. */
function shiftKeys(r: Params, mi: number, parse: (k: string) => [number, string]): Params {
  const out: Params = {}
  for (const [k, v] of Object.entries(r)) {
    const [m, tail] = parse(k)
    if (!Number.isInteger(m)) out[k] = v
    else if (m === mi) continue
    else out[m > mi ? `${m - 1}${tail}` : k] = v
  }
  return out
}
