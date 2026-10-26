import type { LocalPoint } from './footprint'

export type OpeningKind = 'door' | 'window' | 'slider'

/** A legacy cut: `x` is feet from the wall's left end as seen from outside. */
export interface LegacyCut {
  readonly edge?: number
  readonly along?: boolean
  readonly kind?: string
  readonly x?: number
  readonly w?: number
  readonly h?: number
  readonly sill?: number
}

/** An opening placed on a wall, in local feet. */
export interface Opening {
  readonly kind: OpeningKind
  readonly edge: number
  /** Centre of the opening on the wall face (x, y up, z), feet. */
  readonly centre: readonly [number, number, number]
  /** Outward wall normal (x, z). */
  readonly normal: readonly [number, number]
  readonly w: number
  readonly h: number
  readonly sill: number
}

/**
 * Place legacy cuts on a footprint. Per-edge cuts measure `x` from the left
 * as seen from outside, which on this winding is the edge's far vertex
 * (legacy wallEdges). Perimeter cuts (`along`) run from vertex 0 and are
 * split across the walls they cross, as the legacy file did.
 */
export function placeOpenings(poly: readonly LocalPoint[], cuts: readonly LegacyCut[], wallHeightFt: number): Opening[] {
  const edges = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length]
    return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) }
  })
  const perim = edges.reduce((s, e) => s + e.len, 0)
  const cum = edges.reduce<number[]>((acc, e) => [...acc, acc[acc.length - 1] + e.len], [0])
  const out: Opening[] = []

  for (const c of cuts) {
    const kind = asKind(c.kind)
    const w = Math.max(0.5, Number(c.w) || 3)
    const h = Math.min(Math.max(0.5, Number(c.h) || (kind === 'window' ? 4 : 7)), wallHeightFt - 0.2)
    const sill = Math.max(0, Number(c.sill) || (kind === 'window' ? 3 : 0))
    const hh = Math.min(h, wallHeightFt - sill - 0.2)
    if (hh <= 0.2) continue
    if (c.along) {
      if (perim <= 0) continue
      const x0 = (((Number(c.x) || 0) % perim) + perim) % perim
      for (let i = 0; i < edges.length; i++) {
        const s0 = Math.max(x0, cum[i])
        const s1 = Math.min(x0 + w, cum[i + 1])
        if (s1 - s0 < 0.05) continue
        out.push(onEdge(edges[i], i, s0 - cum[i], s1 - s0, kind, hh, sill))
      }
      continue
    }
    const i = Number(c.edge)
    if (!Number.isInteger(i) || i < 0 || i >= edges.length) continue
    const e = edges[i]
    const ww = Math.min(w, e.len)
    const fromLeft = Math.max(0, Math.min(e.len - ww, Number(c.x) || 0))
    out.push(onEdge(e, i, e.len - fromLeft - ww, ww, kind, hh, sill))
  }
  return out
}

function onEdge(
  e: { a: LocalPoint; b: LocalPoint; len: number },
  index: number,
  fromA: number,
  w: number,
  kind: OpeningKind,
  h: number,
  sill: number,
): Opening {
  const ux = (e.b[0] - e.a[0]) / (e.len || 1)
  const uz = (e.b[1] - e.a[1]) / (e.len || 1)
  const t = fromA + w / 2
  return {
    kind,
    edge: index,
    centre: [e.a[0] + ux * t, sill + h / 2, e.a[1] + uz * t],
    normal: [uz, -ux],
    w,
    h,
    sill,
  }
}

function asKind(k: unknown): OpeningKind {
  return k === 'window' || k === 'slider' ? k : 'door'
}
