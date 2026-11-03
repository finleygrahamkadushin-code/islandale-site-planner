import { MAX_RISER_IN, type Ground } from './pieces'
import { FT, IN, RAMP_RISE_MAX_M, ZTOL, hyp, pct, short, specEnds, stepTxt, type P2, type PieceSpec, type ResolvedEnd } from './connectSpec'

/**
 * The quick route check Connect runs on a chain of new pieces (old
 * connect checkChain, ADA 402–405 numbers as walk-check): walks and
 * boardwalks at most 1:20, ramps at most 1:12 and 30 in of rise per run,
 * no step between pieces or onto either picked end, and no stairs. Pure.
 */

const WALK_MAX = 0.0505
const BOARDWALK_MAX = 0.05
const RAMP_MAX = 1 / 12
const RISER_M = MAX_RISER_IN * IN
/** Sample spacing and slope window for walks on the ground, metres. */
const SAMPLE_M = 0.25
const WINDOW_M = 0.75

/** Steepest ground slope along a straight line, over a 1.5 m window (old lineMaxSlope, as walk-auto designs to). */
export function lineMaxSlope(P0: P2, P1: P2, ground: Ground): number {
  const L = hyp(P1[0] - P0[0], P1[1] - P0[1])
  if (L < 1e-6) return 0
  const k = Math.max(2, Math.ceil(L / SAMPLE_M))
  const w = Math.min(WINDOW_M, L / 2)
  const at = (s: number) => ground(P0[0] + ((P1[0] - P0[0]) * s) / L, P0[1] + ((P1[1] - P0[1]) * s) / L)
  let mx = 0
  for (let j = 0; j <= k; j++) {
    const s = (L * j) / k
    const s0 = Math.max(0, s - w)
    const s1 = Math.min(L, s + w)
    if (s1 - s0 < 1e-6) continue
    mx = Math.max(mx, Math.abs(at(s1) - at(s0)) / (s1 - s0))
  }
  return mx
}

export interface ChainCheck {
  /** No issues and no stairs. */
  readonly ok: boolean
  readonly issues: readonly string[]
  /** Steepest walk, ramp or boardwalk (rise over run). */
  readonly maxSlope: number
  readonly runs: number
  readonly landings: number
  readonly risers: number
  readonly stairs: number
  readonly lenFt: number
  /** Total ramp rise, metres. */
  readonly riseM: number
}

/** Check a chain of specs from picked end A to picked end B. */
export function checkChain(specs: readonly PieceSpec[], ground: Ground, A: ResolvedEnd, B: ResolvedEnd): ChainCheck {
  const issues: string[] = []
  let maxSlope = 0
  let runs = 0
  let landings = 0
  let risers = 0
  let stairs = 0
  let lenFt = 0
  let riseM = 0
  const ends = specs.map((p) => specEnds(p, ground))
  specs.forEach((p, i) => {
    const E = ends[i]
    const L = p.w * FT
    const rise = Math.abs(E.zB - E.zA)
    let s = L > 1e-6 ? rise / L : 0
    lenFt += p.w
    if (p.kind === 'walk') {
      s = Math.max(s, lineMaxSlope(E.A, E.B, ground))
      if (s > WALK_MAX) issues.push(`walk ${i + 1} ${pct(s)} > 5 %`)
    } else if (p.kind === 'boardwalk') {
      if (s > BOARDWALK_MAX + 1e-9) issues.push(`boardwalk ${pct(s)} > 5 %`)
    } else if (p.kind === 'ramp') {
      runs++
      riseM += rise
      if (s > RAMP_MAX + 1e-6) issues.push(`ramp ${i + 1} ${pct(s)} > 8.33 %`)
      if (rise > RAMP_RISE_MAX_M + 1e-6) issues.push(`ramp ${i + 1} rise ${(rise / IN).toFixed(0)} in > 30 in`)
    } else if (p.kind === 'landing') {
      landings++
      s = 0
    } else if (p.kind === 'stair') {
      stairs++
      risers += Math.max(1, Math.ceil(rise / RISER_M - 1e-9))
      s = 0
    }
    if (p.kind !== 'stair') maxSlope = Math.max(maxSlope, s)
    if (i + 1 < specs.length) {
      const dz = Math.abs(ends[i + 1].zA - E.zB)
      if (dz > ZTOL) issues.push(`${(dz / IN).toFixed(0)} in step after piece ${i + 1}`)
    }
  })
  if (specs.length) {
    const z0 = ends[0].zA
    const z1 = ends[ends.length - 1].zB
    if (Math.abs(z0 - A.z) > ZTOL) issues.push(`${stepTxt(z0 - A.z)} step at ${short(A.label || 'A')}`)
    if (Math.abs(z1 - B.z) > ZTOL) issues.push(`${stepTxt(z1 - B.z)} step at ${short(B.label || 'B')}`)
  }
  return { ok: !issues.length && !stairs, issues, maxSlope, runs, landings, risers, stairs, lenFt, riseM }
}
