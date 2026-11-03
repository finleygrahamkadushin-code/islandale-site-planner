import { BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, Matrix4, Quaternion, Euler, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type Species = 'madrone' | 'fir' | 'cedar' | 'alder'

/** Legacy SPECIES palettes; the madrone takes its leaf colour from the object and has red bark. */
const SPECIES: Readonly<Record<Exclude<Species, 'madrone'>, { trunk: string; leaf: readonly string[] }>> = {
  fir: { trunk: '#5a3f2c', leaf: ['#223d29', '#2a4730', '#1e3725'] },
  cedar: { trunk: '#7a4a32', leaf: ['#365530', '#3f5f35', '#304c2a'] },
  alder: { trunk: '#a9a59b', leaf: ['#62904a', '#6f9a52', '#58843f'] },
}
export const MADRONE_BARK = '#8a4a2b'

export function speciesOf(v: unknown): Species {
  return v === 'fir' || v === 'cedar' || v === 'alder' ? v : 'madrone'
}

export function barkColour(species: Species): string {
  return species === 'madrone' ? MADRONE_BARK : SPECIES[species].trunk
}

/** The legacy eRng (mulberry32): the same seed always grows the same tree. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Seed from the object's id, so a tree keeps its shape across reloads and while it is dragged. */
export function treeSeed(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return h >>> 0
}

export interface TreeShape {
  /** Trunk and limbs, one geometry. */
  readonly bark: BufferGeometry
  /** Every crown piece, one geometry with per-vertex colours. */
  readonly crown: BufferGeometry
}

interface Envelope {
  /** Canopy width east-west and north-south, and total height, metres. */
  readonly w: number
  readonly d: number
  readonly h: number
}

/**
 * A tree inside its w × d × h envelope (metres), its base at y 0: the
 * legacy madrone (leaning red trunk, two limbs, seven lumpy crown lobes)
 * or the legacy fir, cedar (stacked cones) and alder (clustered crown).
 */
export function buildTree(species: Species, env: Envelope, leaf: string, seed: number): TreeShape {
  const R = seededRandom(seed)
  const bark: BufferGeometry[] = []
  const crown: BufferGeometry[] = []
  if (species === 'madrone') madrone(env, leaf, R, bark, crown)
  else if (species === 'alder') alder(env, R, bark, crown)
  else conifer(species, env, R, bark, crown)
  return { bark: merge(bark), crown: merge(crown) }
}

function madrone({ w, d, h }: Envelope, leaf: string, R: () => number, bark: BufferGeometry[], crown: BufferGeometry[]): void {
  const rx = w / 2
  const ry = (h * 0.55) / 2
  const rz = d / 2
  const crownY = h * 0.45 + ry * 0.9
  bark.push(place(new CylinderGeometry(0.16, 0.28, h * 0.5, 8), [0, h * 0.25, 0], [0, 0, (R() - 0.5) * 0.18]))
  for (let k = 0; k < 2; k++) {
    const a = R() * Math.PI * 2
    const L = Math.min(rx, rz) * 0.55
    bark.push(place(new CylinderGeometry(0.07, 0.12, L, 6), [Math.cos(a) * L * 0.35, h * 0.42 + k * h * 0.06, Math.sin(a) * L * 0.35], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9]))
  }
  const base = new Color(leaf)
  const lump = R() * 1000
  for (let i = 0; i < 7; i++) {
    const t = (i / 7) * Math.PI * 2 + R() * 0.6
    const rr = i ? 0.35 + R() * 0.15 : 0
    const sc = i ? 0.45 + R() * 0.15 : 0.72
    const tone = base.clone().offsetHSL((R() - 0.5) * 0.03, (R() - 0.5) * 0.1, (R() - 0.5) * 0.08)
    const blob = jitter(new IcosahedronGeometry(1, 2), lump)
    const y = crownY + (i ? (R() - 0.4) * ry * 0.5 : ry * 0.1)
    crown.push(tint(place(blob, [Math.cos(t) * rx * rr, y, Math.sin(t) * rz * rr], [0, 0, 0], [rx * sc, ry * sc * (i ? 0.85 : 1), rz * sc]), tone))
  }
}

function alder({ w, d, h }: Envelope, R: () => number, bark: BufferGeometry[], crown: BufferGeometry[]): void {
  const sp = SPECIES.alder
  bark.push(place(new CylinderGeometry(0.1, 0.18, h * 0.62, 7), [0, h * 0.31, 0]))
  for (let k = 0; k < 9; k++) {
    const a = k * 2.4 + R()
    const rr = k ? 0.45 + R() * 0.25 : 0
    const y = h * (0.62 + R() * 0.26 - rr * 0.12)
    const ry = R() * 6
    const sc = (k ? 0.26 : 0.36) + R() * 0.08
    crown.push(tint(place(new IcosahedronGeometry(1, 1), [(Math.cos(a) * rr * w) / 2, y, (Math.sin(a) * rr * d) / 2], [0, ry, 0], [sc * w, sc * h * 0.6, sc * d]), new Color(sp.leaf[k % 3])))
  }
}

function conifer(species: 'fir' | 'cedar', { w, h }: Envelope, R: () => number, bark: BufferGeometry[], crown: BufferGeometry[]): void {
  const sp = SPECIES[species]
  const cedar = species === 'cedar'
  bark.push(place(new CylinderGeometry(0.12, cedar ? 0.42 : 0.3, h * 0.9, 8), [0, h * 0.45, 0]))
  const N = cedar ? 7 : 6
  const y0 = h * (cedar ? 0.1 : 0.16)
  for (let k = 0; k < N; k++) {
    const t = k / (N - 1)
    const r = (w / 2) * (cedar ? 1 - 0.82 * t : 1 - 0.86 * t) * (0.92 + R() * 0.16)
    const ch = (h - y0) * (cedar ? 0.26 : 0.3) * (1 - 0.3 * t)
    const y = y0 + (h - y0 - ch * 0.55) * Math.pow(t, 0.9) + ch / 2
    const cone = new ConeGeometry(r, ch, cedar ? 11 : 9)
    if (cedar) {
      // drooping skirts: pull each tier's lower rim down
      const pos = cone.attributes.position
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -ch * 0.45) pos.setY(i, pos.getY(i) - ch * 0.12)
    }
    crown.push(tint(place(cone, [(R() - 0.5) * 0.15, y, (R() - 0.5) * 0.15], [0, R() * 6, cedar && k === N - 1 ? 0.25 : 0]), new Color(sp.leaf[k % 3])))
  }
}

/** Push each vertex in or out by a hash of its position, so shared corners move together and the lobe stays closed. */
function jitter(g: BufferGeometry, seed: number): BufferGeometry {
  const pos = g.attributes.position
  const bump = (x: number, y: number, z: number) => {
    const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453
    return v - Math.floor(v)
  }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const f = 0.86 + 0.28 * bump(Math.round(x * 1e3), Math.round(y * 1e3), Math.round(z * 1e3))
    pos.setXYZ(i, x * f, y * f, z * f)
  }
  return g
}

function place(g: BufferGeometry, at: readonly [number, number, number], rot: readonly [number, number, number] = [0, 0, 0], scale: readonly [number, number, number] = [1, 1, 1]): BufferGeometry {
  const m = new Matrix4().compose(new Vector3(...at), new Quaternion().setFromEuler(new Euler(...rot)), new Vector3(...scale))
  const flat = g.index ? g.toNonIndexed() : g
  flat.applyMatrix4(m)
  flat.deleteAttribute('uv')
  flat.computeVertexNormals()
  return flat
}

function tint(g: BufferGeometry, c: Color): BufferGeometry {
  const n = g.attributes.position.count
  const colours = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) colours.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new Float32BufferAttribute(colours, 3))
  return g
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = parts.length ? mergeGeometries(parts) : new BufferGeometry()
  parts.forEach((p) => p.dispose())
  merged.computeBoundingSphere()
  return merged
}
