import type { ObjectId } from '../../store/types'
import type { PathKind } from '../pieces'
import { LEVEL_M, nodeName, type P2, type RouteGraph, type RouteItem } from './routeGraph'

/**
 * Accessible-route checks per path piece (old ext:walk-check, ADA 2010
 * §402–405 / ICC A117.1 §403–405): running and cross slope, clear width,
 * ramp rise, handrails, level landings, and the joins at each end (steps,
 * gaps, landings and turns at a ramp's ends). Stairs are never part of an
 * accessible route, so they are not checked here. The wording is the old
 * planner's. Added by the review (R2.10, R2.11): a grass surface fails
 * (ADA 302.1), and a piece whose numbers are not finite or that runs off
 * the surveyed ground fails rather than passing on made-up levels.
 * Gravel passes, taken as compacted; loose gravel would not.
 */

export const RULES = {
  walkMax: 1 / 20,
  rampMax: 1 / 12,
  /** Inches. */
  rampRiseMax: 30,
  widthMin: 36,
  landingMin: 60,
  levelMax: 1 / 48,
  crossMax: 1 / 48,
  railRise: 6,
  /** A change of direction over this needs a landing, degrees. */
  turnDeg: 30,
  /** A walk's running slope is measured over this window, metres. */
  slopeWindow: 1.5,
} as const

export const CITE = {
  walkSlope: 'ADA 403.3 / A117.1 403.3',
  cross: 'ADA 403.3, 405.3 / A117.1 403.3, 405.3',
  width: 'ADA 403.5.1, 405.5 / A117.1 403.5.1, 405.5',
  level: 'ADA 403.4, 303 / A117.1 403.4, 303',
  gap: 'ADA 402.2, 403.4 / A117.1 402.2, 403.4',
  rampSlope: 'ADA 405.2 / A117.1 405.2',
  rampRise: 'ADA 405.6 / A117.1 405.6',
  landing: 'ADA 405.7 / A117.1 405.7',
  landingLevel: 'ADA 405.7.1 / A117.1 405.7.1',
  turn: 'ADA 405.7.4 / A117.1 405.7.4',
  rail: 'ADA 405.8 / A117.1 405.8',
  stair: 'ADA 402.2 / A117.1 402.2',
  surface: 'ADA 302.1 / A117.1 302.1',
} as const

export type IssueCode =
  | 'ramp-slope'
  | 'ramp-rise'
  | 'handrail'
  | 'landing-level'
  | 'walk-slope'
  | 'cross-slope'
  | 'width'
  | 'step'
  | 'gap'
  | 'turn'
  | 'landing-top'
  | 'landing-bottom'
  | 'surface'
  | 'bad-input'
  | 'off-survey'

export interface RouteIssue {
  readonly code: IssueCode
  /** The full finding with its citation. */
  readonly text: string
  /** What to do about it. */
  readonly fix: string
  /** A label-sized version. */
  readonly short: string
  /** For steps and gaps: the end and the level it should meet. */
  readonly join?: { readonly end: 'A' | 'B'; readonly z: number; readonly gap?: boolean }
}

export type Verdict = 'pass' | 'fail' | 'n/a'

export interface PieceVerdict {
  readonly verdict: Verdict
  readonly ok: boolean
  readonly issues: readonly RouteIssue[]
  readonly kind: PathKind
  /** Steepest running slope (rise over run). */
  readonly slope: number
  readonly cross: number
  readonly riseIn: number
  readonly lengthFt: number
  /** Stairs: why they are not checked. */
  readonly note?: string
}

const IN = 0.0254
const FT = 0.3048
const EPS = 1e-6

export const pct = (s: number): string => `${(s * 100).toFixed(1)} %`
export const ftTxt = (m: number): string => {
  const f = m / FT
  return `${f < 10 ? f.toFixed(1).replace(/\.0$/, '') : Math.round(f)} ft`
}
const inTxt = (m: number) => `${Math.round(Math.abs(m) / IN)} in`
const isLevelKind = (k: PathKind) => k === 'walk' || k === 'boardwalk' || k === 'landing'

export interface PieceGeom {
  readonly L: number
  readonly rise: number
  readonly overall: number
  /** Steepest slope over the window, and where (metres from A). */
  readonly slope: number
  readonly slopeAt: number
  readonly cross: number
  /** Outward direction at end A and end B. */
  readonly out: readonly [P2, P2]
  /** The higher end. */
  readonly top: 0 | 1
}

export function pieceGeom(p: RouteItem): PieceGeom {
  const [a, b] = p.ends
  const L = p.lengthM || Math.hypot(b.x - a.x, b.n - a.n) || 0
  const rise = Math.abs(b.z - a.z)
  const overall = L > 0 ? rise / L : 0
  const prof = p.profile
  let slope = overall
  let slopeAt = 0
  if (prof.length > 1) {
    const win = Math.min(RULES.slopeWindow, L || RULES.slopeWindow)
    for (let i = 0; i < prof.length - 1; i++) {
      let j = i + 1
      while (j < prof.length - 1 && prof[j].s - prof[i].s < win - 1e-9) j++
      const ds = prof[j].s - prof[i].s
      if (ds > 1e-6) {
        const s = Math.abs(prof[j].z - prof[i].z) / ds
        if (s > slope + 1e-9) {
          slope = s
          slopeAt = (prof[i].s + prof[j].s) / 2
        }
      }
      if (j === prof.length - 1) break
    }
  }
  const cross = prof.reduce((m, q) => Math.max(m, Math.abs(q.cross)), 0)
  const dx = b.x - a.x
  const dn = b.n - a.n
  const dl = Math.hypot(dx, dn) || 1
  return { L, rise, overall, slope, slopeAt, cross, out: [[-dx / dl, -dn / dl], [dx / dl, dn / dl]], top: b.z >= a.z ? 1 : 0 }
}

const issue = (code: IssueCode, text: string, fix: string, short: string, join?: RouteIssue['join']): RouteIssue => (join ? { code, text, fix, short, join } : { code, text, fix, short })

function slopeIssues(p: RouteItem, g: PieceGeom): RouteIssue[] {
  const riseIn = g.rise / IN
  if (p.kind === 'ramp') {
    const out: RouteIssue[] = []
    if (g.slope > RULES.rampMax + EPS) {
      const nR = Math.ceil(g.rise / FT / RULES.rampMax - 1e-9)
      out.push(
        issue(
          'ramp-slope',
          `Ramp ${pct(g.slope)} (1:${(1 / g.slope).toFixed(1)}) over ${ftTxt(g.L)} exceeds 1:12 (8.33 %) — ${CITE.rampSlope}`,
          `${pct(g.slope)} over ${ftTxt(g.L)} — lengthen it to ${nR} ft for 1:12${riseIn > RULES.rampRiseMax + EPS ? ' (and split the rise with landings)' : ''}`,
          `ramp ${pct(g.slope)} > 8.33 %`,
        ),
      )
    }
    if (riseIn > RULES.rampRiseMax + EPS) {
      const runs = Math.ceil(riseIn / RULES.rampRiseMax - 1e-9)
      out.push(
        issue(
          'ramp-rise',
          `Ramp rise ${Math.round(riseIn)} in exceeds 30 in per run — ${CITE.rampRise}`,
          `rise ${Math.round(riseIn)} in — ${runs <= 2 ? 'split at 30 in with a 5 ft landing' : `split into ${runs} runs of ≤ 30 in with 5 ft landings between them`}`,
          `rise ${Math.round(riseIn)} in > 30 in`,
        ),
      )
    }
    if (riseIn > RULES.railRise + EPS && !p.rail)
      out.push(
        issue(
          'handrail',
          `Ramp rising ${Math.round(riseIn)} in has no handrails (required both sides over 6 in) — ${CITE.rail}`,
          'turn the rail on: handrails both sides, 34–38 in high, extending 12 in past each end',
          'no handrails',
        ),
      )
    return out
  }
  if (p.kind === 'landing') {
    return g.slope > RULES.levelMax + EPS
      ? [issue('landing-level', `Landing slopes ${pct(g.slope)}; landings must be level (≤ 1:48, 2 %) — ${CITE.landingLevel}`, `set both ends to the higher end (rise ${inTxt(g.rise)} to take out)`, `landing ${pct(g.slope)}`)]
      : []
  }
  if (!(g.slope > RULES.walkMax + EPS)) return []
  if (g.overall > RULES.walkMax + EPS) {
    const nW = Math.ceil(g.rise / FT / RULES.walkMax - 1e-9)
    const steepTail = g.overall > RULES.rampMax + EPS ? ` (a ramp would need ${Math.ceil(g.rise / FT / RULES.rampMax - 1e-9)} ft at 1:12)` : ''
    return [
      issue(
        'walk-slope',
        `Walk running slope ${pct(g.slope)} over ${ftTxt(g.L)} exceeds 1:20 (5 %); steeper than 1:20 is a ramp — ${CITE.walkSlope}, ADA 405`,
        `${pct(g.slope)} over ${ftTxt(g.L)} — turn this into a ramp, or lengthen it to ${nW} ft for 1:20${steepTail}`,
        `${pct(g.slope)} > 5 %`,
      ),
    ]
  }
  return [
    issue(
      'walk-slope',
      `Walk has a ${pct(g.slope)} stretch about ${ftTxt(g.slopeAt)} from end A (over 1:20, 5 %) — ${CITE.walkSlope}`,
      `regrade the steep stretch ${ftTxt(g.slopeAt)} from A to ≤ 5 % (the piece averages ${pct(g.overall)}), or turn this into a ramp`,
      `${pct(g.slope)} > 5 %`,
    ),
  ]
}

function crossAndWidth(p: RouteItem, g: PieceGeom): RouteIssue[] {
  const wIn = p.widthFt * 12
  const out: RouteIssue[] = []
  if (g.cross > RULES.crossMax + EPS) {
    const lift = (g.cross - RULES.crossMax) * wIn
    out.push(
      issue(
        'cross-slope',
        `Cross slope ${pct(g.cross)} exceeds 1:48 (2 %) — ${CITE.cross}`,
        `cross slope ${pct(g.cross)} — build up the low edge about ${lift < 1 ? lift.toFixed(1) : Math.round(lift)} in across the ${Math.round(wIn)} in width (≤ 2 %), or re-route along the contour`,
        `cross ${pct(g.cross)}`,
      ),
    )
  }
  if (wIn > 0 && wIn < RULES.widthMin - EPS)
    out.push(issue('width', `Clear width ${Math.round(wIn)} in is under 36 in — ${CITE.width}`, `widen it to 3 ft (36 in clear${p.kind === 'ramp' ? ' between handrails' : ''})`, `${Math.round(wIn)} in wide`))
  return out
}

/** Steps and gaps at one end, and for a ramp the landing it needs there. */
function endIssues(G: RouteGraph, geoms: ReadonlyMap<ObjectId, PieceGeom>, p: RouteItem, g: PieceGeom, k: 0 | 1): RouteIssue[] {
  const ni = G.endNode.get(`${p.id}:${k}`)
  if (ni === undefined) return []
  const joins = G.adj[ni]
  const tag = k ? 'B' : 'A'
  const endWord = p.kind === 'ramp' ? (k === g.top ? 'top' : 'bottom') : `end ${tag}`
  const out: RouteIssue[] = []
  for (const J of joins) {
    if (Math.abs(J.dz) <= LEVEL_M + EPS) continue
    const other = G.nodes[J.j]
    const above = J.dz < 0
    const nm = nodeName(G, other)
    const what = other.anchor ? (other.anchor.type === 'driveway' ? 'the driveway' : nm) : `the next piece (${nm})`
    const adjust =
      p.kind === 'boardwalk' ? (above ? 'lower the boardwalk' : 'raise the boardwalk') : p.kind === 'walk' ? (above ? 'lower the grade here' : 'raise the grade here') : above ? 'lower this end' : 'raise this end'
    out.push(
      issue(
        'step',
        `Step of ${inTxt(J.dz)} at ${endWord} (max ½ in; changes in level over ½ in need a ramp) — ${CITE.level}`,
        `ends ${inTxt(J.dz)}${above ? ' above ' : ' below '}${what} — snap it or ${adjust}`,
        `step ${inTxt(J.dz)} at ${endWord}`,
        { end: tag, z: other.z },
      ),
    )
  }
  const near = G.near[ni]
  if (!joins.length && near) {
    const o2 = G.nodes[near.j]
    out.push(
      issue(
        'gap',
        `Gap of ${ftTxt(near.d)} at ${endWord} to ${nodeName(G, o2)}; the route must be continuous — ${CITE.gap}`,
        `gap ${ftTxt(near.d)} to ${nodeName(G, o2)} — drag it to snap the ends together`,
        `gap ${ftTxt(near.d)}`,
        { end: tag, z: o2.z, gap: true },
      ),
    )
  }
  if (p.kind !== 'ramp') return out
  let landing = false
  let turnBad: { turn: number; name: string } | null = null
  for (const J of joins) {
    const o = G.nodes[J.j]
    if (o.anchor) {
      // a driveway, a wing top or a deck surface is level landing area
      if (o.anchor.type === 'driveway' || o.anchor.type === 'wingtop' || o.anchor.type === 'deck') landing = true
      continue
    }
    const q = G.items.find((it) => it.id === o.piece)
    const gq = q && geoms.get(q.id)
    if (!q || !gq) continue
    const oa = g.out[k]
    const ob = gq.out[o.end]
    const cos = -(oa[0] * ob[0] + oa[1] * ob[1])
    const turn = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
    const qLenIn = gq.L / IN
    const qWIn = q.widthFt * 12
    const longOk = qLenIn >= RULES.landingMin - 0.5 && gq.slope <= RULES.levelMax + EPS && isLevelKind(q.kind)
    if (turn > RULES.turnDeg + EPS) {
      // a turn needs a 60 × 60 in level landing (ADA 405.7.4)
      if (longOk && Math.min(qLenIn, qWIn || qLenIn) >= RULES.landingMin - 0.5) landing = true
      else turnBad = { turn, name: q.name || `piece ${q.id}` }
    } else if (longOk) landing = true
  }
  if (landing) return out
  if (turnBad)
    return [
      ...out,
      issue(
        'turn',
        `Direction changes ${Math.round(turnBad.turn)}° at the ${endWord} (into ${turnBad.name}) without a 60 × 60 in landing — ${CITE.turn}`,
        `add a 5 × 5 ft landing between this ramp and ${turnBad.name} (direction changes ${Math.round(turnBad.turn)}°)`,
        `turn ${Math.round(turnBad.turn)}° — no landing`,
      ),
    ]
  return [...out, issue(endWord === 'top' ? 'landing-top' : 'landing-bottom', `No level 60 in landing at the ${endWord} of the ramp run — ${CITE.landing}`, `add a 5 ft landing at the ${endWord}`, `no landing at ${endWord}`)]
}

/** Surfaces that are not firm, stable and slip resistant (ADA 302.1). */
const UNSTABLE_SURFACES: ReadonlySet<string> = new Set(['grass'])

function surfaceIssues(p: RouteItem): RouteIssue[] {
  if (!p.surface || !UNSTABLE_SURFACES.has(p.surface)) return []
  return [issue('surface', `Surface is ${p.surface}, which is not firm, stable and slip resistant — ${CITE.surface}`, 'pave it: concrete, pavers, compacted gravel or a boardwalk', `${p.surface} surface`)]
}

const finite = (...vs: readonly number[]) => vs.every(Number.isFinite)

/** A piece whose size, ends or levels are not numbers can't be measured; one off the survey has made-up levels. */
function inputIssue(p: RouteItem): RouteIssue | null {
  const numbers = finite(p.widthFt, p.lengthM, ...p.ends.flatMap((e) => [e.x, e.n, e.z]), ...p.profile.flatMap((q) => [q.s, q.z, q.cross]))
  if (!numbers) return issue('bad-input', 'Its position, size or levels are not numbers, so it cannot be checked', 'set its position and size again, or delete it', 'cannot be measured')
  if (p.offSurvey) return issue('off-survey', 'It runs off the surveyed ground, where the levels are not known, so it cannot be checked', 'move it onto the lot', 'off the survey')
  return null
}

/** Every piece's verdict, by id. */
export function checkPieces(G: RouteGraph): ReadonlyMap<ObjectId, PieceVerdict> {
  const geoms = new Map(G.items.map((p) => [p.id, pieceGeom(p)] as const))
  return new Map(
    G.items.map((p): [ObjectId, PieceVerdict] => {
      const g = geoms.get(p.id)!
      const riseIn = g.rise / IN
      const base = { kind: p.kind, slope: p.kind === 'stair' ? g.overall : g.slope, cross: g.cross, riseIn, lengthFt: g.L / FT }
      if (p.kind === 'stair')
        return [p.id, { ...base, verdict: 'n/a', ok: true, issues: [], note: `stairs — fine off the route, never part of an accessible route (${CITE.stair})` }]
      const bad = inputIssue(p)
      if (bad) return [p.id, { ...base, verdict: 'fail', ok: false, issues: [bad] }]
      const issues = [...surfaceIssues(p), ...slopeIssues(p, g), ...crossAndWidth(p, g), ...endIssues(G, geoms, p, g, 0), ...endIssues(G, geoms, p, g, 1)]
      return [p.id, { ...base, verdict: issues.length ? 'fail' : 'pass', ok: !issues.length, issues }]
    }),
  )
}
