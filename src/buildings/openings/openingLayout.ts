import type { LocalPoint } from '../footprint'
import type { LegacyCut } from './openings'

/**
 * One set of fit rules for openings, shared with the old planner's
 * ext:openings-fit block (numbers in PLAN.md, "Opening fit rules"). All
 * lengths are feet. A cut's `x` is measured from the wall's left end as seen
 * from outside, to the opening itself; the trim (casing) sits outside that.
 */
export const FIT = {
  /** The outer frame keeps at least this far from a wall end. */
  cornerFt: 0.75,
  /** Wall thickness: at a sharp corner the next wall covers t / sin(angle). */
  wallFt: 0.66,
  /** Least gap between two openings' outer frames. */
  gapFt: 4 / 12,
  /** The head stays this far under the eave. */
  headFt: 0.5,
  trimFt: 3.5 / 12,
  minFt: 1,
  /** A vertex bending less than this is part of a curve, not a corner. */
  softTurnDeg: 30,
} as const

export type OpeningKind = 'door' | 'window' | 'slider' | 'cutout'

/** A cut as stored in params.cuts (or a wing's cuts), with the Phase 3C fields. */
export interface CutData extends LegacyCut {
  readonly id?: number
  readonly trim?: number
  readonly mullV?: number
  readonly mullH?: number
}

/** A change the fit made to a cut, so the UI can say why. */
export interface FitNote {
  readonly id: number
  readonly field: 'x' | 'w' | 'h' | 'sill' | 'edge'
  readonly wanted: number
  readonly got: number
  readonly reason: string
}

/** One straight run of an opening on one wall. */
export interface OpeningPiece {
  readonly edge: number
  /** Centre on the wall face (x, y up, z), feet. */
  readonly centre: readonly [number, number, number]
  /** Outward wall normal (x, z). */
  readonly normal: readonly [number, number]
  readonly w: number
  /** Whether this piece's left / right end (seen from outside) gets a jamb. */
  readonly jambLeft: boolean
  readonly jambRight: boolean
}

export interface PlacedOpening {
  readonly id: number
  readonly kind: OpeningKind
  readonly along: boolean
  readonly edge: number
  readonly x: number
  readonly w: number
  readonly h: number
  readonly sill: number
  readonly trim: number
  readonly mullV: number
  readonly mullH: number
  readonly pieces: readonly OpeningPiece[]
  /** On a wall covered by another enclosed mass: kept in the data, not drawn. */
  readonly hidden: boolean
  /** Could not be fitted without overlapping another opening. */
  readonly conflict: boolean
}

export interface LayoutOptions {
  readonly wallHeightFt: number
  /** The lowest roof line over a span of an edge, feet above the floor; defaults to the wall height. */
  readonly roofLineFt?: (edge: number, fromA0: number, fromA1: number) => number
  /** Whether a point just outside a wall lies inside another enclosed mass. */
  readonly buried?: (p: LocalPoint) => boolean
}

interface Edge {
  readonly a: LocalPoint
  readonly b: LocalPoint
  readonly len: number
  readonly ux: number
  readonly uz: number
}

const edgesOf = (poly: readonly LocalPoint[]): Edge[] =>
  poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    return { a, b, len, ux: (b[0] - a[0]) / (len || 1), uz: (b[1] - a[1]) / (len || 1) }
  })

/** How far the wall turns at vertex `i` (between edge i-1 and edge i), degrees, 0 for straight. */
function turnAt(edges: readonly Edge[], i: number): number {
  const p = edges[(i - 1 + edges.length) % edges.length]
  const q = edges[i]
  const cross = p.ux * q.uz - p.uz * q.ux
  const dot = p.ux * q.ux + p.uz * q.uz
  return Math.abs((Math.atan2(cross, dot) * 180) / Math.PI)
}

/** Clearance for the outer frame at vertex `i`: the corner minimum, or the next wall's thickness across a sharp corner. */
function clearanceAt(edges: readonly Edge[], i: number): number {
  const turn = turnAt(edges, i)
  if (turn < FIT.softTurnDeg) return FIT.cornerFt
  const inside = ((180 - turn) * Math.PI) / 180
  const across = inside > 0.05 ? FIT.wallFt / Math.sin(Math.min(Math.PI / 2, inside)) : FIT.wallFt
  return Math.max(FIT.cornerFt, across)
}

export const asKind = (k: unknown): OpeningKind => (k === 'window' || k === 'slider' || k === 'cutout' ? k : 'door')

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

/** Cut fields with defaults: sill 0 is a real value, not a missing one. */
function readCut(c: CutData, index: number) {
  const kind = asKind(c.kind ?? 'door')
  const tall = kind === 'door' || kind === 'slider'
  return {
    id: num(c.id, index + 1),
    kind,
    along: !!c.along,
    edge: num(c.edge, 0),
    x: num(c.x, 0),
    w: Math.max(FIT.minFt / 2, num(c.w, 3)),
    h: Math.max(FIT.minFt / 2, num(c.h, tall ? 7 : 4)),
    sill: Math.max(0, num(c.sill, tall ? 0 : 3)),
    trim: Math.max(0, num(c.trim, FIT.trimFt)),
    mullV: Math.max(0, Math.round(num(c.mullV, kind === 'slider' ? 1 : 0))),
    mullH: Math.max(0, Math.round(num(c.mullH, 0))),
  }
}
type ReadCut = ReturnType<typeof readCut>

/** Fit a cut's height into the wall: sill at or above the floor, head under the roof line. */
function fitHeight(c: ReadCut, roofFt: number, notes: FitNote[]): ReadCut {
  const limit = roofFt - FIT.headFt
  let { h, sill } = c
  if (sill + h <= limit) return c
  const wantedH = h
  if (limit < FIT.minFt) {
    // no room for even the least opening under the head clearance: it fills what wall there is, never less than nothing
    h = Math.max(0, Math.min(h, roofFt))
    if (sill !== 0) notes.push({ id: c.id, field: 'sill', wanted: sill, got: 0, reason: 'lowered to the floor: the wall is too low' })
    if (h !== wantedH) notes.push({ id: c.id, field: 'h', wanted: wantedH, got: h, reason: 'cut to the wall height: the wall is too low for the head clearance' })
    return { ...c, h, sill: 0 }
  }
  h = Math.max(FIT.minFt, limit - sill)
  if (sill + h > limit) {
    const wantedSill = sill
    sill = Math.max(0, limit - h)
    notes.push({ id: c.id, field: 'sill', wanted: wantedSill, got: sill, reason: 'lowered to keep the head under the eave' })
  }
  h = Math.min(h, limit - sill)
  if (h !== wantedH) notes.push({ id: c.id, field: 'h', wanted: wantedH, got: h, reason: `cut to keep the head ${inches(FIT.headFt)} under the eave` })
  return { ...c, h, sill }
}

const inches = (ft: number) => `${Math.round(ft * 12)} in`

/** Free stretches of an edge, as outer-frame intervals in from-left feet. */
function freeSpans(lo: number, hi: number, taken: readonly (readonly [number, number])[]): [number, number][] {
  const spans: [number, number][] = []
  let start = lo
  for (const [a, b] of [...taken].sort((p, q) => p[0] - q[0])) {
    if (a - FIT.gapFt > start) spans.push([start, Math.min(hi, a - FIT.gapFt)])
    start = Math.max(start, b + FIT.gapFt)
  }
  if (hi > start) spans.push([start, hi])
  return spans.filter(([a, b]) => b - a > 1e-6)
}

/**
 * How a run of wall ends: what the fit calls its ends in notes, and the
 * furthest an opening may go when it cannot fit (a straight wall's own ends;
 * none for a loop opened at another opening, where it overlaps as a conflict).
 */
interface RunEnds {
  readonly name: string
  readonly bounds?: readonly [number, number]
}

/** Fit one cut along a run of wall from `lo` to `hi` (outer-frame limits): clear of its ends and of the openings already placed. */
function fitInRun(
  c: ReadCut,
  lo: number,
  hi: number,
  taken: readonly (readonly [number, number])[],
  notes: FitNote[],
  ends: RunEnds,
): { cut: ReadCut; conflict: boolean } {
  const outer = (x: number, w: number) => [x - c.trim, x + w + c.trim] as const
  const spans = freeSpans(lo, hi, taken)
  const want = outer(c.x, c.w)
  const fits = (s: readonly [number, number], w: number) => s[1] - s[0] >= w + 2 * c.trim - 1e-9
  // the free span nearest to where the opening was asked for, with room for its full width
  const roomy = spans.filter((s) => fits(s, c.w))
  const distance = (s: readonly [number, number]) => Math.max(0, s[0] - want[0], want[1] - s[1])
  const pick = roomy.sort((p, q) => distance(p) - distance(q))[0]
  let { x, w } = c
  let conflict = false
  if (pick) {
    x = Math.min(Math.max(c.x, pick[0] + c.trim), pick[1] - c.trim - w)
  } else {
    const widest = spans.sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0]
    if (widest && fits(widest, FIT.minFt)) {
      w = widest[1] - widest[0] - 2 * c.trim
      x = widest[0] + c.trim
      notes.push({ id: c.id, field: 'w', wanted: c.w, got: w, reason: 'narrowed to fit the wall' })
    } else {
      conflict = true
      w = Math.min(c.w, Math.max(FIT.minFt, hi - lo - 2 * c.trim))
      x = Math.min(Math.max(c.x, lo + c.trim), Math.max(lo + c.trim, hi - c.trim - w))
      if (ends.bounds) {
        // never past the wall's own ends, even when it cannot keep clear of the corners
        const [b0, b1] = ends.bounds
        const room = Math.max(0, b1 - b0 - 2 * c.trim)
        w = Math.min(w, room)
        x = room > 0 ? Math.min(Math.max(x, b0 + c.trim), b1 - c.trim - w) : (b0 + b1) / 2
      }
      if (w < c.w - 1e-9) notes.push({ id: c.id, field: 'w', wanted: c.w, got: w, reason: 'narrowed to fit the wall' })
    }
  }
  if (Math.abs(x - c.x) > 1e-6) {
    const toEnd = `to clear ${ends.name}`
    const why = x > c.x && c.x - c.trim < lo ? toEnd : x < c.x && c.x + c.w + c.trim > hi ? toEnd : 'to clear the next opening'
    notes.push({ id: c.id, field: 'x', wanted: c.x, got: x, reason: `moved ${inches(Math.abs(x - c.x))} ${why}` })
  }
  return { cut: { ...c, x, w }, conflict }
}

/**
 * Lay out a mass's cuts on its walls by the fit rules. Returns the openings
 * to draw, the cuts with fitted numbers (to store on edit), and a note for
 * every change made.
 */
export function layoutOpenings(poly: readonly LocalPoint[], cuts: readonly CutData[], opt: LayoutOptions) {
  const edges = edgesOf(poly)
  const notes: FitNote[] = []
  const openings: PlacedOpening[] = []
  const fitted: CutData[] = []
  // every opening placed so far, as its outer frame measured round the perimeter from vertex 0 (a → b)
  const taken: [number, number][] = []
  const cum = edges.reduce<number[]>((a, e) => [...a, a[a.length - 1] + e.len], [0])
  const perim = cum[edges.length]
  const roofLine = opt.roofLineFt ?? (() => opt.wallHeightFt)

  cuts.forEach((raw, index) => {
    let c = readCut(raw, index)
    if (c.along) {
      if (perim <= 0) return
      c = fitHeight(c, opt.wallHeightFt, notes)
      const placed = fitRound(c, perim, taken, notes)
      c = placed.cut
      taken.push([c.x - c.trim, c.x + c.w + c.trim])
      fitted.push({ ...raw, id: c.id, x: c.x, w: c.w, h: c.h, sill: c.sill })
      openings.push({ ...c, pieces: alongPieces(edges, c), hidden: false, conflict: placed.conflict })
      return
    }
    const e = edges[c.edge]
    if (!Number.isInteger(c.edge) || !e || e.len < 1e-4) {
      notes.push({ id: c.id, field: 'edge', wanted: c.edge, got: -1, reason: 'its wall no longer exists, so it is not drawn' })
      fitted.push(raw)
      return
    }
    // seen from outside, the wall's left end is vertex b (i + 1) and its right end is vertex a (i)
    const left = clearanceAt(edges, (c.edge + 1) % edges.length)
    const right = clearanceAt(edges, c.edge)
    const fromA = (x: number, w: number) => [e.len - x - w, e.len - x] as const
    const span = fromA(c.x, c.w)
    c = fitHeight(c, Math.min(roofLine(c.edge, span[0], span[1]), opt.wallHeightFt), notes)
    const placed = fitInRun(c, left, e.len - right, takenOnEdge(taken, cum[c.edge], e.len, perim), notes, { name: 'the corner', bounds: [0, e.len] })
    c = placed.cut
    const [a0] = fromA(c.x, c.w)
    taken.push([cum[c.edge] + a0 - c.trim, cum[c.edge] + a0 + c.w + c.trim])
    const mid = a0 + c.w / 2
    const out: LocalPoint = [e.a[0] + e.ux * mid + e.uz * 0.4, e.a[1] + e.uz * mid - e.ux * 0.4]
    fitted.push({ ...raw, id: c.id, x: round(c.x), w: round(c.w), h: round(c.h), sill: round(c.sill) })
    openings.push({
      ...c,
      pieces: [piece(e, c.edge, a0, c.w, c, true, true)],
      hidden: !!opt.buried?.(out),
      conflict: placed.conflict,
    })
  })
  return { openings, cuts: fitted, notes }
}

const round = (v: number) => Math.round(v * 1e4) / 1e4

/** The taken perimeter frames that reach onto the edge starting `start` round the perimeter, as from-left intervals on it. */
function takenOnEdge(taken: readonly (readonly [number, number])[], start: number, len: number, perim: number): [number, number][] {
  return taken.flatMap(([p0, p1]) =>
    [-perim, 0, perim].flatMap((k): [number, number][] => {
      const s0 = Math.max(p0 + k, start)
      const s1 = Math.min(p1 + k, start + len)
      return s1 - s0 > 1e-9 ? [[start + len - s1, start + len - s0]] : []
    }),
  )
}

/**
 * Fit an along-cut round the perimeter, a loop with no corners to clear
 * (an along-cut turns them with a shared jamb): clear of every opening
 * already placed, by the same rules as a straight wall, on the loop opened
 * just past one of them. Its x comes back measured from vertex 0.
 */
function fitRound(c: ReadCut, perim: number, taken: readonly (readonly [number, number])[], notes: FitNote[]): { cut: ReadCut; conflict: boolean } {
  const wrap = (v: number) => ((v % perim) + perim) % perim
  const x0 = wrap(c.x)
  if (!taken.length) {
    const w = Math.min(c.w, perim - 2 * FIT.cornerFt)
    if (w !== c.w) notes.push({ id: c.id, field: 'w', wanted: c.w, got: w, reason: 'narrowed to fit the wall' })
    return { cut: { ...c, x: x0, w }, conflict: false }
  }
  const [t0, t1] = taken[0]
  const into = (v: number) => t1 + wrap(v - t1)
  const others = taken.slice(1).map(([a, b]): [number, number] => [into(a), into(a) + b - a])
  // the loop has two ways to the nearest room: try x on each side of the opening it was opened at, keep the shorter move
  const tries = [into(x0), into(x0) - perim].map((x) => {
    const local: FitNote[] = []
    const placed = fitInRun({ ...c, x }, t1 + FIT.gapFt, t0 + perim - FIT.gapFt, others, local, { name: 'the next opening' })
    return { placed, local, moved: Math.abs(placed.cut.x - x) + (placed.conflict ? perim : 0) }
  })
  const best = tries[1].moved < tries[0].moved ? tries[1] : tries[0]
  // notes speak in x from vertex 0, like the cut itself
  notes.push(...best.local.map((n) => (n.field === 'x' ? { ...n, wanted: x0, got: wrap(n.got) } : n)))
  return { cut: { ...best.placed.cut, x: wrap(best.placed.cut.x) }, conflict: best.placed.conflict }
}

function piece(e: Edge, edge: number, fromA: number, w: number, c: ReadCut, jambLeft: boolean, jambRight: boolean): OpeningPiece {
  const t = fromA + w / 2
  return {
    edge,
    centre: [e.a[0] + e.ux * t, c.sill + c.h / 2, e.a[1] + e.uz * t],
    normal: [e.uz, -e.ux],
    w,
    jambLeft,
    jambRight,
  }
}

/**
 * An along-cut runs round the perimeter from vertex 0, as in the old planner.
 * It is one opening: jambs only at its two ends and at sharp corners it turns
 * (one shared jamb there), none where it follows a curve.
 */
function alongPieces(edges: readonly Edge[], c: ReadCut): OpeningPiece[] {
  const pieces: OpeningPiece[] = []
  let at = 0
  // twice round, so a cut that starts near the end of the perimeter carries on past vertex 0
  const twice = [...edges, ...edges]
  twice.forEach((e, j) => {
    const i = j % edges.length
    const s0 = Math.max(c.x, at)
    const s1 = Math.min(c.x + c.w, at + e.len)
    if (s1 - s0 >= 0.05) {
      const first = pieces.length === 0
      const sharpAfter = s1 < c.x + c.w - 1e-6 && turnAt(edges, (i + 1) % edges.length) >= FIT.softTurnDeg
      // walking from a to b runs right to left seen from outside: the start is the piece's right end
      pieces.push(piece(e, i, s0 - at, s1 - s0, c, sharpAfter || s1 >= c.x + c.w - 1e-6, first))
    }
    at += e.len
  })
  return pieces
}
