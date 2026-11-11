import { boardwalkColumns, columnFits, type WalkPath } from './boardwalk'
import { addPolygon, emptyMesh, type MeshData, type V3 } from '../geom'
import { addPrism } from '../foundation/supports'
import { FT_PER_M as M_TO_FT } from '../../site/units'

/**
 * Bridges as the old planner drew them (legacy bridgeLayout, specMesh):
 * a deck on a body along the smoothed route, then by style a glass-railed
 * ribbon on Y columns, a steel truss (two side frames of panels about
 * 2.4 m long) on leg pairs, or a cable bridge hung from one A-frame mast at
 * mid-span with sagging main cables, on piers at its ends. Everything is in
 * the scene frame (x, elevation, -n), metres.
 */

export const BRIDGE_STYLES = ['truss', 'cable', 'ribbon'] as const
export type BridgeStyle = (typeof BRIDGE_STYLES)[number]

/** The bridge's style; the old planner drew a truss when none was given. */
export const bridgeStyle = (v: unknown): BridgeStyle => ((BRIDGE_STYLES as readonly unknown[]).includes(v) ? (v as BridgeStyle) : 'truss')

/** Deck depth by style, metres (legacy th). */
const DEPTH_M: Readonly<Record<BridgeStyle, number>> = { truss: 0.32, cable: 0.26, ribbon: 0.22 }
/** Column spacing by style, metres; a cable bridge stands only at its ends. */
const COLUMN_SPACING_M: Readonly<Record<BridgeStyle, number>> = { truss: 12, cable: Infinity, ribbon: 7 }
const MIN_HALF_WIDTH_M = 0.6
/** Truss: side frame height and panel length, metres. */
const TRUSS_HEIGHT_M = 1.7
const TRUSS_PANEL_M = 2.4
/** Cable: mast height is this share of the span, at least 5 m; cables sag by this share of their rise. */
const MAST_SHARE = 0.26
const MIN_MAST_M = 5
const CABLE_SAG = 0.16
const CABLE_END_M = 1.2
const HANDRAIL_M = 1.05
/** Guard pickets along a truss or cable bridge (R3.7): square bars, no more than 3.5 in clear (the 4 in sphere rule). */
export const BRIDGE_PICKET_M = 0.014
const PICKET_CLEAR_M = 3.5 * 0.0254
/** Truss: the guard stands just inside the side frames. */
const TRUSS_GUARD_IN_M = 0.07
/** Glass balustrade (ribbon): bottom, inset from the edge. */
const GLASS_BASE_M = 0.05
const GLASS_INSET_M = 0.04
/** Columns and legs go this far into the ground. */
const FOOT_EMBED_M = 0.3

export interface BridgeLayout {
  readonly path: WalkPath
  readonly style: BridgeStyle
  /** Deck depth, metres. */
  readonly depth: number
  readonly halfWidth: number
  /** Sample indices with a column (ribbon), leg pair (truss) or end pier (cable). */
  readonly columns: readonly number[]
  /** A cable bridge's mast sample. */
  readonly mast: number | null
}

/** Legacy bridgeLayout: the deck depth, half width, column samples and mast for a style. */
export function bridgeLayout(
  path: WalkPath,
  widthM: number,
  style: BridgeStyle,
  groundAt: (x: number, n: number) => number,
  inBuilding: (x: number, n: number) => boolean = () => false,
): BridgeLayout {
  const depth = DEPTH_M[style]
  const last = path.samples.length - 1
  const columns =
    style === 'cable'
      ? [0, last].filter(columnFits(path, groundAt, inBuilding, depth))
      : boardwalkColumns(path, groundAt, inBuilding, { spacingM: COLUMN_SPACING_M[style], depthM: depth })
  return { path, style, depth, halfWidth: Math.max(MIN_HALF_WIDTH_M, widthM / 2), columns, mast: style === 'cable' ? Math.round(last / 2) : null }
}

/** Legacy bridgeDims: the length along the curve and the height (rise plus 4 ft), both whole feet. */
export function bridgeDims(path: WalkPath): { readonly lengthFt: number; readonly heightFt: number } {
  const es = path.samples.map((s) => s.e)
  return { lengthFt: Math.round(path.length * M_TO_FT), heightFt: Math.round((Math.max(...es) - Math.min(...es)) * M_TO_FT + 4) }
}

/** A truss's panel points: a sample about every 2.4 m from end to end (legacy nodes). */
export function trussNodes(path: WalkPath): number[] {
  const last = path.samples.length - 1
  const step = Math.max(1, Math.round(TRUSS_PANEL_M / (path.length / last)))
  const nodes: number[] = []
  for (let i = 0; i <= last; i += step) nodes.push(i)
  if (nodes[nodes.length - 1] !== last) nodes.push(last)
  return nodes
}

/** A cable bridge's mast height above the deck, metres. */
export const mastHeight = (path: WalkPath): number => Math.max(MIN_MAST_M, path.length * MAST_SHARE)

/** A point beside sample i: `k` metres to its left (negative right), `dy` above the deck top; scene frame. */
function pointAt(path: WalkPath, i: number, k: number, dy: number): V3 {
  const s = path.samples[i]
  return [s.x + s.px * k, s.e + dy, -(s.n + s.pn * k)]
}

/**
 * One main cable (legacy cable style): from an end of the deck up to the
 * mast top on one side (`side` 1 left, -1 right), sagging below the
 * straight chord by 16% of its rise at mid-run and drawing in toward the
 * mast; never lower than the handrail. Scene frame, end first.
 */
export function mainCable(layout: BridgeLayout, side: 1 | -1, end: 'A' | 'B'): V3[] {
  const { path, mast, halfWidth: hw } = layout
  if (mast === null) return []
  const S = path.samples
  const e0 = end === 'A' ? 0 : S.length - 1
  const n = Math.abs(mast - e0)
  const yEnd = S[e0].e + CABLE_END_M
  const yTop = S[mast].e + mastHeight(path) - 0.25
  return Array.from({ length: n + 1 }, (_, q) => {
    const i = e0 + (mast > e0 ? q : -q)
    const u = n ? q / n : 1
    const y = Math.max(yEnd + (yTop - yEnd) * u - CABLE_SAG * (yTop - yEnd) * Math.sin(Math.PI * u), S[i].e + HANDRAIL_M)
    const lat = side * (hw + (0.2 - hw) * Math.pow(u, 1.4))
    return pointAt(path, i, lat, y - S[i].e)
  })
}

export interface BridgeMeshes {
  /** The walking surface. */
  readonly deck: MeshData
  /** The deck's sides, underside and ends. */
  readonly body: MeshData
  /** Ribbon glass balustrades. */
  readonly glass: MeshData
  /** Handrails, rail posts and hangers. */
  readonly rail: MeshData
  /** Truss chords, verticals, diagonals and floor beams. */
  readonly frame: MeshData
  /** Cable main cables and the mast's cross beam (dark). */
  readonly cable: MeshData
  /** Columns, Y forks, legs and the mast. */
  readonly posts: MeshData
  /** A cable bridge's concrete end piers. */
  readonly piers: MeshData
}

/** The bridge's meshes, scene frame, metres; `groundAt` is the ground elevation under a site point. */
export function buildBridge(layout: BridgeLayout, groundAt: (x: number, n: number) => number): BridgeMeshes {
  const out: BridgeMeshes = {
    deck: emptyMesh(),
    body: emptyMesh(),
    glass: emptyMesh(),
    rail: emptyMesh(),
    frame: emptyMesh(),
    cable: emptyMesh(),
    posts: emptyMesh(),
    piers: emptyMesh(),
  }
  addDeck(out, layout)
  if (layout.style === 'ribbon') addRibbon(out, layout, groundAt)
  else if (layout.style === 'truss') addTruss(out, layout, groundAt)
  else addCable(out, layout, groundAt)
  addGuard(out, layout)
  return out
}

/** Deck top and the body under it, both edges and both ends (legacy stripGeo top and body). */
function addDeck(out: BridgeMeshes, { path, depth: th, halfWidth: hw }: BridgeLayout): void {
  const S = path.samples
  const line = (k: number, dy: number) => S.map((_, i) => pointAt(path, i, k, dy))
  const [TL, TR, BL, BR] = [line(hw, 0), line(-hw, 0), line(hw, -th), line(-hw, -th)]
  for (let i = 0; i + 1 < S.length; i++) {
    const left: V3 = [S[i].px, 0, -S[i].pn]
    addPolygon(out.deck, [TL[i], TR[i], TR[i + 1], TL[i + 1]], [0, 1, 0])
    addPolygon(out.body, [BL[i], BR[i], BR[i + 1], BL[i + 1]], [0, -1, 0])
    addPolygon(out.body, [TL[i], BL[i], BL[i + 1], TL[i + 1]], left)
    addPolygon(out.body, [TR[i], BR[i], BR[i + 1], TR[i + 1]], [-left[0], 0, -left[2]])
  }
  const last = S.length - 1
  for (const [i, dir] of [[0, -1], [last, 1]] as const) addPolygon(out.body, [TL[i], TR[i], BR[i], BL[i]], [S[i].pn * dir, 0, S[i].px * dir])
}

/** Glass balustrades with steel handrails both sides, on Y columns forking up from the ground (legacy ribbon). */
function addRibbon(out: BridgeMeshes, { path, depth: th, halfWidth: hw, columns }: BridgeLayout, groundAt: (x: number, n: number) => number): void {
  const S = path.samples
  const line = (k: number, dy: number) => S.map((_, i) => pointAt(path, i, k, dy))
  const [G0, G1, H0, H1] = [line(hw - GLASS_INSET_M, GLASS_BASE_M), line(hw - GLASS_INSET_M, HANDRAIL_M), line(-hw + GLASS_INSET_M, GLASS_BASE_M), line(-hw + GLASS_INSET_M, HANDRAIL_M)]
  for (let i = 0; i + 1 < S.length; i++) {
    const left: V3 = [S[i].px, 0, -S[i].pn]
    addPolygon(out.glass, [G0[i], G1[i], G1[i + 1], G0[i + 1]], left)
    addPolygon(out.glass, [H0[i], H1[i], H1[i + 1], H0[i + 1]], [-left[0], 0, -left[2]])
    addPrism(out.rail, G1[i], G1[i + 1], 0.035)
    addPrism(out.rail, H1[i], H1[i + 1], 0.035)
    addPrism(out.rail, G0[i], G0[i + 1], 0.03)
    addPrism(out.rail, H0[i], H0[i + 1], 0.03)
  }
  for (const i of columns) {
    const s = S[i]
    const g = groundAt(s.x, s.n)
    const fork = pointAt(path, i, 0, -th - Math.min(1.4, (s.e - th - g) * 0.35))
    addPrism(out.posts, [s.x, g - FOOT_EMBED_M, -s.n], fork, 0.15, 12, true)
    addPrism(out.posts, fork, pointAt(path, i, hw * 0.6, -th), 0.085, 6)
    addPrism(out.posts, fork, pointAt(path, i, -hw * 0.6, -th), 0.085, 6)
  }
}

/** How far in from the deck edge each style's guard stands, metres. */
const guardInset = (style: BridgeStyle): number => (style === 'truss' ? TRUSS_GUARD_IN_M : 0.03)

/**
 * The feet of the guard pickets along one side (1 left, -1 right) of a
 * truss or cable bridge, scene frame, deck top: evenly along each half-metre
 * sample step so no clear gap is over 3.5 in. Deliberate change (R3.7): the
 * old truss and cable bridges had open side panels, 2.4 m truss bays and
 * 1.5 m between cable-bridge rail posts. Empty for a ribbon (glass).
 */
export function bridgeGuard(layout: BridgeLayout, side: 1 | -1): V3[] {
  if (layout.style === 'ribbon') return []
  const { path } = layout
  const k = side * (layout.halfWidth - guardInset(layout.style))
  const P = path.samples.map((_, i) => pointAt(path, i, k, 0))
  const feet: V3[] = [P[0]]
  for (let i = 0; i + 1 < P.length; i++) {
    const [a, b] = [P[i], P[i + 1]]
    const L = Math.hypot(b[0] - a[0], b[2] - a[2])
    const n = Math.max(1, Math.ceil(L / (PICKET_CLEAR_M + BRIDGE_PICKET_M) - 1e-9))
    for (let j = 1; j <= n; j++) feet.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n, a[2] + ((b[2] - a[2]) * j) / n])
  }
  return feet
}

/** The pickets and, for a truss, a handrail along both sides at handrail height (a cable bridge has its own handrails). */
function addGuard(out: BridgeMeshes, layout: BridgeLayout): void {
  const { path } = layout
  for (const side of [1, -1] as const) {
    for (const f of bridgeGuard(layout, side)) addPrism(out.rail, f, [f[0], f[1] + HANDRAIL_M, f[2]], BRIDGE_PICKET_M / Math.SQRT2)
    if (layout.style !== 'truss') continue
    const k = side * (layout.halfWidth - guardInset('truss'))
    const R = path.samples.map((_, i) => pointAt(path, i, k, HANDRAIL_M))
    for (let i = 0; i + 1 < R.length; i++) addPrism(out.rail, R[i], R[i + 1], 0.03)
  }
}

/** Two side frames of panels with alternating diagonals, floor beams at the panel points, leg pairs where it stands (legacy truss). */
function addTruss(out: BridgeMeshes, { path, depth: th, halfWidth: hw, columns }: BridgeLayout, groundAt: (x: number, n: number) => number): void {
  const S = path.samples
  const nodes = trussNodes(path)
  for (const k of [hw, -hw]) {
    const bot = S.map((_, i) => pointAt(path, i, k, 0.02))
    const top = S.map((_, i) => pointAt(path, i, k, TRUSS_HEIGHT_M))
    for (let i = 0; i + 1 < S.length; i++) {
      addPrism(out.frame, bot[i], bot[i + 1], 0.08)
      addPrism(out.frame, top[i], top[i + 1], 0.08)
    }
    nodes.forEach((i, j) => {
      addPrism(out.frame, bot[i], top[i], 0.055)
      const i2 = nodes[j + 1]
      if (i2 === undefined) return
      if (j % 2) addPrism(out.frame, bot[i], top[i2], 0.05)
      else addPrism(out.frame, top[i], bot[i2], 0.05)
    })
  }
  for (const i of nodes) addPrism(out.frame, pointAt(path, i, hw, -th - 0.05), pointAt(path, i, -hw, -th - 0.05), 0.07, 6)
  for (const i of columns) {
    const s = S[i]
    for (const k of [hw * 0.8, -hw * 0.8]) {
      const x = s.x + s.px * k
      const n = s.n + s.pn * k
      addPrism(out.posts, [x, groundAt(x, n) - FOOT_EMBED_M, -n], pointAt(path, i, k, -th), 0.14, 8, true)
    }
    addPrism(out.posts, pointAt(path, i, hw, -th - 0.1), pointAt(path, i, -hw, -th - 0.1), 0.12, 6)
  }
}

/** An A-frame mast at mid-span, sagging main cables with hangers to the deck edges, handrails, piers at the ends (legacy cable). */
function addCable(out: BridgeMeshes, layout: BridgeLayout, groundAt: (x: number, n: number) => number): void {
  const { path, depth: th, halfWidth: hw, columns, mast } = layout
  if (mast === null) return
  const S = path.samples
  const s = S[mast]
  const apex = pointAt(path, mast, 0, mastHeight(path))
  for (const k of [hw + 0.7, -hw - 0.7]) {
    const x = s.x + s.px * k
    const n = s.n + s.pn * k
    addPrism(out.posts, [x, Math.min(groundAt(x, n), s.e - th) - FOOT_EMBED_M, -n], apex, 0.17, 8, true)
  }
  addPrism(out.cable, pointAt(path, mast, hw + 0.5, -th - 0.1), pointAt(path, mast, -hw - 0.5, -th - 0.1), 0.14, 6, true)
  for (const side of [1, -1] as const) {
    for (const end of ['A', 'B'] as const) {
      const cable = mainCable(layout, side, end)
      const e0 = end === 'A' ? 0 : S.length - 1
      const n = cable.length - 1
      cable.forEach((p, q) => {
        if (q > 0) addPrism(out.cable, cable[q - 1], p, 0.045, 6)
        const i = e0 + (mast > e0 ? q : -q)
        if (q % 3 === 0 && (n ? q / n : 1) < 0.97) addPrism(out.rail, pointAt(path, i, side * hw, 0), p, 0.016)
      })
    }
  }
  const R0 = S.map((_, i) => pointAt(path, i, hw - 0.03, HANDRAIL_M))
  const R1 = S.map((_, i) => pointAt(path, i, -hw + 0.03, HANDRAIL_M))
  for (let i = 0; i + 1 < S.length; i++) {
    addPrism(out.rail, R0[i], R0[i + 1], 0.03)
    addPrism(out.rail, R1[i], R1[i + 1], 0.03)
    if (i % 3 === 0) {
      addPrism(out.rail, pointAt(path, i, hw - 0.03, 0), R0[i], 0.02)
      addPrism(out.rail, pointAt(path, i, -hw + 0.03, 0), R1[i], 0.02)
    }
  }
  for (const i of columns) {
    const c = S[i]
    addPrism(out.piers, [c.x, groundAt(c.x, c.n) - FOOT_EMBED_M, -c.n], pointAt(path, i, 0, -th), 0.3, 12, true)
  }
}
