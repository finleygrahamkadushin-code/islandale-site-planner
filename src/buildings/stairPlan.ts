import { emptyMesh, type MeshData } from './geom'
import type { RailStyle } from './railEdits'
import { band, EXT_M, evalH, hClamp, hFlat, hMax, hostCurve, hTop, type TopEdge, type XZ } from './stairCurve'
import { box, prismX, slab } from './stairMesh'
import { handrail, railSection, WING_RAIL_M, type HandrailCtx, type StairRailInfo } from './stairRails'
import { stairGeomMath, TREAD_MIN_M } from './stairs'

/**
 * Pure stair and ramp layout, ported from the old planner's stair-geom
 * planStair. Stair frame, metres: x across (-w/2..w/2), y up with 0 at
 * the top walking surface, z along the run from the top (-run/2) to the
 * foot (+run/2); it is the wing's mass frame times 0.3048.
 */

export type StairRole = 'tread' | 'riser' | 'stringer' | 'post' | 'ramp' | 'curb' | 'skirt' | 'foot' | 'rail' | 'glass'
/** What each piece is made of: treads, stringers, ramp surface and curbs 'stair'; risers and skirts 'trim'. */
export type StairMat = 'stair' | 'trim' | 'post' | 'foundation' | 'rail' | 'glass'

export interface StairItem {
  readonly role: StairRole
  readonly mat: StairMat
  readonly mesh: MeshData
  /** Handrails and their glass: the side, -1 (edge 3) or +1 (edge 1). */
  readonly side?: -1 | 1
}

export interface StairSpec {
  readonly kind: 'stair' | 'ramp'
  readonly w: number
  readonly run: number
  /** Top walking surface down to the ground at the foot, metres. */
  readonly drop: number
  readonly topEdge?: TopEdge
  readonly nosing?: number
  readonly style?: RailStyle
  /** false: no handrails. */
  readonly rail?: boolean
  readonly railH?: number
  readonly rT?: number
  readonly clearTop?: boolean
  /** Ground under the centre line at z, in stair-frame y. */
  readonly groundAt?: (z: number) => number
  readonly footPlate?: boolean
  /** Riser count override (path pieces). */
  readonly n?: number
}

export interface StairInfo {
  readonly kind: 'stair' | 'ramp'
  readonly w: number
  readonly run: number
  readonly drop: number
  /** Risers (0 for a ramp), rise and tread (metres). */
  readonly n: number
  readonly rise: number
  readonly tread: number
  /** Stairs: risers of 7 in or less and treads of 11 in or more. Ramps: always true. */
  readonly ok: boolean
  /** Drop over run (ramps; 0 for stairs). */
  readonly slope: number
  /** A ramp steeper than 1:12. */
  readonly steep: boolean
  readonly clearTop: boolean
  readonly rails: readonly StairRailInfo[]
  /** Support posts under the stringers. */
  readonly posts: number
  /** Treads (or the sloped slab) the host curve left nothing of. */
  readonly dropped: number
  /** The top tread's (ramp: top plate's) polygons, fitted to the host. */
  readonly topTread: readonly (readonly XZ[])[]
  readonly topNosingZ: number
}

export interface StairPlan {
  readonly items: readonly StairItem[]
  readonly info: StairInfo
}

const TREAD_T = 0.04
const RISER_T = 0.02
const STRINGER_W = 0.04
const STRINGER_D = 0.25
const POST_SPACING_M = 2.4
const POST_GAP_M = 0.4
const RAMP_T = 0.15
const CURB_M = 0.05
const SKIRT_T = 0.025
const RAMP_MAX_SLOPE = 1 / 12

const sortedUnique = (zs: readonly number[], lo: number, hi: number) =>
  zs
    .filter((z) => z >= lo - 1e-9 && z <= hi + 1e-9)
    .sort((a, b) => a - b)
    .filter((z, k, A) => !k || z - A[k - 1] > 1e-6)

interface Ctx {
  readonly w: number
  readonly run: number
  readonly drop: number
  readonly zf: number
  readonly Ht: XZ[]
  readonly zt: (x: number) => number
  readonly gAt: (z: number) => number
  readonly railOn: boolean
  readonly rail: HandrailCtx
}

/** Plan a stair or ramp wing: its pieces (stair frame metres) and the numbers the part inspector shows. */
export function planStair(spec: StairSpec): StairPlan {
  const w = Math.max(0.3, spec.w || 1.2)
  const run = Math.max(0.2, spec.run || 2)
  const drop = Math.max(0, spec.drop || 0)
  const style = spec.style ?? 'wood'
  const H0 = hostCurve(spec.topEdge ?? null, w, run)
  const Ht = hClamp(H0, -run / 2 - EXT_M, run / 2)
  const zt = (x: number) => evalH(Ht, x)
  const groundAt = spec.groundAt
  const gAt = (z: number) => {
    const y = groundAt ? groundAt(z) : NaN
    return Number.isFinite(y) ? y : -drop
  }
  const clearTop = !!spec.clearTop
  const railH = spec.railH && spec.railH > 0.3 ? spec.railH : WING_RAIL_M
  const rT = spec.rT && spec.rT > 0.005 ? spec.rT : railSection(style)
  const c: Ctx = { w, run, drop, zf: run / 2, Ht, zt, gAt, railOn: spec.rail !== false && style !== 'none', rail: { w, H: railH, rT, style, clearTop, zt } }
  const items: StairItem[] = []
  const add = (role: StairRole, mat: StairMat, mesh: MeshData | null, side?: -1 | 1) => {
    if (mesh && mesh.positions.length) items.push(side ? { role, mat, mesh, side } : { role, mat, mesh })
  }
  const body = spec.kind === 'ramp' ? planRamp(c, add) : planSteps(c, spec, add)
  const footPlate = spec.footPlate ?? true
  if (footPlate) add('foot', 'foundation', box(emptyMesh(), -w / 2 - 0.05, w / 2 + 0.05, -drop - 0.08, -drop + 0.02, c.zf - 0.05, c.zf + 0.55))
  return { items, info: { kind: spec.kind, w, run, drop, clearTop, ...body } }
}

type Add = (role: StairRole, mat: StairMat, mesh: MeshData | null, side?: -1 | 1) => void
type Body = Omit<StairInfo, 'kind' | 'w' | 'run' | 'drop' | 'clearTop'>

/** Both sides' handrails, added as items; their info. */
function rails(c: Ctx, add: Add, zMin: number, zMax: number, line: (z: number) => number, surf: (z: number) => number): StairRailInfo[] {
  return ([-1, 1] as const).map((sg) => {
    const r = handrail(c.rail, sg, zMin, zMax, line, surf)
    add('rail', 'rail', r.frame, sg)
    add('glass', 'glass', r.glass, sg)
    return r.info
  })
}

/** Nosed treads, closed risers, housed stringers, support posts and (n > 1) handrails. */
function planSteps(c: Ctx, spec: StairSpec, add: Add): Body {
  const { w, run, drop, zf, Ht } = c
  const M = stairGeomMath(drop, run)
  const over = spec.n && spec.n > 0 ? Math.floor(spec.n) : 0
  const n = Math.max(1, over || M.n || 1)
  const rise = drop / n
  const tread = run / n
  const ok = over ? tread >= TREAD_MIN_M - 1e-9 : M.ok
  const nos = spec.nosing !== undefined && Number.isFinite(spec.nosing) ? Math.max(0, spec.nosing) : 0.025
  const Z = (i: number) => -run / 2 + i * tread
  const z1 = Z(1)
  const top = hTop(Ht)

  // treads, 0.04 thick with the nosing over the riser; tread 0 is fitted to the host, flush with its surface
  const tg = emptyMesh()
  let dropped = 0
  let topTread: XZ[][] = []
  for (let i = 0; i < n; i++) {
    const low = i === 0 ? Ht : top > Z(i) + 1e-9 ? hMax(Ht, Z(i) - nos) : hFlat(w, Z(i) - nos)
    const polys = band(low, Z(i + 1))
    if (i === 0) topTread = polys
    if (!polys.length) dropped++
    for (const p of polys) slab(tg, p, () => -i * rise, TREAD_T)
  }
  // closed risers behind each nosing, down to the next tread (the last to the ground)
  const rg = emptyMesh()
  for (let j = 1; j <= n; j++) {
    const za = Z(j) - nos - RISER_T
    const zb = Z(j) - nos
    const yt = -(j - 1) * rise - TREAD_T
    const yb = j < n ? -j * rise : -drop
    if (!(yt - yb > 0.005)) continue
    const low = top > za + 1e-9 ? hMax(Ht, za) : hFlat(w, za)
    for (const p of band(low, zb)) slab(rg, p, () => yt, yt - yb)
  }
  add('tread', 'stair', tg)
  add('riser', 'trim', rg)

  // housed stringers along the nosing line, 0.04 × 0.25 square to the slope, from the host to the ground at the foot
  const yLine = (z: number) => (-(z - z1) * rise) / tread + 0.02
  const yu = (z: number) => Math.min(0, yLine(z))
  const Dv = (STRINGER_D * Math.hypot(rise, tread)) / tread
  const ybl = (z: number) => Math.max(-drop, Math.min(-STRINGER_D, yLine(z) - Dv))
  const sgb = emptyMesh()
  const pgb = emptyMesh()
  let posts = 0
  for (const sg of [-1, 1]) {
    const xs = sg * (w / 2 - 0.02)
    const zs = c.zt(xs)
    if (zs > zf - 0.15) continue
    const brk = [zs, z1, zf]
    if (rise > 1e-6) brk.push(z1 + ((0.02 - Dv + STRINGER_D) * tread) / rise, z1 + ((0.02 - Dv + drop) * tread) / rise)
    const Zs = sortedUnique(brk, zs, zf)
    const upper: XZ[] = Zs.map((z) => [z, yu(z)])
    const lower: XZ[] = [...Zs].reverse().map((z) => [z, Math.min(ybl(z), yu(z) - 0.02)])
    lower[0] = [zf, -drop]
    prismX(sgb, [...upper, ...lower], sg > 0 ? w / 2 - STRINGER_W : -w / 2, sg > 0 ? w / 2 : -w / 2 + STRINGER_W)
    // support posts every 2.4 m of run where the stringer is more than 0.4 m off the ground (ground read on the centre line)
    for (let k = 1; ; k++) {
      const zp = -run / 2 + POST_SPACING_M * k
      if (zp >= zf - 0.3) break
      if (zp < zs + 0.1) continue
      const under = ybl(zp)
      const gy = Math.min(c.gAt(zp), under)
      if (under - gy > POST_GAP_M) {
        box(pgb, xs - 0.045, xs + 0.045, gy - 0.05, under, zp - 0.045, zp + 0.045)
        posts++
      }
    }
  }
  add('stringer', 'stair', sgb)
  add('post', 'post', pgb)

  // handrails over the nosing line, from the top nosing to the foot, only with more than one riser
  const yN = (z: number) => (-(z - z1) * rise) / tread
  const yT = (z: number) => -Math.max(0, Math.min(n - 1, Math.floor((z - Z(0)) / tread + 1e-9))) * rise
  const railInfo = c.railOn && n > 1 ? rails(c, add, z1, zf, yN, yT) : []
  return { n, rise, tread, ok, slope: 0, steep: false, rails: railInfo, posts, dropped, topTread, topNosingZ: z1 }
}

/** A level plate to the host, one slope over the whole run, curbs, skirts to the ground and handrails. */
function planRamp(c: Ctx, add: Add): Body {
  const { w, run, drop, zf, Ht } = c
  const yS = (z: number) => (z <= -run / 2 ? 0 : z >= run / 2 ? -drop : (-(z + run / 2) / run) * drop)
  const pg = emptyMesh()
  const cg = emptyMesh()
  const sgb = emptyMesh()
  const R1 = band(Ht, -run / 2)
  const R2 = band(hMax(Ht, -run / 2), zf)
  for (const p of R1) slab(pg, p, () => 0, RAMP_T)
  for (const p of R2) slab(pg, p, (_x, z) => yS(z), RAMP_T)
  for (const sg of [-1, 1]) {
    // a 2 in curb on the surface edge
    const zc = Math.min(c.zt(sg * (w / 2 - CURB_M / 2)), zf - 0.05)
    const Zc = sortedUnique([zc, -run / 2, zf], zc, Infinity)
    prismX(
      cg,
      [...Zc.map((z): XZ => [z, yS(z) + CURB_M]), ...[...Zc].reverse().map((z): XZ => [z, yS(z)])],
      sg > 0 ? w / 2 - CURB_M : -w / 2,
      sg > 0 ? w / 2 : -w / 2 + CURB_M,
    )
    // a skirt board outside the edge, from the surface down to the ground
    const zk = Math.min(c.zt((sg * w) / 2), zf - 0.05)
    const Zk = [zk, -run / 2, zf]
    for (let z = Math.ceil(zk / 0.5) * 0.5; z < zf; z += 0.5) Zk.push(z)
    const Zs = sortedUnique(Zk, zk, zf)
    const upper = Zs.map((z): XZ => [z, yS(z)])
    const lower = [...Zs].reverse().map((z): XZ => [z, Math.min(c.gAt(z), yS(z) - RAMP_T)])
    prismX(sgb, [...upper, ...lower], sg > 0 ? w / 2 : -w / 2 - SKIRT_T, sg > 0 ? w / 2 + SKIRT_T : -w / 2)
  }
  add('ramp', 'stair', pg)
  add('curb', 'stair', cg)
  add('skirt', 'trim', sgb)
  const slope = run > 0 ? drop / run : 0
  const railInfo = c.railOn ? rails(c, add, -run / 2, zf - 0.03, yS, (z) => yS(z) + CURB_M) : []
  return {
    n: 0,
    rise: 0,
    tread: run,
    ok: true,
    slope,
    steep: slope > RAMP_MAX_SLOPE + 1e-9,
    rails: railInfo,
    posts: 0,
    dropped: R2.length ? 0 : 1,
    topTread: R1,
    topNosingZ: -run / 2,
  }
}
