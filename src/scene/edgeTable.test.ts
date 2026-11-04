import { describe, expect, test } from 'vitest'
import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, SphereGeometry } from 'three'
import schemes from '../../data/islandale/schemes.json'
import { BOX_SHAPES, CURVED_SHAPES, localFootprint, type LocalPoint } from '../buildings/footprint'
import { emptyMesh, type MeshData } from '../buildings/geom'
import { buildingMasses, massPoly, type Mass } from '../buildings/masses'
import { buildRoof, normaliseRoof, ROOF_TYPES } from '../buildings/roof'
import { isSculpted, sculptedRoof } from '../buildings/sculptRoof'
import { addPrism } from '../buildings/supports'
import { buildWallShell, edgeMesh, joinByEdge } from '../buildings/wallShell'
import { edgeTable, pickEdges } from './edgeTable'
import { toGeometry } from './meshData'

type V3 = readonly [number, number, number]
type Obj = { id?: string; name: string; t: string } & Record<string, unknown>

const FRONT: V3 = [0, 0, -1]
/** Four sides and two turned views, as a building at any rotation sees them. */
const VIEWS: readonly V3[] = [FRONT, [0, 0, 1], [1, 0, 0], [-1, 0, 0], [Math.sin(0.5), 0, -Math.cos(0.5)], [-Math.cos(1.2), 0, Math.sin(1.2)]]

/** Screen axes for a camera looking along v (horizontal), up y: (right, up). */
function screen(v: V3) {
  const right: V3 = [-v[2], 0, v[0]]
  return (p: V3) => [p[0] * right[0] + p[2] * right[2], p[1]] as const
}

const segments = (lines: Float32Array) => Array.from({ length: lines.length / 6 }, (_, i) => [[lines[i * 6], lines[i * 6 + 1], lines[i * 6 + 2]], [lines[i * 6 + 3], lines[i * 6 + 4], lines[i * 6 + 5]]] as [V3, V3])
const vertices = (g: BufferGeometry) => {
  const p = g.attributes.position
  return Array.from({ length: p.count }, (_, i): V3 => [p.getX(i), p.getY(i), p.getZ(i)])
}

/**
 * The worst shortfall, metres, between the top of the mesh as seen along v
 * and the top of the lines drawn for it, column by column across its width:
 * 0 when the drawing traces the whole outline against the sky.
 */
function skylineGap(g: BufferGeometry, view: V3, bins = 40): number {
  const lines = pickEdges(edgeTable(g), { creaseDeg: 25, view })
  const to = screen(view)
  const pts = vertices(g).map(to)
  const us = pts.map(([u]) => u)
  const [lo, hi] = [Math.min(...us), Math.max(...us)]
  const w = (hi - lo) / bins
  if (!(w > 1e-6)) return 0
  const bin = (u: number) => Math.min(bins - 1, Math.max(0, Math.floor((u - lo) / w)))
  const top = new Array<number>(bins).fill(-Infinity)
  for (const [u, y] of pts) top[bin(u)] = Math.max(top[bin(u)], y)
  const drawn = new Array<number>(bins).fill(-Infinity)
  for (const [a, b] of segments(lines)) {
    const [pa, pb] = [to(a), to(b)]
    // the segment's highest point inside each column it crosses (a line peaks at an end of its clipped piece)
    const [u0, u1] = [Math.min(pa[0], pb[0]), Math.max(pa[0], pb[0])]
    const yAt = (u: number) => (pb[0] === pa[0] ? Math.max(pa[1], pb[1]) : pa[1] + ((pb[1] - pa[1]) * (u - pa[0])) / (pb[0] - pa[0]))
    for (let k = bin(u0); k <= bin(u1); k++) {
      const [c0, c1] = [Math.max(u0, lo + k * w), Math.min(u1, lo + (k + 1) * w)]
      drawn[k] = Math.max(drawn[k], yAt(c0), yAt(c1))
    }
  }
  return Math.max(0, ...top.map((y, i) => (y === -Infinity ? 0 : y - drawn[i])))
}

function quad(points: readonly V3[], tris: readonly (readonly [number, number, number])[]): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(tris.flatMap((t) => t.flatMap((i) => points[i])), 3))
  return g
}

describe('edgeTable', () => {
  test('a box: twelve creases, its face diagonals never drawn, from any side', () => {
    const t = edgeTable(new BoxGeometry(2, 3, 4))
    expect(t.count).toBe(18)
    expect(Array.from(t.open).every((o) => o === 0)).toBe(true)
    expect(pickEdges(t, { creaseDeg: 25, view: null }).length / 6).toBe(12)
    for (const view of VIEWS) expect(pickEdges(t, { creaseDeg: 25, view }).length / 6).toBe(12)
  })

  test('a flat sheet: its rim is open and drawn, whichever way its two triangles are wound', () => {
    const P: V3[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]]
    for (const g of [quad(P, [[0, 1, 2], [0, 2, 3]]), quad(P, [[0, 1, 2], [0, 3, 2]])]) {
      const t = edgeTable(g)
      expect(t.count).toBe(5)
      expect(Array.from(t.open).filter(Boolean)).toHaveLength(4)
      // the shared diagonal is flat either way: not a crease, not an outline
      expect(pickEdges(t, { creaseDeg: 25, view: FRONT }).length / 6).toBe(4)
    }
  })

  test('three faces on one edge make it open, so it always draws', () => {
    const P: V3[] = [[0, 0, 0], [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1]]
    const t = edgeTable(quad(P, [[0, 1, 2], [1, 0, 3], [0, 1, 4]]))
    const shared = segments(pickEdges(t, { creaseDeg: 89, view: null })).filter(([a, b]) => a[0] === 0 && b[0] === 0 && a[2] === 0 && b[2] === 0)
    expect(shared).toHaveLength(1)
  })

  test('degenerate triangles are skipped, and an empty geometry has no edges', () => {
    const P: V3[] = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 0, 0]]
    expect(edgeTable(quad(P, [[0, 1, 2], [0, 3, 1]])).count).toBe(0)
    expect(edgeTable(new BufferGeometry()).count).toBe(0)
  })

  test('a sphere has no creases, yet its outline is drawn all round, and only near the outline', () => {
    const g = new SphereGeometry(1, 48, 24)
    const t = edgeTable(g)
    expect(pickEdges(t, { creaseDeg: 25, view: null }).length).toBe(0)
    for (const view of VIEWS) {
      const to = screen(view)
      const segs = segments(pickEdges(t, { creaseDeg: 25, view }))
      expect(segs.length).toBeGreaterThan(40)
      const radii = segs.flatMap((s) => s.map((p) => Math.hypot(...to(p))))
      expect(Math.min(...radii)).toBeGreaterThan(0.95)
      // every 10 degrees of the outline has a line
      const angles = new Set(segs.flatMap((s) => s.map((p) => Math.floor(((Math.atan2(to(p)[1], to(p)[0]) + Math.PI) * 18) / Math.PI) % 36)))
      expect(angles.size).toBe(36)
    }
  })

  test('a round post shaded smooth draws its two sides and its rims, not a line per facet', () => {
    const t = edgeTable(new CylinderGeometry(0.1, 0.1, 3, 8))
    const segs = segments(pickEdges(t, { creaseDeg: 25, view: FRONT }))
    const upright = segs.filter(([a, b]) => Math.abs(a[1] - b[1]) > 1)
    expect(upright).toHaveLength(2)
    expect(upright.map(([a]) => Math.abs(a[0])).every((x) => Math.abs(x - 0.1) < 1e-6)).toBe(true)
    // the same post with flat facets draws every facet edge sharper than the threshold
    const flat = new CylinderGeometry(0.1, 0.1, 3, 8).toNonIndexed()
    flat.deleteAttribute('normal')
    const all = segments(pickEdges(edgeTable(flat), { creaseDeg: 25, view: FRONT })).filter(([a, b]) => Math.abs(a[1] - b[1]) > 1)
    expect(all).toHaveLength(8)
  })

  test('a stilt strut (an 8-sided prism, as supports.ts builds it) reads as two outline lines from any side', () => {
    const m = emptyMesh()
    addPrism(m, [0.3, 0, 0.2], [0, 3, 0], 0.085, 8)
    const t = edgeTable(toGeometry(m))
    for (const view of VIEWS) {
      const to = screen(view)
      const long = segments(pickEdges(t, { creaseDeg: 25, view })).filter(([a, b]) => Math.abs(a[1] - b[1]) > 1)
      // the two sides of the strut, each one line (or two coinciding where a facet is edge-on)
      const lanes = new Set(long.map(([a]) => Math.round(to(a)[0] * 200)))
      expect(lanes.size).toBeLessThanOrEqual(3)
      expect(long.length).toBeGreaterThanOrEqual(2)
      expect(long.length).toBeLessThanOrEqual(4)
    }
  })

  test('a smooth-shaded mesh still creases at a real corner', () => {
    // a box whose corners share vertices, so computeVertexNormals rounds them
    const g = new BoxGeometry(1, 1, 1)
    g.deleteAttribute('normal')
    g.deleteAttribute('uv')
    const welded = mergeByPosition(g)
    welded.computeVertexNormals()
    expect(pickEdges(edgeTable(welded), { creaseDeg: 25, view: null }).length / 6).toBe(12)
  })
})

/** The geometry indexed by position, so every face at a point shares its vertex. */
function mergeByPosition(g: BufferGeometry): BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g
  const p = src.attributes.position
  const keys = new Map<string, number>()
  const pos: number[] = []
  const index: number[] = []
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(5)).join()
    let k = keys.get(key)
    if (k === undefined) {
      keys.set(key, (k = keys.size))
      pos.push(p.getX(i), p.getY(i), p.getZ(i))
    }
    index.push(k)
  }
  const out = new BufferGeometry()
  out.setAttribute('position', new Float32BufferAttribute(pos, 3))
  out.setIndex(index)
  return out
}

/** The meshes the scene draws for a mass's walls and roof (WallMass, RoofMesh), as geometries. */
function massMeshes(m: Pick<Mass, 'roof' | 'pitch' | 'ridge' | 'overhang' | 'h'> & Partial<Mass>, poly: readonly LocalPoint[]): { name: string; g: BufferGeometry }[] {
  const shell = buildWallShell(poly, m.h, [], { cap: true })
  const out: { name: string; mesh: MeshData }[] = [{ name: 'walls', mesh: joinByEdge(shell.edges.map(edgeMesh)).mesh }, { name: 'cap', mesh: shell.cap }]
  const type = normaliseRoof(m.roof)
  if (isSculpted(type)) {
    const r = sculptedRoof(poly, { roof: type, pitch: m.pitch, ridge: m.ridge, overhang: m.overhang, open: m.open ?? false, curl: m.curl, roofMat: m.roofMat ?? '' })
    out.push({ name: 'slab', mesh: r.slab }, { name: 'fascia', mesh: r.fascia })
  } else if (type !== 'none') {
    const r = buildRoof(poly, { type: m.roof, pitch: m.pitch, ridge: m.ridge, overhangFt: m.overhang, prow: { roofPts: m.roofPts, gable: m.gable, vault: m.vault, dip: m.roofDip } })
    out.push({ name: 'roof', mesh: r.roof }, { name: 'gables', mesh: r.gables }, { name: 'trim', mesh: r.trim })
  }
  return out.filter((x) => x.mesh.positions.length).map(({ name, mesh }) => ({ name, g: toGeometry(mesh) }))
}

const SHAPES = [...BOX_SHAPES, ...CURVED_SHAPES]
const POLY_PTS = [[-15, -10], [12, -10], [15, 0], [8, 10], [-15, 10]]

describe('every roof on every footprint draws its outline against the sky', () => {
  for (const roof of ROOF_TYPES.filter((r) => r !== 'none')) {
    test(roof, () => {
      for (const shape of SHAPES) {
        const poly = localFootprint({ w: 30, d: 20, shape, pts: POLY_PTS })
        for (const { name, g } of massMeshes({ roof, pitch: 6, ridge: 'x', overhang: 1.5, h: 9 }, poly)) {
          for (const view of VIEWS) expect(skylineGap(g, view), `${roof} on ${shape}, ${name}, looking ${view.map((v) => v.toFixed(2))}`).toBeLessThan(0.02)
        }
      }
    })
  }
})

describe("Scheme C's buildings draw their outline from every side", () => {
  const all = (schemes as unknown as { schemes: { id: string; objects: Obj[] }[] }).schemes
  for (const id of ['C', 'C2', 'C3', 'C4']) {
    test(id, () => {
      const cabins = all.find((s) => s.id === id)!.objects.filter((o) => o.t === 'house')
      expect(cabins.length).toBeGreaterThan(0)
      for (const o of cabins) {
        for (const [mi, m] of buildingMasses(o).entries()) {
          if (m.kind !== 'wall') continue
          for (const { name, g } of massMeshes(m, massPoly(m))) {
            for (const view of VIEWS) expect(skylineGap(g, view), `${o.name} mass ${mi} ${m.roof} ${name}`).toBeLessThan(0.02)
          }
        }
      }
    })
  }
})
