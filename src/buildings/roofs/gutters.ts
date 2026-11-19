import { addPolygon, emptyMesh, type MeshData, type V3 } from '../geom'

/**
 * Gutters and downspouts for a pitched roof, worked out from the roof's own
 * mesh (metres, y = 0 at the eave): a gutter hangs along every eave (a low,
 * level edge on the roof's rim), and downspouts carry the water down the wall
 * to the ground. A roof with no eave but a low point (a butterfly's valley)
 * drains by one downspout there. New in the rebuild: the legacy planner drew
 * none.
 */

/** Gutter width out from the eave, and its depth, metres (a 5 in box gutter). */
const GUTTER_W = 0.125
const GUTTER_H = 0.1
/** The gutter's top sits this far under the roof edge. */
const GUTTER_DROP = 0.02
/** Downspout side, metres (a 3 in square pipe). */
const PIPE = 0.08
/** A downspout stands this far in from its gutter's end, and this far off the wall. */
const PIPE_INSET = 0.2
const WALL_GAP = 0.02
/** One downspout for about this much gutter, metres. */
export const DOWNSPOUT_EVERY_M = 12
/** Where a downspout ends when the ground is not known, metres below the eave. */
const DEFAULT_BOTTOM = -2.7

const LEVEL = 1e-4
const JOIN = 2e-3
/** A top face flatter than this is flat (no eave); one steeper than a wall is not roof. */
const FLAT_NY = 0.9995
const MIN_NY = 0.05

export interface EaveRun {
  readonly a: V3
  readonly b: V3
  /** Level unit vector (x, z) pointing away from the roof. */
  readonly out: readonly [number, number]
}

export interface DownspoutSpot {
  /** The gutter end (or low point) the downspout hangs from. */
  readonly at: V3
  readonly out: readonly [number, number]
  /** Level unit vector (x, z) from the spot back along its gutter, so the pipe stands in from the corner; [0, 0] with no gutter. */
  readonly along: readonly [number, number]
}

export interface DrainageOptions {
  /** The roof's type after normaliseRoof; flat and prow roofs get nothing. */
  readonly type: string
  /** The eave overhang, metres: how far the downspout steps back to the wall. */
  readonly overhangM: number
  /** Where a downspout ends: the ground under a roof-frame point (x, z metres), as y in the roof frame. */
  readonly bottomAt?: (x: number, z: number) => number
}

export interface Drainage {
  readonly gutters: MeshData
  readonly downspouts: MeshData
}

interface Face {
  readonly pts: readonly [V3, V3, V3]
  /** The face normal's upward part: 1 is flat. */
  readonly ny: number
}

/** The roof's upward faces (its mesh is flat triangles, nine numbers each). */
function topFaces(roof: MeshData): Face[] {
  const out: Face[] = []
  const p = roof.positions
  for (let i = 0; i + 8 < p.length; i += 9) {
    const ny = roof.normals[i + 1]
    if (ny > MIN_NY) out.push({ ny, pts: [[p[i], p[i + 1], p[i + 2]], [p[i + 3], p[i + 4], p[i + 5]], [p[i + 6], p[i + 7], p[i + 8]]] })
  }
  return out
}

const mm = (v: number) => Math.round(v * 1000)
const pointKey = (v: V3) => `${mm(v[0])},${mm(v[1])},${mm(v[2])}`
const edgeKey = (a: V3, b: V3) => {
  const ka = pointKey(a)
  const kb = pointKey(b)
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
}

/** The roof's eaves: level edges on its rim with the roof rising from them, joined into straight runs. */
export function eaveRuns(roof: MeshData): EaveRun[] {
  const faces = topFaces(roof)
  const uses = new Map<string, number>()
  for (const f of faces) {
    for (let i = 0; i < 3; i++) {
      const key = edgeKey(f.pts[i], f.pts[(i + 1) % 3])
      uses.set(key, (uses.get(key) ?? 0) + 1)
    }
  }
  const pieces: EaveRun[] = []
  for (const f of faces) {
    if (f.ny > FLAT_NY) continue
    for (let i = 0; i < 3; i++) {
      const piece = eavePiece(f.pts[i], f.pts[(i + 1) % 3], f.pts[(i + 2) % 3], uses)
      if (piece) pieces.push(piece)
    }
  }
  return joinRuns(pieces)
}

/** Edge a–b of a face whose third corner is c, when it is an eave: level, on the rim (no other face shares it), the face rising from it. */
function eavePiece(a: V3, b: V3, c: V3, uses: ReadonlyMap<string, number>): EaveRun | null {
  if (Math.abs(a[1] - b[1]) > LEVEL || c[1] < a[1] + LEVEL) return null
  if (uses.get(edgeKey(a, b)) !== 1) return null
  const dx = b[0] - a[0]
  const dz = b[2] - a[2]
  const len = Math.hypot(dx, dz)
  if (len < JOIN) return null
  // square to the edge, on the side away from the face's third corner
  const side = (c[0] - a[0]) * dz - (c[2] - a[2]) * dx > 0 ? -1 : 1
  return { a, b, out: [(side * dz) / len, (-side * dx) / len] }
}

/** Pieces on one line that touch end to end become one run (a fitted roof is cut into many triangles along an eave). */
function joinRuns(pieces: readonly EaveRun[]): EaveRun[] {
  const lines = new Map<string, EaveRun[]>()
  for (const p of pieces) {
    // the line: its outward side, how far out it lies, and its height
    const off = p.a[0] * p.out[0] + p.a[2] * p.out[1]
    const key = `${Math.round(p.out[0] * 500)},${Math.round(p.out[1] * 500)},${Math.round(off * 200)},${Math.round(p.a[1] * 200)}`
    lines.set(key, [...(lines.get(key) ?? []), p])
  }
  return [...lines.values()].flatMap(joinLine)
}

function joinLine(line: readonly EaveRun[]): EaveRun[] {
  const { out } = line[0]
  const t = (v: V3) => -v[0] * out[1] + v[2] * out[0]
  const spans = line.map((p) => (t(p.a) <= t(p.b) ? { lo: p.a, hi: p.b } : { lo: p.b, hi: p.a })).sort((m, n) => t(m.lo) - t(n.lo))
  const runs: EaveRun[] = []
  let cur = spans[0]
  for (const s of spans.slice(1)) {
    if (t(s.lo) > t(cur.hi) + JOIN) {
      runs.push({ a: cur.lo, b: cur.hi, out })
      cur = s
    } else if (t(s.hi) > t(cur.hi)) {
      cur = { lo: cur.lo, hi: s.hi }
    }
  }
  return [...runs, { a: cur.lo, b: cur.hi, out }]
}

const near = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < JOIN * 2
const level = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[2] - b[2])
const meet = (r: EaveRun, s: EaveRun) => near(r.a, s.a) || near(r.a, s.b) || near(r.b, s.a) || near(r.b, s.b)

/** Runs that meet at their ends, grouped: a hip's four eaves are one ring, a gable's two stay apart. */
function connected(runs: readonly EaveRun[]): EaveRun[][] {
  const groups: EaveRun[][] = []
  for (const r of runs) {
    const joined = groups.filter((g) => g.some((s) => meet(r, s)))
    const rest = groups.filter((g) => !joined.includes(g))
    groups.length = 0
    groups.push(...rest, [...joined.flat(), r])
  }
  return groups
}

/**
 * Where the downspouts go: runs that meet at their ends share them (a hip's
 * ring), about one for every DOWNSPOUT_EVERY_M of gutter and at least one per
 * separate gutter, at run ends spread as far apart as they go. With the
 * ground known (`groundAt`, any height scale), the first one stands over the
 * lowest ground, where the water wants to go.
 */
export function downspoutSpots(runs: readonly EaveRun[], groundAt?: (x: number, z: number) => number): DownspoutSpot[] {
  const height = (s: DownspoutSpot) => (groundAt ? groundAt(s.at[0], s.at[2]) : 0)
  return connected(runs).flatMap((group) => {
    const total = group.reduce((a, r) => a + level(r.a, r.b), 0)
    const ends = group.flatMap((r) => [endSpot(r, r.a, r.b), endSpot(r, r.b, r.a)]).filter((s, i, all) => all.findIndex((o) => near(o.at, s.at)) === i)
    const want = Math.min(ends.length, Math.max(1, Math.round(total / DOWNSPOUT_EVERY_M)))
    const chosen = [ends.reduce((best, s) => (height(s) < height(best) ? s : best))]
    while (chosen.length < want) {
      const apart = (s: DownspoutSpot) => Math.min(...chosen.map((c) => level(c.at, s.at)))
      chosen.push(ends.reduce((best, s) => (apart(s) > apart(best) ? s : best)))
    }
    return chosen
  })
}

function endSpot(r: EaveRun, at: V3, other: V3): DownspoutSpot {
  const len = level(at, other) || 1
  return { at, out: r.out, along: [(other[0] - at[0]) / len, (other[2] - at[2]) / len] }
}

const add = (a: V3, b: V3, s = 1): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]

/** A box from its corner along three edge vectors, every face outward. */
function addBox(mesh: MeshData, o: V3, u: V3, v: V3, w: V3): void {
  const sides: readonly (readonly [V3, V3, V3])[] = [[u, v, w], [v, w, u], [w, u, v]]
  for (const [n, e, f] of sides) {
    addPolygon(mesh, [o, add(o, e), add(add(o, e), f), add(o, f)], [-n[0], -n[1], -n[2]])
    const far = add(o, n)
    addPolygon(mesh, [far, add(far, e), add(add(far, e), f), add(far, f)], n)
  }
}

/** A box gutter along each run, hung just under the roof edge and outside it. */
export function gutterMesh(runs: readonly EaveRun[]): MeshData {
  const mesh = emptyMesh()
  for (const r of runs) {
    const corner: V3 = [r.a[0], r.a[1] - GUTTER_DROP - GUTTER_H, r.a[2]]
    addBox(mesh, corner, [r.b[0] - r.a[0], 0, r.b[2] - r.a[2]], [0, GUTTER_H, 0], [r.out[0] * GUTTER_W, 0, r.out[1] * GUTTER_W])
  }
  return mesh
}

/** One downspout from under its spot: a level leg back to the wall, then the pipe down to `bottom`. */
function addDownspout(mesh: MeshData, s: DownspoutSpot, overhangM: number, bottom: number): void {
  const top = s.at[1] - GUTTER_DROP - GUTTER_H
  const out: V3 = [s.out[0], 0, s.out[1]]
  const across: V3 = [-s.out[1] * PIPE, 0, s.out[0] * PIPE]
  // the pipe's outer corner under the gutter: in from the gutter's end, centred under it
  const under = add(add(add([s.at[0], top - PIPE, s.at[2]], [s.along[0], 0, s.along[1]], PIPE_INSET), out, (GUTTER_W - PIPE) / 2), across, -0.5)
  // back to the wall: the pipe stands WALL_GAP off it
  const back = Math.max(0, overhangM + (GUTTER_W - PIPE) / 2 - WALL_GAP - PIPE)
  if (back > 0) addBox(mesh, add(under, out, -back), add([0, 0, 0], out, back + PIPE), [0, PIPE, 0], across)
  const foot = add(under, out, -back)
  const low = Math.min(bottom, foot[1])
  addBox(mesh, [foot[0], low, foot[2]], add([0, 0, 0], out, PIPE), [0, foot[1] - low + (back > 0 ? 0 : PIPE), 0], across)
}

/** The lowest point on the roof and the way out from the roof there: where a roof with no eave sheds its water. */
function lowPoint(roof: MeshData): DownspoutSpot | null {
  const pts = topFaces(roof).flatMap((f) => f.pts)
  if (!pts.length) return null
  const lowest = Math.min(...pts.map((p) => p[1]))
  if (Math.max(...pts.map((p) => p[1])) - lowest < LEVEL) return null
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length
  const cz = pts.reduce((a, p) => a + p[2], 0) / pts.length
  const reach = (p: V3) => Math.hypot(p[0] - cx, p[2] - cz)
  // of the lowest points, the one furthest out
  const at = pts.filter((p) => p[1] < lowest + LEVEL).reduce((best, p) => (reach(p) > reach(best) ? p : best))
  // out along the nearer axis, so the pipe stands square to the wall
  const out: [number, number] = Math.abs(at[0] - cx) > Math.abs(at[2] - cz) ? [Math.sign(at[0] - cx), 0] : [0, Math.sign(at[2] - cz) || 1]
  return { at, out, along: [0, 0] }
}

/** Gutters on every eave and the downspouts that drain them; a roof with no eave drains at its low point. */
export function roofDrainage(roof: MeshData, o: DrainageOptions): Drainage {
  const none = { gutters: emptyMesh(), downspouts: emptyMesh() }
  if (o.type === 'flat' || o.type === 'prow' || o.type === 'none') return none
  const bottom = (s: DownspoutSpot) => o.bottomAt?.(s.at[0], s.at[2]) ?? DEFAULT_BOTTOM
  const runs = eaveRuns(roof)
  const downspouts = emptyMesh()
  if (runs.length) {
    for (const s of downspoutSpots(runs, o.bottomAt)) addDownspout(downspouts, s, o.overhangM, bottom(s))
    return { gutters: gutterMesh(runs), downspouts }
  }
  const low = lowPoint(roof)
  if (!low) return none
  // no gutter to hang from: the pipe starts at the roof's own edge, pulled in so it sits under it
  const at = add(add(low.at, [low.out[0], 0, low.out[1]], -GUTTER_W), [0, 1, 0], GUTTER_DROP + GUTTER_H)
  addDownspout(downspouts, { ...low, at }, Math.max(0, o.overhangM - GUTTER_W), bottom(low))
  return { gutters: emptyMesh(), downspouts }
}
