import type { Object3D } from 'three'

/**
 * Binary glTF (.glb) helpers, ported from tools/export-legacy/glb.mjs:
 * split a GLB into its JSON and BIN chunks, write one back, and finish the
 * JSON three's GLTFExporter leaves bare (it names and tags nodes but not
 * glTF meshes), so Blender puts each piece's extras on its mesh data too.
 * Pure, except `exportGlb`, which runs the exporter.
 */

const GLB_MAGIC = 0x46546c67 // 'glTF'
const GLB_VERSION = 2
const CHUNK_JSON = 0x4e4f534a // 'JSON'
const CHUNK_BIN = 0x004e4942 // 'BIN\0'
const HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8
const TRIANGLES = 4

interface GltfNode {
  readonly name?: string
  readonly mesh?: number
  readonly extras?: Record<string, unknown>
}
interface GltfPrimitive {
  readonly mode?: number
  readonly indices?: number
  readonly attributes: Record<string, number>
}
export interface GltfJson {
  readonly nodes?: readonly GltfNode[]
  readonly meshes?: readonly { readonly name?: string; readonly primitives: readonly GltfPrimitive[]; readonly extras?: Record<string, unknown> }[]
  readonly materials?: readonly unknown[]
  readonly accessors?: readonly { readonly count: number }[]
  readonly [key: string]: unknown
}

export function readGlb(buf: Uint8Array): { json: GltfJson; bin: Uint8Array } {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (buf.byteLength < HEADER_BYTES || view.getUint32(0, true) !== GLB_MAGIC) throw new Error('not a GLB file')
  if (view.getUint32(4, true) !== GLB_VERSION) throw new Error(`unsupported GLB version ${view.getUint32(4, true)}`)
  let off = HEADER_BYTES
  let json: GltfJson | null = null
  let bin: Uint8Array = new Uint8Array(0)
  while (off + CHUNK_HEADER_BYTES <= buf.byteLength) {
    const len = view.getUint32(off, true)
    const type = view.getUint32(off + 4, true)
    const body = buf.subarray(off + CHUNK_HEADER_BYTES, off + CHUNK_HEADER_BYTES + len)
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(body)) as GltfJson
    else if (type === CHUNK_BIN) bin = body
    off += CHUNK_HEADER_BYTES + len
  }
  if (!json) throw new Error('GLB has no JSON chunk')
  return { json, bin }
}

const pad4 = (b: Uint8Array, fill: number): Uint8Array => {
  if (b.byteLength % 4 === 0) return b
  const out = new Uint8Array(b.byteLength + 4 - (b.byteLength % 4)).fill(fill)
  out.set(b)
  return out
}

function chunk(type: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(CHUNK_HEADER_BYTES + body.byteLength)
  const v = new DataView(out.buffer)
  v.setUint32(0, body.byteLength, true)
  v.setUint32(4, type, true)
  out.set(body, CHUNK_HEADER_BYTES)
  return out
}

export function writeGlb(json: GltfJson, bin: Uint8Array): Uint8Array {
  const parts = [chunk(CHUNK_JSON, pad4(new TextEncoder().encode(JSON.stringify(json)), 0x20))]
  if (bin.byteLength) parts.push(chunk(CHUNK_BIN, pad4(bin, 0)))
  const total = HEADER_BYTES + parts.reduce((s, p) => s + p.byteLength, 0)
  const out = new Uint8Array(total)
  const v = new DataView(out.buffer)
  v.setUint32(0, GLB_MAGIC, true)
  v.setUint32(4, GLB_VERSION, true)
  v.setUint32(8, total, true)
  let off = HEADER_BYTES
  for (const p of parts) {
    out.set(p, off)
    off += p.byteLength
  }
  return out
}

/** Name every glTF mesh after its node and copy the node's extras onto it. Returns new JSON. */
export function finishJson(json: GltfJson): GltfJson {
  const meshes = (json.meshes ?? []).map((m) => ({ ...m }))
  for (const n of json.nodes ?? []) {
    if (n.mesh === undefined) continue
    meshes[n.mesh] = { ...meshes[n.mesh], ...(n.name ? { name: n.name } : {}), ...(n.extras ? { extras: { ...n.extras } } : {}) }
  }
  return { ...json, meshes }
}

/** Nodes, meshes, materials and triangles in a GLB's JSON. */
export function countGlb(json: GltfJson): { nodes: number; meshes: number; materials: number; triangles: number } {
  let triangles = 0
  for (const m of json.meshes ?? []) {
    for (const p of m.primitives) {
      if ((p.mode ?? TRIANGLES) !== TRIANGLES) continue
      const acc = json.accessors?.[p.indices ?? p.attributes.POSITION]
      triangles += Math.floor((acc?.count ?? 0) / 3)
    }
  }
  return { nodes: json.nodes?.length ?? 0, meshes: json.meshes?.length ?? 0, materials: json.materials?.length ?? 0, triangles }
}

/** The scene as a finished .glb, and what is in it. */
export async function exportGlb(scene: Object3D): Promise<{ glb: Uint8Array; counts: ReturnType<typeof countGlb> }> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
  const raw = (await new GLTFExporter().parseAsync(scene, { binary: true })) as ArrayBuffer
  const { json, bin } = readGlb(new Uint8Array(raw))
  const finished = finishJson(json)
  return { glb: writeGlb(finished, bin), counts: countGlb(finished) }
}
