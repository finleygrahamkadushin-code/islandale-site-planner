import { partEdges } from '../buildings/attach'
import { routePoints } from '../buildings/boardwalk'
import { localToSite, num, type LocalPoint } from '../buildings/footprint'
import { edgeName, type Mass } from '../buildings/masses'
import { edgeFree } from '../buildings/railRules'
import { partFrame, type PartFrame } from '../scene/partFrame'
import { railOwner, stairTopOf, surfaceZ, type DoorItem } from '../scene/railWorld'
import type { Ground } from '../site/earthworks'
import type { Terrain } from '../site/types'
import type { PlanObject } from '../store/types'
import { junctionsFor, type Candidate, type DoorSpan, type HostEdge, type Junction, type SegmentCandidate } from './junctions'
import { isPathPiece, pieceEnds, pieceKind, pieceWidth } from './pieces'

/**
 * The junction model read from the plan (old join-core glue: hostEdges,
 * candidates, junctions): a building's or standalone deck's edges, and
 * everything on the site that could land on them. Pure: the objects,
 * terrain and ground are passed in.
 */

type P2 = readonly [number, number]
const FT = 0.3048
/** A bridge's width when it has none, feet. */
const BRIDGE_W_FT = 6

const isAccess = (m: Pick<Mass, 'kind'>) => m.kind === 'stair' || m.kind === 'ramp'
const isDeckish = (m: Pick<Mass, 'kind'>) => m.kind === 'deck' || m.kind === 'porch'
export const isHost = (o: Pick<PlanObject, 'type'>): boolean => o.type === 'house' || o.type === 'deck'

/** "main floor", "porch 2", the part's own name, or a standalone deck's name (legacy join-core massName). */
export function massLabel(o: Pick<PlanObject, 'type' | 'name'>, m: Mass, mi: number): string {
  if (o.type === 'deck') return o.name || 'Deck'
  if (m.name) return m.name
  if (mi === 0) return 'main floor'
  return `${m.kind === 'wall' ? 'wing' : m.kind} ${mi}`
}

interface SiteEdge {
  readonly i: number
  readonly a: P2
  readonly b: P2
  readonly nrm: P2
  readonly z: number
  readonly free: boolean
}

function siteEdges(o: PlanObject, frame: PartFrame, mi: number): SiteEdge[] {
  const site = (p: LocalPoint) => localToSite(o.position, o.rotation, p)
  return partEdges(frame.masses, mi, frame.site).map((e) => {
    const m0 = site(e.mid)
    const m1 = site([e.mid[0] + e.n[0], e.mid[1] + e.n[1]])
    const l = Math.hypot(m1[0] - m0[0], m1[1] - m0[1]) || 1
    return { i: e.i, a: site(e.a), b: site(e.b), nrm: [(m1[0] - m0[0]) / l, (m1[1] - m0[1]) / l], z: e.z, free: frame.standalone || edgeFree(frame.masses, mi, e.i) }
  })
}

function doorSpans(doors: readonly DoorItem[]): DoorSpan[] {
  return doors.map((d, k) => {
    const kind = d.name === 'Slider' ? 'slider' : 'door'
    return { u0: d.u0, u1: d.u1, kind, label: doors.length > 1 ? `${kind} ${k + 1}` : kind }
  })
}

/** The edges of a building or standalone deck that things can land on (legacy hostEdges). */
export function hostEdges(o: PlanObject, terrain: Terrain, ground: Ground): HostEdge[] {
  const frame = partFrame(o, terrain, ground)
  const owner = railOwner(o, terrain, ground)
  if (!frame || !owner) return []
  return frame.masses.flatMap((m, mi): HostEdge[] => {
    if (isAccess(m)) return []
    const E = siteEdges(o, frame, mi)
    const name = massLabel(o, m, mi)
    if (frame.standalone || isDeckish(m))
      return E.filter((e) => e.free).map((e) => ({ owner: o.id, mi, i: e.i, a: e.a, b: e.b, nrm: e.nrm, z: e.z, accept: 'all', doors: [], label: `${name} ${edgeName(m, e.i)} edge` }))
    const spans = doorSpans(owner.doors.filter((d) => d.mi === mi))
    const edgeOf = owner.doors.filter((d) => d.mi === mi).map((d) => d.edge)
    return E.flatMap((e): HostEdge[] => {
      const doors = spans.filter((_, k) => edgeOf[k] === e.i)
      return doors.length ? [{ owner: o.id, mi, i: e.i, a: e.a, b: e.b, nrm: e.nrm, z: e.z, accept: 'doors', doors, label: `${name} ${edgeName(m, e.i)} wall` }] : []
    })
  })
}

/** Free deck and porch edges of another building or standalone deck, laid as deck-abut candidates. */
function abutCandidates(p: PlanObject, terrain: Terrain, ground: Ground): SegmentCandidate[] {
  const frame = partFrame(p, terrain, ground)
  if (!frame) return []
  return frame.masses.flatMap((m, mi) => {
    if (!frame.standalone && !isDeckish(m)) return []
    const name = p.type === 'deck' ? p.name || 'deck' : `${p.name || p.type} · ${massLabel(p, m, mi)}`
    return siteEdges(p, frame, mi)
      .filter((e) => e.free)
      .map((e): SegmentCandidate => ({ kind: 'deck-abut', other: { id: p.id, mi, i: e.i }, owner: p.id, a: e.a, b: e.b, z: e.z, name }))
  })
}

function otherCandidates(p: PlanObject, terrain: Terrain, ground: Ground): Candidate[] {
  if (isPathPiece(p)) {
    const E = pieceEnds(p, ground)
    const w = pieceWidth(p) * FT
    const kind = pieceKind(p)
    const name = p.name || kind
    return [
      { kind: 'piece', other: { id: p.id, end: 'A' }, x: E.A[0], n: E.A[1], z: E.zA, w, name, pieceKind: kind },
      { kind: 'piece', other: { id: p.id, end: 'B' }, x: E.B[0], n: E.B[1], z: E.zB, w, name, pieceKind: kind },
    ]
  }
  if (p.type === 'bridge') {
    const R = routePoints(p)
    if (R.length < 2) return []
    const w = num(p.params.w, BRIDGE_W_FT) * FT
    return [R[0], R[R.length - 1]].map((q, k): Candidate => ({ kind: 'bridge', other: { id: p.id, end: k ? 'B' : 'A' }, x: q[0], n: q[1], z: q[2], w, name: p.name || 'Bridge' }))
  }
  return isHost(p) ? abutCandidates(p, terrain, ground) : []
}

/** The host's own stair and ramp wings: each top lands on one of its edges. */
function wingCandidates(o: PlanObject, terrain: Terrain, ground: Ground): Candidate[] {
  const owner = railOwner(o, terrain, ground)
  if (!owner || owner.standalone) return []
  return owner.masses.flatMap((m, mi): Candidate[] => {
    if (!isAccess(m)) return []
    const top = stairTopOf(o, m)
    const ramp = m.kind === 'ramp'
    return [{ kind: ramp ? 'ramp-wing' : 'stair-wing', other: { id: o.id, mi }, x: top.c[0], n: top.c[1], z: surfaceZ(owner, m), w: top.w, name: m.name ?? `${ramp ? 'Ramp' : 'Steps'} ${mi}`, skipMi: mi }]
  })
}

/** Everything that could land on a host's edges (legacy candidates); hidden objects are left out. */
export function hostCandidates(o: PlanObject, objects: readonly PlanObject[], terrain: Terrain, ground: Ground): Candidate[] {
  const others = objects.filter((p) => p.id !== o.id && !p.hidden).flatMap((p) => otherCandidates(p, terrain, ground))
  return [...others, ...wingCandidates(o, terrain, ground)]
}

/** Every junction on a building's or standalone deck's edges (legacy junctions(o)); [] for anything else. */
export function siteJunctions(o: PlanObject, objects: readonly PlanObject[], terrain: Terrain, ground: Ground): Junction[] {
  if (!isHost(o)) return []
  const E = hostEdges(o, terrain, ground)
  return E.length ? junctionsFor(E, hostCandidates(o, objects, terrain, ground)) : []
}
