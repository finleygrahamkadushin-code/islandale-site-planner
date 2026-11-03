import type { Ground, PathKind } from './pieces'
import { LAND, RISE_K, switchPlan, trimKink, type Interval, type LegPath, type RunPlan } from './routeAutoPlan'
import { D2R, FT, specBetween, type PieceSpec } from './routeSpec'

/**
 * The auto route's pieces from a planned leg (old walk-auto emit): walks
 * drape in pieces of 30 ft or less, level stretches become boardwalks,
 * ramps get a 5 ft landing at the bottom, the top and every 30 in of
 * rise, switchbacks zig-zag inside their corridor, and stairs run straight.
 */

const WALK_CHUNK = 30 * FT

interface EmitOptions {
  readonly ground: Ground
  readonly widthFt: number
  /** Route width, metres. */
  readonly W: number
}

export function emitLeg(path: LegPath, plan: RunPlan, opt: EmitOptions): PieceSpec[] {
  const out: PieceSpec[] = []
  const ground = (s: number) => {
    const p = path.pt(s)
    return opt.ground(p[0], p[1])
  }
  // pieces along the path from s0 to s1, cut at kinks and into at most maxLen each
  const linear = (kind: PathKind, s0: number, s1: number, zf: (s: number) => number, maxLen: number, dft = opt.widthFt) => {
    const cuts = [s0, ...path.verts.filter((v) => v > s0 + 1e-6 && v < s1 - 1e-6), s1]
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i]
      const b = cuts[i + 1]
      const k = Math.max(1, Math.ceil((b - a) / maxLen - 1e-9))
      const step = (b - a) / k
      for (let j = 0; j < k; j++) {
        const p = a + j * step
        const q = j === k - 1 ? b : a + (j + 1) * step
        out.push(specBetween(kind, path.pt(p), path.pt(q), zf(p), zf(q), path.seg((p + q) / 2).deg, dft))
      }
    }
  }
  const landAlong = (a: number, b: number, z: number, dft = opt.widthFt) => linear('landing', a, b, () => z, 1e9, dft)

  const ramp = (iv: Interval) => {
    let { s0, s1 } = iv
    const { z0, z1 } = iv
    const tk = trimKink(path, s0, s1) ?? { s0, s1 }
    let tail: [number, number] | null = null
    if (tk.lead) {
      landAlong(s0, tk.s0, z0)
      s0 = tk.s0
    }
    if (tk.tail) {
      tail = [tk.s1, s1]
      s1 = tk.s1
    }
    return { s0, s1, z0, z1, tail, deg: path.seg((s0 + s1) / 2).deg }
  }

  for (const iv of plan.iv) {
    const lerp = (s: number) => iv.z0 + ((iv.z1 - iv.z0) * (s - iv.s0)) / (iv.s1 - iv.s0)
    if (iv.type === 'walk') linear('walk', iv.s0, iv.s1, ground, WALK_CHUNK)
    else if (iv.type === 'board') linear('boardwalk', iv.s0, iv.s1, lerp, WALK_CHUNK)
    else if (iv.type === 'stair') linear('stair', iv.s0, iv.s1, lerp, 1e9)
    else if (iv.type === 'ramp') {
      const r = ramp(iv)
      const R = r.z1 - r.z0
      const k = Math.max(1, Math.ceil(Math.abs(R) / RISE_K))
      const rl = r.s1 - r.s0 - (k + 1) * LAND
      let s = r.s0
      let z = r.z0
      landAlong(s, s + LAND, z)
      s += LAND
      for (let i = 0; i < k; i++) {
        const li = rl / k
        const zn = i === k - 1 ? r.z1 : z + (R * li) / rl
        out.push(specBetween('ramp', path.pt(s), path.pt(s + li), z, zn, r.deg, opt.widthFt))
        s = i === k - 1 ? r.s1 - LAND : s + li
        z = zn
        landAlong(s, s + LAND, z)
        s += LAND
      }
      if (r.tail) landAlong(r.tail[0], r.tail[1], r.z1)
    } else {
      const st0 = out.length
      switchback(path, ramp(iv), opt, (p) => out.push(p), landAlong)
      out.splice(st0, out.length - st0, ...out.slice(st0).map((p) => ({ ...p, switchback: true })))
    }
  }
  return out
}

function switchback(
  path: LegPath,
  r: { s0: number; s1: number; z0: number; z1: number; tail: [number, number] | null },
  opt: EmitOptions,
  push: (p: PieceSpec) => void,
  landAlong: (a: number, b: number, z: number, dft?: number) => void,
): void {
  const sw = switchPlan(r.s1 - r.s0, r.z1 - r.z0, opt.W)
  if (!sw) return
  const deg = path.seg(r.s0 + sw.land + 1e-6).deg
  const O = path.pt(r.s0 + sw.land)
  const ux = Math.cos(deg * D2R)
  const un = Math.sin(deg * D2R)
  const at = (u: number, v: number): [number, number] => [O[0] + u * ux - v * un, O[1] + u * un + v * ux]
  const sg = r.z1 >= r.z0 ? 1 : -1
  const wsb = sw.wsb / FT
  const lanes = [sw.c, ...Array.from({ length: Math.max(0, sw.K - 2) }, (_, j) => ((j + 1) % 2 ? -2 : 2) * sw.c)]
  lanes.push(-lanes.reduce((a, d) => a + d, 0))
  let cu = 0
  let cv = 0
  let cz = r.z0
  landAlong(r.s0, r.s0 + sw.land, r.z0, wsb)
  lanes.forEach((dv, i) => {
    const len = Math.abs(dv) / sw.sin
    const A = at(cu, cv)
    cu += Math.abs(dv) * sw.cot
    cv += dv
    const last = i === lanes.length - 1
    const zn = last ? r.z1 : cz + sg * sw.slope * len
    const B = last ? path.pt(r.s1 - sw.land) : at(cu, cv)
    push(specBetween('ramp', A, B, cz, zn, deg + (dv > 0 ? 1 : -1) * sw.phi, wsb))
    cz = zn
    if (!last) {
      const L0 = at(cu, cv)
      cu += sw.land
      push(specBetween('landing', L0, at(cu, cv), cz, cz, deg, wsb))
    } else landAlong(r.s1 - sw.land, r.s1, cz, wsb)
  })
  if (r.tail) landAlong(r.tail[0], r.tail[1], r.z1)
}
