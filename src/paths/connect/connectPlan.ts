import { formatLengthField } from '../../ui/feetInches'
import { MAX_RISER_IN, type Ground } from '../pieces'
import { checkChain, type ChainCheck } from './connectCheck'
import { layoutStair, type StairLayout } from './connectStair'
import {
  IN,
  LANDING_M,
  M2F,
  RAMP_RISE_MAX_M,
  ZTOL,
  clampWidth,
  ftE,
  ftTxt,
  hyp,
  pct,
  reverseSpec,
  seg,
  stepTxt,
  unit,
  zOf,
  type ConnectEnd,
  type P2,
  type PieceSpec,
  type ResolvedEnd,
} from './connectSpec'

/**
 * Connect (old ext:connect connectPlan + ext:stair-connect): given two
 * picked ends, the ways to join them, each with its route check, a short
 * label and the new path pieces, A → B. Walk: one gravel piece on the
 * ground. Boardwalk: one deck from level to level. Ramp: 1:12 runs of at
 * most 30 in rise with 5 ft landings, straight from end to end (plus a
 * landing out from a deck edge or door). Stair: one straight run, or an
 * L-stair with a landing when the gap is short. Pure.
 */

export type ConnectOptionId = 'walk' | 'boardwalk' | 'ramp' | 'stair'

export interface ConnectStats {
  readonly lengthFt: number
  readonly slope?: number
  readonly runs?: number
  readonly landings?: number
  readonly risers?: number
  readonly riserIn?: number
  readonly runFt?: number
}

export interface ConnectOption {
  readonly id: ConnectOptionId
  readonly title: string
  /** One line for the popover. */
  readonly label: string
  /** Why it passes or fails, with the rule. */
  readonly why: string
  /** Passes the accessible-route check. */
  readonly ok: boolean
  /** Cannot be built (the popover greys it out). */
  readonly disabled: boolean
  /** New pieces, A → B. */
  readonly specs: readonly PieceSpec[]
  readonly check?: ChainCheck
  readonly stats?: ConnectStats
  readonly layout?: StairLayout
}

export interface ConnectOptions {
  /** Width of the new pieces, feet (3–10, 4 by default). */
  readonly widthFt?: number
  /** Landings out from deck edges and doors on the ramp route (default true). */
  readonly landings?: boolean
  /** 'stair' puts the Stair option first. */
  readonly prefer?: 'stair' | null
}

export interface ConnectPlan {
  readonly options: readonly ConnectOption[]
  /** The first passing option of walk, boardwalk, ramp. */
  readonly best: ConnectOptionId | null
  readonly distM: number
  readonly dzM: number
  readonly A: ResolvedEnd
  readonly B: ResolvedEnd
  readonly stairFirst: boolean
}

const MIN_GAP_M = 0.3
const WALK_SURFACE_MAX = 0.05
const WALK_CHECK_MAX = 0.0505
const RAMP_SLOPE_LIMIT = 1 / 12.05
/** Ramp runs carry a little under 30 in so rounding never tips one over. */
const RAMP_RISE_FILL = 0.98
/** A built chain may not dip this far below the ground, metres. */
const DIP_M = 0.3
const DIP_SAMPLES = 20
const RISER_M = MAX_RISER_IN * IN
const LANDING_KINDS = ['deckedge', 'deck-edge', 'door', 'wingtop', 'edge']
const STRUCT_KINDS = ['deckedge', 'deck-edge', 'door', 'wingtop', 'edge', 'deck']
const PATHY_KINDS = ['ground', 'piece', 'driveway', 'wingfoot', 'walk']

/** Does a ramp leave this end on a level landing first: a deck edge, door or wing top with a direction. */
export const wantsLanding = (t: ConnectEnd): boolean => !!unit(t.dir) && LANDING_KINDS.includes(t.kind ?? '')

/**
 * A built chain straight from P0 (z0) to P1 (z1), whatever the ground does
 * (old straightChain): one boardwalk when at most 1:20, else k ramp runs
 * (≤ 30 in rise, ≤ 1:12) with 5 ft landings between them, and one at each
 * end flagged. Null when it cannot fit or would dip 0.3 m below the ground.
 */
export function straightChain(P0: P2, P1: P2, z0: number, z1: number, widthFt: number, ground: Ground, landA: boolean, landB: boolean): PieceSpec[] | null {
  const D = hyp(P1[0] - P0[0], P1[1] - P0[1])
  const R = Math.abs(z1 - z0)
  if (D < MIN_GAP_M) return null
  const ux = (P1[0] - P0[0]) / D
  const un = (P1[1] - P0[1]) / D
  const at = (s: number): P2 => [P0[0] + ux * s, P0[1] + un * s]
  let out: PieceSpec[]
  if (R <= WALK_SURFACE_MAX * D) out = [seg('boardwalk', P0, P1, z0, z1, widthFt)]
  else {
    const k = Math.max(1, Math.ceil(R / (RAMP_RISE_MAX_M * RAMP_RISE_FILL) - 1e-9))
    const nl = k - 1 + (landA ? 1 : 0) + (landB ? 1 : 0)
    const Lr = (D - nl * LANDING_M) / k
    if (!(Lr > 0) || R / k > RAMP_RISE_MAX_M + 1e-9 || R / k / Lr > RAMP_SLOPE_LIMIT) return null
    const dzr = (z1 - z0) / k
    const parts: { kind: 'ramp' | 'landing'; len: number; za: number; zb: number }[] = []
    if (landA) parts.push({ kind: 'landing', len: LANDING_M, za: z0, zb: z0 })
    for (let i = 0; i < k; i++) {
      const z = z0 + dzr * i
      parts.push({ kind: 'ramp', len: Lr, za: z, zb: z + dzr })
      if (i + 1 < k) parts.push({ kind: 'landing', len: LANDING_M, za: z + dzr, zb: z + dzr })
    }
    if (landB) parts.push({ kind: 'landing', len: LANDING_M, za: z1, zb: z1 })
    let s = 0
    out = parts.map((p) => {
      const sp = seg(p.kind, at(s), at(s + p.len), p.za, p.zb, widthFt)
      s += p.len
      return sp
    })
  }
  for (let j = 0; j <= DIP_SAMPLES; j++) {
    const t = j / DIP_SAMPLES
    const q = at(D * t)
    if (z0 + (z1 - z0) * t < ground(q[0], q[1]) - DIP_M) return null
  }
  return out
}

interface Ctx {
  readonly A: ResolvedEnd
  readonly B: ResolvedEnd
  readonly PA: P2
  readonly PB: P2
  readonly L: number
  readonly slope: number
  readonly widthFt: number
  readonly ground: Ground
}

const slopeTxt = (s: number) => (s < 0.0005 ? 'level' : pct(s))

function boardwalkOption(c: Ctx): ConnectOption {
  const { A, B, PA, PB, L, slope, widthFt, ground } = c
  const lift = Math.max(0, Math.round((Math.max(A.z, B.z) - Math.max(ground(PA[0], PA[1]), ground(PB[0], PB[1]))) * M2F * 10) / 10)
  const ok = slope <= WALK_SURFACE_MAX + 1e-9
  return {
    id: 'boardwalk',
    title: 'Boardwalk',
    specs: [{ ...seg('boardwalk', PA, PB, A.z, B.z, widthFt), lift }],
    ok,
    disabled: false,
    stats: { lengthFt: L * M2F, slope },
    label: `Boardwalk · ${ftTxt(L)} · ${slopeTxt(slope)} · ${ok ? 'passes' : 'over 5 % (1:20)'}`,
    why: ok
      ? `One deck from ${ftE(A.z)} to ${ftE(B.z)}, posts where it is off the ground; a walking surface may slope up to 1:20 (ADA 403.3)`
      : `${pct(slope)} is steeper than a walking surface may be (1:20, ADA 403.3): use the ramp, or stretch the run to ${Math.ceil(Math.abs(B.z - A.z) * 20 * M2F)} ft`,
  }
}

function rampOption(c: Ctx, landings: boolean): ConnectOption {
  const { A, B, PA, PB, widthFt, ground } = c
  let dA = landings && wantsLanding(A) ? unit(A.dir) : null
  let dB = landings && wantsLanding(B) ? unit(B.dir) : null
  let A1: P2 = dA ? [PA[0] + dA[0] * LANDING_M, PA[1] + dA[1] * LANDING_M] : PA
  let B1: P2 = dB ? [PB[0] + dB[0] * LANDING_M, PB[1] + dB[1] * LANDING_M] : PB
  const vx = PB[0] - PA[0]
  const vn = PB[1] - PA[1]
  if ((dA || dB) && (hyp(B1[0] - A1[0], B1[1] - A1[1]) < 0.5 || (B1[0] - A1[0]) * vx + (B1[1] - A1[1]) * vn <= 0)) {
    dA = dB = null // the landings would cross: go direct
    A1 = PA
    B1 = PB
  }
  const pre = dA ? [seg('landing', PA, A1, A.z, A.z, widthFt)] : []
  const post = dB ? [seg('landing', B1, PB, B.z, B.z, widthFt)] : []
  const mid = straightChain(A1, B1, A.z, B.z, widthFt, ground, !dA, !dB)
  if (!mid) {
    const R = Math.abs(B.z - A.z)
    const k = Math.max(1, Math.ceil(R / (RAMP_RISE_MAX_M * RAMP_RISE_FILL) - 1e-9))
    const needFt = Math.ceil((R / RAMP_SLOPE_LIMIT + (k - 1 + (dA ? 0 : 1) + (dB ? 0 : 1)) * LANDING_M) * M2F + (dA ? 5 : 0) + (dB ? 5 : 0))
    return {
      id: 'ramp',
      title: 'Ramp',
      specs: [],
      ok: false,
      disabled: true,
      label: `Ramp · ${k} run${k > 1 ? 's' : ''} need about ${needFt} ft in a straight line · does not fit`,
      why: `Ramps ≤ 1:12 with ≤ 30 in rise per run and 5 ft landings (ADA 405) need about ${needFt} ft here, or the run would dip below the ground; the two ends are ${ftTxt(c.L)} apart`,
    }
  }
  const specs = [...pre, ...mid, ...post]
  const ck = checkChain(specs, ground, A, B)
  const label = !ck.runs
    ? `Ramp · no ramp needed · ${Math.round(ck.lenFt)} ft · max ${pct(ck.maxSlope)} · ${ck.ok ? 'passes' : 'fails'}`
    : `Ramp · ${ck.runs} run${ck.runs > 1 ? 's' : ''} + ${ck.landings} landing${ck.landings !== 1 ? 's' : ''} · ${Math.round(ck.lenFt)} ft · max ${pct(ck.maxSlope)} · ${ck.ok ? 'passes' : 'fails'}`
  return {
    id: 'ramp',
    title: 'Ramp',
    specs,
    ok: ck.ok,
    disabled: false,
    check: ck,
    stats: { lengthFt: ck.lenFt, slope: ck.maxSlope, runs: ck.runs, landings: ck.landings },
    label,
    why: ck.ok ? 'Ramps ≤ 1:12 with ≤ 30 in rise per run and 5 ft landings (ADA 405)' : ck.issues[0] ?? 'fails the route check',
  }
}

function walkOption(c: Ctx): ConnectOption {
  const { A, B, PA, PB, L, widthFt, ground } = c
  const gA = ground(PA[0], PA[1])
  const gB = ground(PB[0], PB[1])
  const s = seg('walk', PA, PB, gA, gB, widthFt)
  const ck = checkChain([s], ground, A, B)
  const bits = [
    ...(Math.abs(gA - A.z) > ZTOL ? [`${stepTxt(gA - A.z)} step at A`] : []),
    ...(Math.abs(gB - B.z) > ZTOL ? [`${stepTxt(gB - B.z)} step at B`] : []),
  ]
  const tail = ck.ok ? 'passes' : ck.maxSlope > WALK_CHECK_MAX ? 'over 5 % (1:20)' : 'not accessible'
  return {
    id: 'walk',
    title: 'Walk',
    specs: [s],
    ok: ck.ok,
    disabled: false,
    check: ck,
    stats: { lengthFt: L * M2F, slope: ck.maxSlope },
    label: `Walk · ${ftTxt(L)} · ${pct(ck.maxSlope)}${bits.length ? ` · ${bits.join(', ')}` : ''} · ${tail}`,
    why: ck.ok ? 'Gravel walk on the ground, ≤ 1:20 everywhere (ADA 403.3)' : ck.issues[0] ?? tail,
  }
}

/** The popover line for a stair layout (old stairVerdict). */
export function stairVerdict(L: StairLayout | null): string {
  if (!L || !L.risers) return 'Stair · no stair needed'
  const head = `${L.type === 'L' ? 'L-stair' : 'Stair'} · ${L.risers} riser${L.risers > 1 ? 's' : ''}`
  const mid = `${L.type === 'L' ? ` · ${L.landingFt}×${L.landingFt} landing` : ''} · ${formatLengthField(L.runIn / 12)} run${L.pad ? ` + ${Math.round(L.pad.lenFt)} ft ${L.pad.kind}` : ''}`
  return `${head}${mid} · not accessible (stairs)`
}

/** The Stair option (old stairOption): top at the higher end; disabled when the ends are within one 7 in riser. */
export function stairOption(A: ResolvedEnd, B: ResolvedEnd, ground: Ground, widthFt: number): ConnectOption {
  const dz = B.z - A.z
  if (Math.abs(dz) < RISER_M)
    return {
      id: 'stair',
      title: 'Stair',
      specs: [],
      ok: false,
      disabled: true,
      label: `Stair · same level (${(Math.abs(dz) / IN).toFixed(0)} in apart) · no stair needed`,
      why: 'A stair needs at least one 7 in riser between the two ends',
    }
  const aTop = A.z >= B.z
  const top = aTop ? A : B
  const foot = aTop ? B : A
  const L = layoutStair([top.x, top.n], [foot.x, foot.n], top.z, foot.z, {
    widthFt,
    dir: top.dir,
    edge: top.segment ?? null,
    flexFoot: !foot.kind || foot.kind === 'ground',
    ground,
  })
  const specs = aTop ? L.specs : [...L.specs].reverse().map(reverseSpec)
  const riserIn = Math.abs(L.zT - L.zF) / IN / (L.risers || 1)
  return {
    id: 'stair',
    title: L.type === 'L' ? 'L-stair' : 'Stair',
    specs,
    ok: false,
    disabled: false,
    layout: L,
    stats: { risers: L.risers, runFt: L.runIn / 12, riserIn, lengthFt: specs.reduce((s, p) => s + p.w, 0) },
    label: stairVerdict(L),
    why:
      `${L.type === 'L' ? `Two runs with a ${L.landingFt} × ${L.landingFt} ft landing at the turn (too close for a straight run)` : 'Straight run'}` +
      ` · ${L.risers} risers of ${riserIn.toFixed(1)} in, 11 in treads, handrails from 4 risers` +
      `${L.pad ? ` · level ${L.pad.kind} to the lower end` : ''} · stairs are fine as a second way, never on the accessible route (ADA 402.2)`,
  }
}

/** Stair first when asked, or when the top is a deck, door or wing top and the foot is ground or a path. */
export function stairFirst(A: ResolvedEnd, B: ResolvedEnd, prefer: 'stair' | null | undefined): boolean {
  if (prefer === 'stair') return true
  const top = A.z >= B.z ? A : B
  const foot = A.z >= B.z ? B : A
  return STRUCT_KINDS.includes(top.kind ?? '') && (!foot.kind || PATHY_KINDS.includes(foot.kind))
}

const BEST_ORDER: readonly ConnectOptionId[] = ['walk', 'boardwalk', 'ramp']

/** Every way to join picked ends a and b. */
export function connectPlan(a: ConnectEnd, b: ConnectEnd, ground: Ground, opts: ConnectOptions = {}): ConnectPlan {
  const widthFt = clampWidth(opts.widthFt)
  const A: ResolvedEnd = { ...a, z: zOf(a, ground) }
  const B: ResolvedEnd = { ...b, z: zOf(b, ground) }
  const PA: P2 = [A.x, A.n]
  const PB: P2 = [B.x, B.n]
  const L = hyp(PB[0] - PA[0], PB[1] - PA[1])
  const dzM = B.z - A.z
  const base = { distM: L, dzM, A, B }
  if (L < MIN_GAP_M) {
    const same = (id: ConnectOptionId, title: string): ConnectOption => ({ id, title, specs: [], ok: false, disabled: true, label: `${title} · the two ends are the same point`, why: 'Pick two different ends' })
    return { ...base, options: [same('boardwalk', 'Boardwalk'), same('ramp', 'Ramp'), same('walk', 'Walk')], best: null, stairFirst: false }
  }
  const c: Ctx = { A, B, PA, PB, L, slope: Math.abs(dzM) / L, widthFt, ground }
  const core = [boardwalkOption(c), rampOption(c, opts.landings !== false), walkOption(c)]
  const st = stairOption(A, B, ground, widthFt)
  const first = st.disabled ? opts.prefer === 'stair' : stairFirst(A, B, opts.prefer)
  const options = first ? [st, ...core] : st.disabled ? core : [core[0], core[1], st, core[2]]
  const best = BEST_ORDER.find((id) => options.some((o) => o.id === id && o.ok && !o.disabled)) ?? null
  return { ...base, options, best, stairFirst: first && !st.disabled }
}
