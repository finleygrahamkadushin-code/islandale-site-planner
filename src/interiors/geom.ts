/**
 * Polygon maths for floor plans, in building-local feet (+z front): a port
 * of the old planner's `INT.geom`. Polygons are lists of [x, z]; "positive"
 * means a positive signed area. Degenerate input gives [], null or 0.
 */
export type Pt = [number, number]
export type Poly = Pt[]
type RPt = readonly [number, number] | readonly number[]
type RPoly = readonly RPt[]

export const EPS = 1e-9
/** Collinear and near-duplicate tolerance when tidying an outline, feet. */
export const TOL = 0.01
/** How close two edges must lie to count as one shared wall, feet. */
export const ON = 0.15
/** Vertex canonicalisation and T-junction distance in the union. */
const CANON = 0.002
/** Pieces smaller than this are numerical dust, square feet. */
const AREA_TINY = 1e-6

const sub = (a: RPt, b: RPt): Pt => [a[0] - b[0], a[1] - b[1]]
const cross = (a: RPt, b: RPt): number => a[0] * b[1] - a[1] * b[0]
const dot = (a: RPt, b: RPt): number => a[0] * b[0] + a[1] * b[1]
const hyp = (a: RPt, b: RPt): number => Math.hypot(a[0] - b[0], a[1] - b[1])
const unit = (v: RPt): Pt => {
  const L = Math.hypot(v[0], v[1])
  return L < EPS ? [0, 0] : [v[0] / L, v[1] / L]
}
const nz = (v: number): number => (v === 0 ? 0 : v)
const lexLess = (p: RPt, q: RPt): boolean => p[0] < q[0] || (p[0] === q[0] && p[1] < q[1])
const copy = (P: RPoly): Poly => P.map((p) => [p[0], p[1]])

export function sarea(P: RPoly): number {
  let a = 0
  const n = P.length
  for (let i = 0; i < n; i++) {
    const p = P[i]
    const q = P[(i + 1) % n]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return a / 2
}

export const area = (P: RPoly): number => (P.length >= 3 ? Math.abs(sarea(P)) : 0)

export function ensureCCW(P: RPoly): Poly {
  const C = copy(P)
  return sarea(C) < 0 ? C.reverse() : C
}

function dedupe(P: RPoly, tol: number): Poly {
  const out: Poly = []
  for (const p of P) if (!out.length || hyp(out[out.length - 1], p) >= tol) out.push([p[0], p[1]])
  while (out.length > 1 && hyp(out[0], out[out.length - 1]) < tol) out.pop()
  return out
}

export function centroid(P: RPoly): Pt | null {
  const n = P.length
  if (!n) return null
  let a = 0
  let cx = 0
  let cz = 0
  for (let i = 0; i < n; i++) {
    const p = P[i]
    const q = P[(i + 1) % n]
    const c = p[0] * q[1] - q[0] * p[1]
    a += c
    cx += (p[0] + q[0]) * c
    cz += (p[1] + q[1]) * c
  }
  if (Math.abs(a / 2) < EPS) {
    let sx = 0
    let sz = 0
    for (const p of P) {
      sx += p[0]
      sz += p[1]
    }
    return [sx / n, sz / n]
  }
  return [cx / (3 * a), cz / (3 * a)]
}

export interface Box {
  readonly x1: number
  readonly z1: number
  readonly x2: number
  readonly z2: number
  readonly w: number
  readonly d: number
}

export function bbox(list: readonly RPoly[]): Box {
  let x1 = Infinity
  let z1 = Infinity
  let x2 = -Infinity
  let z2 = -Infinity
  for (const P of list)
    for (const p of P) {
      x1 = Math.min(x1, p[0])
      x2 = Math.max(x2, p[0])
      z1 = Math.min(z1, p[1])
      z2 = Math.max(z2, p[1])
    }
  if (!Number.isFinite(x1)) return { x1: 0, z1: 0, x2: 0, z2: 0, w: 0, d: 0 }
  return { x1, z1, x2, z2, w: x2 - x1, d: z2 - z1 }
}

export function pointInPoly(P: RPoly, x: number, z: number): boolean {
  let c = false
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i]
    const b = P[j]
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c
  }
  return c
}

export interface SegHit {
  readonly d: number
  readonly t: number
  readonly q: Pt
}

export function distToSeg(p: RPt, a: RPt, b: RPt): SegHit {
  const ab = sub(b, a)
  const L2 = dot(ab, ab)
  let t = L2 < EPS * EPS ? 0 : dot(sub(p, a), ab) / L2
  t = Math.max(0, Math.min(1, t))
  const q: Pt = [a[0] + ab[0] * t, a[1] + ab[1] * t]
  return { d: hyp(p, q), t, q }
}

export function nearestEdge(P: RPoly, p: RPt): (SegHit & { readonly i: number }) | null {
  let best: (SegHit & { i: number }) | null = null
  for (let i = 0; i < P.length; i++) {
    const r = distToSeg(p, P[i], P[(i + 1) % P.length])
    if (!best || r.d < best.d) best = { ...r, i }
  }
  return best
}

export interface Edge {
  readonly i: number
  readonly a: Pt
  readonly b: Pt
  readonly len: number
  /** Unit direction a → b. */
  readonly dir: Pt
  /** Unit normal to the left of a → b: inward on a positive polygon. */
  readonly nin: Pt
}

export function edges(P: RPoly): Edge[] {
  const n = P.length
  const out: Edge[] = []
  for (let i = 0; i < n; i++) {
    const a = P[i]
    const b = P[(i + 1) % n]
    const dir = unit(sub(b, a))
    out.push({ i, a: [a[0], a[1]], b: [b[0], b[1]], len: hyp(a, b), dir: [nz(dir[0]), nz(dir[1])], nin: [nz(-dir[1]), nz(dir[0])] })
  }
  return out
}

export function isConvex(P: RPoly): boolean {
  const V = dedupe(P, EPS)
  const n = V.length
  if (n < 3 || Math.abs(sarea(V)) < EPS) return false
  let sign = 0
  let turn = 0
  for (let i = 0; i < n; i++) {
    const a = V[(i + n - 1) % n]
    const b = V[i]
    const c = V[(i + 1) % n]
    const u = unit(sub(b, a))
    const w = unit(sub(c, b))
    const cr = cross(u, w)
    if (Math.abs(cr) > 1e-9) {
      const s = cr > 0 ? 1 : -1
      if (sign && s !== sign) return false
      sign = s
    } else if (dot(u, w) < 0) return false
    turn += Math.atan2(cr, dot(u, w))
  }
  // rejects self-intersecting "stars"
  return Math.abs(Math.abs(turn) - 2 * Math.PI) < 1e-6
}

/** Round every coordinate to a multiple of q. */
export function roundPts(P: RPoly, q = 0.01): Poly {
  const inv = 1 / q
  const ri = Math.round(inv)
  const f = Math.abs(inv - ri) < 1e-9 && ri > 0 ? (v: number) => nz(Math.round(v * ri) / ri) : (v: number) => nz(Math.round(v / q) * q)
  return P.map((p) => [f(p[0]), f(p[1])])
}

/** Drop near-duplicate, collinear and spike vertices, keeping the winding. */
function simplifyRaw(P: RPoly, tol: number): Poly {
  let V = dedupe(P, tol)
  let guard = 0
  let changed = true
  while (changed && V.length >= 3 && guard++ < 10000) {
    changed = false
    for (let i = 0; i < V.length && V.length >= 3; ) {
      const n = V.length
      const u = unit(sub(V[i], V[(i + n - 1) % n]))
      const w = unit(sub(V[(i + 1) % n], V[i]))
      if (Math.abs(cross(u, w)) < 1e-4) {
        V.splice(i, 1)
        changed = true
      } else i++
    }
    const D = dedupe(V, tol)
    if (D.length !== V.length) {
      V = D
      changed = true
    }
  }
  if (V.length < 3 || Math.abs(sarea(V)) < 1e-6) return []
  return V
}

export function simplify(P: RPoly, tol = TOL): Poly {
  const S = simplifyRaw(P, Math.max(0, tol))
  return S.length ? ensureCCW(S) : []
}

// ---------- clipping

/** Edge p→q crossing the clip line, from canonical signed distances, so neighbouring pieces get identical points. */
function isect(p: RPt, q: RPt, sp: number, sq: number): Pt {
  if (lexLess(q, p)) {
    ;[p, q] = [q, p]
    ;[sp, sq] = [sq, sp]
  }
  let t = sp === sq ? 0 : sp / (sp - sq)
  if (!(t >= 0)) t = 0
  else if (t > 1) t = 1
  return [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]
}

/** The part of P left of a → b, keeping P's winding. */
function clipHalfRaw(P: RPoly, a: RPt, b: RPt): Poly {
  let A = a
  let B = b
  let sg = 1
  if (lexLess(b, a)) {
    A = b
    B = a
    sg = -1
  }
  const dx = B[0] - A[0]
  const dz = B[1] - A[1]
  const L = Math.hypot(dx, dz)
  if (L < EPS) return []
  const n = P.length
  if (n < 3) return []
  const S = P.map((p) => (dx * (p[1] - A[1]) - dz * (p[0] - A[0])) / L)
  const out: Poly = []
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const pin = sg * S[i] >= -EPS
    const qin = sg * S[j] >= -EPS
    if (pin) out.push([P[i][0], P[i][1]])
    if (pin !== qin) out.push(isect(P[i], P[j], S[i], S[j]))
  }
  const D = dedupe(out, 1e-9)
  return D.length < 3 || Math.abs(sarea(D)) < 1e-12 ? [] : D
}

const positive = (P: Poly): Poly => (P.length >= 3 && sarea(P) > 0 ? P : [])

export const clipHalf = (P: RPoly, a: RPt, b: RPt): Poly => (P.length >= 3 ? positive(clipHalfRaw(ensureCCW(P), a, b)) : [])

function clipConvexRaw(P: RPoly, C: RPoly): Poly {
  let R = ensureCCW(P)
  const K = ensureCCW(C)
  if (K.length < 3 || sarea(K) < EPS) return []
  for (let i = 0; i < K.length && R.length; i++) R = clipHalfRaw(R, K[i], K[(i + 1) % K.length])
  return R
}

export const clipConvex = (P: RPoly, C: RPoly): Poly => (P.length >= 3 && C.length >= 3 ? positive(clipConvexRaw(P, C)) : [])

/** Convex C less convex K, as convex pieces. */
export function convexDiff(C0: RPoly, K0: RPoly): Poly[] {
  const C = ensureCCW(C0)
  if (C.length < 3 || sarea(C) < AREA_TINY) return []
  const K = ensureCCW(K0)
  if (K.length < 3 || sarea(K) < AREA_TINY) return [C]
  let rem = C
  const out: Poly[] = []
  for (let j = 0; j < K.length; j++) {
    const a = K[j]
    const b = K[(j + 1) % K.length]
    if (hyp(a, b) < EPS) continue
    const outside = clipHalfRaw(rem, b, a)
    if (outside.length && Math.abs(sarea(outside)) > AREA_TINY) out.push(outside)
    rem = clipHalfRaw(rem, a, b)
    if (!rem.length) break
  }
  return out.filter((p) => sarea(p) > 0)
}

// ---------- triangulation (ear clipping, tolerant of collinear points and spikes)

const inTri = (p: RPt, a: RPt, b: RPt, c: RPt): boolean =>
  cross(sub(b, a), sub(p, a)) >= -EPS && cross(sub(c, b), sub(p, b)) >= -EPS && cross(sub(a, c), sub(p, c)) >= -EPS

function triQuality(a: RPt, b: RPt, c: RPt): number {
  const l = Math.max(hyp(a, b), hyp(b, c), hyp(c, a))
  return cross(sub(b, a), sub(c, a)) / (l * l)
}

export function triangulate(P: RPoly): Poly[] {
  const V = dedupe(ensureCCW(P), 1e-9)
  if (V.length < 3 || Math.abs(sarea(V)) < 1e-9) return []
  const out: Poly[] = []
  const idx = V.map((_, i) => i)
  const emit = (a: Pt, b: Pt, c: Pt) => {
    const T: Poly = [[a[0], a[1]], [b[0], b[1]], [c[0], c[1]]]
    if (sarea(T) > 1e-9) out.push(T)
  }
  let guard = 0
  while (idx.length > 3 && guard++ < 100000) {
    const n = idx.length
    let ear = -1
    let earQ = -Infinity
    let degen = -1
    let conv = -1
    let convC = -Infinity
    for (let k = 0; k < n; k++) {
      const a = V[idx[(k + n - 1) % n]]
      const b = V[idx[k]]
      const c = V[idx[(k + 1) % n]]
      const cr = cross(sub(b, a), sub(c, b))
      const scale = Math.max(hyp(a, b) * hyp(b, c), EPS)
      if (Math.abs(cr) <= 1e-10 * scale) {
        if (degen < 0) degen = k
        continue
      }
      if (cr < 0) continue
      if (cr > convC) {
        convC = cr
        conv = k
      }
      let ok = true
      for (let m = 0; m < n && ok; m++) {
        if (m === k || m === (k + n - 1) % n || m === (k + 1) % n) continue
        const p = V[idx[m]]
        if (hyp(p, a) < 1e-9 || hyp(p, b) < 1e-9 || hyp(p, c) < 1e-9) continue
        if (inTri(p, a, b, c)) ok = false
      }
      if (ok) {
        const q = triQuality(a, b, c)
        if (q > earQ) {
          earQ = q
          ear = k
        }
      }
    }
    const k = ear >= 0 ? ear : degen >= 0 ? degen : conv
    if (k < 0) break
    if (ear >= 0 || degen < 0) emit(V[idx[(k + n - 1) % n]], V[idx[k]], V[idx[(k + 1) % n]])
    idx.splice(k, 1)
  }
  if (idx.length === 3) emit(V[idx[0]], V[idx[1]], V[idx[2]])
  return out
}

/** One convex piece if P is convex, else its triangles. */
export function toPieces(P: RPoly): Poly[] {
  const V = dedupe(P, 1e-9)
  if (V.length < 3 || Math.abs(sarea(V)) < AREA_TINY) return []
  return isConvex(V) ? [ensureCCW(V)] : triangulate(V)
}

const convexParts = (P: RPoly): Poly[] => (isConvex(P) ? [ensureCCW(P)] : triangulate(P))

// ---------- union by cancelling shared edges

export interface Union {
  /** Outer loops, positive, largest first. */
  readonly outer: Poly[]
  /** Hole loops, made positive. */
  readonly holes: Poly[]
}

export function unionPieces(pieces: readonly RPoly[]): Union {
  const P = pieces.filter((p) => p.length >= 3 && Math.abs(sarea(p)) > AREA_TINY).map(ensureCCW)
  // canonical vertices
  const verts: Pt[] = []
  const cells = new Map<string, number[]>()
  const vid = (p: Pt): number => {
    const ix = Math.round(p[0] / CANON)
    const iz = Math.round(p[1] / CANON)
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        for (const id of cells.get(`${ix + dx},${iz + dz}`) ?? []) {
          const v = verts[id]
          if (Math.abs(v[0] - p[0]) <= CANON && Math.abs(v[1] - p[1]) <= CANON) return id
        }
      }
    const id = verts.length
    verts.push([p[0], p[1]])
    const key = `${ix},${iz}`
    const L = cells.get(key)
    if (L) L.push(id)
    else cells.set(key, [id])
    return id
  }
  const rings: number[][] = []
  for (const p of P) {
    const r: number[] = []
    for (const v of p) {
      const id = vid(v)
      if (r[r.length - 1] !== id) r.push(id)
    }
    while (r.length > 1 && r[0] === r[r.length - 1]) r.pop()
    if (r.length >= 3) rings.push(r)
  }
  // split T-junctions
  const E: [number, number][] = []
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const p = r[i]
      const q = r[(i + 1) % r.length]
      const a = verts[p]
      const b = verts[q]
      const x1 = Math.min(a[0], b[0]) - CANON
      const x2 = Math.max(a[0], b[0]) + CANON
      const z1 = Math.min(a[1], b[1]) - CANON
      const z2 = Math.max(a[1], b[1]) + CANON
      const hits: [number, number][] = []
      for (let v = 0; v < verts.length; v++) {
        if (v === p || v === q) continue
        const w = verts[v]
        if (w[0] < x1 || w[0] > x2 || w[1] < z1 || w[1] > z2) continue
        const s = distToSeg(w, a, b)
        if (s.d < CANON && s.t > 0 && s.t < 1) hits.push([s.t, v])
      }
      hits.sort((m, n) => m[0] - n[0])
      let prev = p
      for (const h of hits)
        if (h[1] !== prev) {
          E.push([prev, h[1]])
          prev = h[1]
        }
      if (prev !== q) E.push([prev, q])
    }
  // cancel opposite directed edges
  const count = new Map<string, number>()
  for (const [p, q] of E) count.set(`${p}>${q}`, (count.get(`${p}>${q}`) ?? 0) + 1)
  const rest: [number, number][] = []
  for (const [k, c] of count) {
    const [p, q] = k.split('>').map(Number)
    const keep = c - Math.min(c, count.get(`${q}>${p}`) ?? 0)
    for (let i = 0; i < keep; i++) rest.push([p, q])
  }
  // chain loops, taking the sharpest left turn at every vertex
  const outOf = new Map<number, number[]>()
  rest.forEach((e, i) => {
    const L = outOf.get(e[0])
    if (L) L.push(i)
    else outOf.set(e[0], [i])
  })
  const used = new Array<boolean>(rest.length).fill(false)
  const loops: Poly[] = []
  for (let e0 = 0; e0 < rest.length; e0++) {
    if (used[e0]) continue
    used[e0] = true
    const start = rest[e0][0]
    const loop = [start]
    let prev = start
    let cur = rest[e0][1]
    let closed = false
    for (let steps = 0; steps <= rest.length; steps++) {
      if (cur === start) {
        closed = true
        break
      }
      loop.push(cur)
      const din = sub(verts[cur], verts[prev])
      let best = -1
      let bestA = -Infinity
      for (const ei of outOf.get(cur) ?? []) {
        if (used[ei]) continue
        const dout = sub(verts[rest[ei][1]], verts[cur])
        const ang = Math.atan2(cross(din, dout), dot(din, dout))
        if (ang > bestA) {
          bestA = ang
          best = ei
        }
      }
      if (best < 0) break
      used[best] = true
      prev = cur
      cur = rest[best][1]
    }
    if (closed && loop.length >= 3) loops.push(loop.map((i) => [verts[i][0], verts[i][1]]))
  }
  const outer: Poly[] = []
  const holes: Poly[] = []
  for (const L of loops) {
    const S = simplifyRaw(L, TOL)
    if (!S.length) continue
    const a = sarea(S)
    if (a > AREA_TINY) outer.push(S)
    else if (a < -AREA_TINY) holes.push(ensureCCW(S))
  }
  outer.sort((m, n) => sarea(n) - sarea(m))
  return { outer, holes }
}

// ---------- regions (lists of convex pieces)

/** P cut to the tiles, as convex pieces. */
export function intersectRegion(P: RPoly, tiles: readonly RPoly[]): Poly[] {
  if (P.length < 3) return []
  const out: Poly[] = []
  const T = tiles.filter((t) => t.length >= 3).flatMap(convexParts)
  for (const pc of toPieces(P))
    for (const t of T) {
      const r = clipConvexRaw(pc, t)
      if (r.length && Math.abs(sarea(r)) > AREA_TINY) out.push(ensureCCW(r))
    }
  return out
}

/** Pieces less P, as convex pieces. */
export function subtractRegion(pieces: readonly RPoly[], P: RPoly): Poly[] {
  let cur = pieces.filter((p) => p.length >= 3).flatMap(convexParts)
  const K = P.length >= 3 ? toPieces(P) : []
  for (const k of K) {
    const b = bbox([k])
    const next: Poly[] = []
    for (const c of cur) {
      const cb = bbox([c])
      if (cb.x2 < b.x1 - EPS || cb.x1 > b.x2 + EPS || cb.z2 < b.z1 - EPS || cb.z1 > b.z2 + EPS) next.push(c)
      else next.push(...convexDiff(c, k))
    }
    cur = next
  }
  return cur.filter((p) => sarea(p) > AREA_TINY)
}

/** Convex tiles covering the union of the list with no overlaps (earlier polygons win). */
export function disjointTiles(list: readonly RPoly[]): Poly[] {
  const tiles: Poly[] = []
  const done: Poly[] = []
  for (const M of list.filter((p) => p.length >= 3)) {
    const parts = convexParts(M)
    let cur = parts
    for (const D of done) cur = cur.flatMap((c) => convexDiff(c, D))
    for (const c of cur) if (Math.abs(sarea(c)) > AREA_TINY) tiles.push(c)
    done.push(...parts)
  }
  return tiles
}

/** P cut along the infinite line a → b. */
export function splitByLine(P: RPoly, a: RPt, b: RPt): { readonly left: Poly[]; readonly right: Poly[] } {
  if (P.length < 3 || hyp(a, b) < EPS) return { left: [], right: [] }
  const L: Poly[] = []
  const R: Poly[] = []
  for (const pc of toPieces(P)) {
    const l = clipHalfRaw(pc, a, b)
    const r = clipHalfRaw(pc, b, a)
    if (l.length) L.push(l)
    if (r.length) R.push(r)
  }
  return { left: unionPieces(L).outer, right: unionPieces(R).outer }
}

export interface Shared {
  /** Edge index on P and on Q. */
  readonly ia: number
  readonly ib: number
  readonly len: number
  readonly a: Pt
  readonly b: Pt
}

/** Stretches where an edge of P lies on an edge of Q running the other way (a wall the two share). */
export function sharedSegments(P: RPoly, Q: RPoly, tol = ON): Shared[] {
  const out: Shared[] = []
  const EQ = edges(Q)
  for (const e of edges(P)) {
    if (e.len < EPS) continue
    for (const f of EQ) {
      if (f.len < EPS) continue
      const nd: Pt = [-f.dir[0], -f.dir[1]]
      if (Math.abs(Math.atan2(cross(e.dir, nd), dot(e.dir, nd))) >= 0.01) continue
      const d1 = Math.abs(cross(e.dir, sub(f.a, e.a)))
      const d2 = Math.abs(cross(e.dir, sub(f.b, e.a)))
      if (Math.max(d1, d2) >= tol) continue
      const s1 = dot(sub(f.a, e.a), e.dir)
      const s2 = dot(sub(f.b, e.a), e.dir)
      const s0 = Math.max(0, Math.min(s1, s2))
      const se = Math.min(e.len, Math.max(s1, s2))
      if (se - s0 > 0.05)
        out.push({
          ia: e.i,
          ib: f.i,
          len: se - s0,
          a: [e.a[0] + e.dir[0] * s0, e.a[1] + e.dir[1] * s0],
          b: [e.a[0] + e.dir[0] * se, e.a[1] + e.dir[1] * se],
        })
    }
  }
  return out
}

export function segIntersect(a: RPt, b: RPt, c: RPt, d: RPt): { readonly t: number; readonly u: number; readonly p: Pt } | null {
  const r = sub(b, a)
  const s = sub(d, c)
  const den = cross(r, s)
  if (Math.abs(den) < EPS) return null
  const ca = sub(c, a)
  const t = cross(ca, s) / den
  const u = cross(ca, r) / den
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null
  return { t, u, p: [a[0] + r[0] * t, a[1] + r[1] * t] }
}

/**
 * Does the outline go round without its walls crossing or touching each
 * other (no bow-tie, no corner standing on another wall)? Repeated corners
 * are ignored; fewer than three corners is not an outline.
 */
export function isSimple(P0: RPoly): boolean {
  const P = dedupe(P0, 1e-6)
  const n = P.length
  if (n < 3) return false
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      if (segIntersect(P[i], P[(i + 1) % n], P[j], P[(j + 1) % n])) return false
    }
  return true
}

export function lineIntersect(a: RPt, b: RPt, c: RPt, d: RPt): Pt | null {
  const r = sub(b, a)
  const s = sub(d, c)
  const den = cross(r, s)
  if (Math.abs(den) < EPS || hyp(a, b) < EPS || hyp(c, d) < EPS) return null
  const t = cross(sub(c, a), s) / den
  return [a[0] + r[0] * t, a[1] + r[1] * t]
}

// ---------- shape helpers

/** Every edge of a positive polygon moved inward by d (one number or one per edge); null if it folds. */
export function offsetPoly(P: RPoly, d: number | readonly number[]): Poly | null {
  const n = P.length
  if (n < 3 || sarea(P) <= EPS) return null
  const E = edges(P)
  if (E.some((e) => e.len < EPS)) return null
  const D = (i: number) => (typeof d === 'number' ? d : (d[i] ?? 0))
  const base = E.map((e, i): Pt => [e.a[0] + e.nin[0] * D(i), e.a[1] + e.nin[1] * D(i)])
  const Q: Poly = []
  for (let i = 0; i < n; i++) {
    const h = (i + n - 1) % n
    const e0 = E[h]
    const e1 = E[i]
    let v: Pt | null = null
    if (Math.abs(cross(e0.dir, e1.dir)) >= 1e-9) {
      const p0 = base[h]
      const p1 = base[i]
      v = lineIntersect(p0, [p0[0] + e0.dir[0], p0[1] + e0.dir[1]], p1, [p1[0] + e1.dir[0], p1[1] + e1.dir[1]])
    }
    Q.push(v ?? base[i])
  }
  for (let i = 0; i < n; i++) if (dot(sub(Q[(i + 1) % n], Q[i]), E[i].dir) <= EPS) return null
  return sarea(Q) <= 0 ? null : Q
}

export interface Obb {
  readonly cx: number
  readonly cz: number
  readonly w: number
  readonly d: number
  /** Radians, of the longest edge. */
  readonly ang: number
  readonly u: Pt
  readonly v: Pt
}

/** Box aligned with the longest edge. */
export function obb(P: RPoly): Obb | null {
  if (P.length < 2) return null
  const E = edges(P)
  let e = E[0]
  for (const f of E) if (f.len > e.len) e = f
  if (e.len < EPS) return null
  const u = e.dir
  const v: Pt = [nz(-u[1]), nz(u[0])]
  let u1 = Infinity
  let u2 = -Infinity
  let v1 = Infinity
  let v2 = -Infinity
  for (const p of P) {
    const a = dot(p, u)
    const b = dot(p, v)
    u1 = Math.min(u1, a)
    u2 = Math.max(u2, a)
    v1 = Math.min(v1, b)
    v2 = Math.max(v2, b)
  }
  const mu = (u1 + u2) / 2
  const mv = (v1 + v2) / 2
  return { cx: mu * u[0] + mv * v[0], cz: mu * u[1] + mv * v[1], w: u2 - u1, d: v2 - v1, ang: Math.atan2(u[1], u[0]), u: [u[0], u[1]], v }
}

export function distToBoundary(P: RPoly, p: RPt): number {
  let d = Infinity
  for (let i = 0; i < P.length; i++) d = Math.min(d, distToSeg(p, P[i], P[(i + 1) % P.length]).d)
  return d
}

/** A good spot for a room label: the centroid if it is inside and clear of the walls, else the deepest point on a grid. */
export function labelPoint(P: RPoly): Pt | null {
  const c = centroid(P)
  if (!c) return null
  if (P.length < 3) return c
  if (pointInPoly(P, c[0], c[1]) && distToBoundary(P, c) >= 1) return c
  const b = bbox([P])
  const N = 20
  let best: Pt | null = null
  let bd = -Infinity
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const x = b.x1 + ((i + 0.5) * b.w) / N
      const z = b.z1 + ((j + 0.5) * b.d) / N
      if (!pointInPoly(P, x, z)) continue
      const d = distToBoundary(P, [x, z])
      if (d > bd) {
        bd = d
        best = [x, z]
      }
    }
  if (!best) return c
  if (pointInPoly(P, c[0], c[1]) && distToBoundary(P, c) >= bd) return c
  return best
}

export function rectPoly(x: number, z: number, w: number, d: number): Poly {
  w = Math.abs(w)
  d = Math.abs(d)
  if (![x, z, w, d].every(Number.isFinite) || w < EPS || d < EPS) return []
  return [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2]]
}

export function rectFrom2(a: RPt, b: RPt): Poly {
  const x1 = Math.min(a[0], b[0])
  const x2 = Math.max(a[0], b[0])
  const z1 = Math.min(a[1], b[1])
  const z2 = Math.max(a[1], b[1])
  return x2 - x1 < EPS || z2 - z1 < EPS ? [] : [[x1, z1], [x2, z1], [x2, z2], [x1, z2]]
}

export const translate = (P: RPoly, dx: number, dz: number): Poly => P.map((p) => [p[0] + dx, p[1] + dz])

export function rotatePts(P: RPoly, cx: number, cz: number, deg: number): Poly {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return P.map((p) => {
    const u = p[0] - cx
    const v = p[1] - cz
    return [cx + u * c - v * s, cz + u * s + v * c]
  })
}

// ---------- snapping

export const snapGrid = (v: number, g: number): number => (g > 0 ? nz(Math.round(v / g) * g) : v)

export interface SnapContext {
  readonly verts?: readonly RPt[]
  readonly edges?: readonly (readonly [RPt, RPt])[]
  readonly grid?: number
}

export interface Snap {
  readonly p: Pt
  readonly kind: 'vertex' | 'intersection' | 'edge' | 'grid' | 'none'
  readonly edge?: readonly [Pt, Pt]
}

/** Snap a point to the nearest vertex, then an edge crossing, then an edge (on the grid along it), then the grid. */
export function snapPoint(p: RPt, ctx: SnapContext, tol: number): Snap {
  const verts = ctx.verts ?? []
  const segs = (ctx.edges ?? []).filter((e) => hyp(e[0], e[1]) > EPS)
  const grid = Math.max(0, ctx.grid ?? 0)
  tol = Math.max(0, tol)
  let bv: RPt | null = null
  let bd = Infinity
  for (const v of verts) {
    const d = hyp(v, p)
    if (d <= tol && d < bd) {
      bd = d
      bv = v
    }
  }
  if (bv) return { p: [bv[0], bv[1]], kind: 'vertex' }
  const near = segs.flatMap((e) => {
    const r = distToSeg(p, e[0], e[1])
    return r.d < tol ? [{ e, r, u: unit(sub(e[1], e[0])) }] : []
  })
  let bi: Pt | null = null
  bd = Infinity
  for (let i = 0; i < near.length; i++)
    for (let j = i + 1; j < near.length; j++) {
      if (Math.abs(cross(near[i].u, near[j].u)) <= 0.1) continue
      const x = lineIntersect(near[i].e[0], near[i].e[1], near[j].e[0], near[j].e[1])
      if (x) {
        const d = hyp(x, p)
        if (d <= tol && d < bd) {
          bd = d
          bi = x
        }
      }
    }
  if (bi) return { p: bi, kind: 'intersection' }
  if (near.length) {
    let n0 = near[0]
    for (const n of near) if (n.r.d < n0.r.d) n0 = n
    const [a, b] = n0.e
    const u = n0.u
    const q: Pt = [n0.r.q[0], n0.r.q[1]]
    if (grid > 0) {
      if (Math.abs(u[0]) < 1e-6) q[1] = Math.max(Math.min(a[1], b[1]), Math.min(Math.max(a[1], b[1]), snapGrid(q[1], grid)))
      else if (Math.abs(u[1]) < 1e-6) q[0] = Math.max(Math.min(a[0], b[0]), Math.min(Math.max(a[0], b[0]), snapGrid(q[0], grid)))
    }
    return { p: q, kind: 'edge', edge: [[a[0], a[1]], [b[0], b[1]]] }
  }
  if (grid > 0) return { p: [snapGrid(p[0], grid), snapGrid(p[1], grid)], kind: 'grid' }
  return { p: [p[0], p[1]], kind: 'none' }
}

/** `to` turned about `from` to the nearest step (degrees). */
export function snapAngle(from: RPt, to: RPt, step = 15): Pt {
  const v = sub(to, from)
  const L = Math.hypot(v[0], v[1])
  if (L < EPS || !(step > 0)) return [to[0], to[1]]
  const s = (step * Math.PI) / 180
  const a = Math.round(Math.atan2(v[1], v[0]) / s) * s
  const r = (x: number) => nz(Math.round(x * 1e9) / 1e9)
  return [r(from[0] + L * Math.cos(a)), r(from[1] + L * Math.sin(a))]
}
