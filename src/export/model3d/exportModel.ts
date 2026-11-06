import type { Object3D } from 'three'
import { downloadBlob } from '../../present/snapshot'
import { usePlanStore } from '../../store/planStore'
import type { ModelExport, ModelExportOptions } from './buildExport'

/**
 * Export 3D model (6B): the .glb and its manifest for Blender and SketchUp.
 * ModelExportProbe, inside the 3D view, hands over the live scene; the
 * export itself (collect, glTF, manifest) loads only when it runs. Changes
 * nothing in the plan, so it is not an undo step.
 */

let liveScene: (() => Object3D) | null = null

export function registerModelScene(get: (() => Object3D) | null): void {
  liveScene = get
}

/** Build the export from the scene as it is drawn now. */
export async function buildFromLiveScene(opts: ModelExportOptions = {}): Promise<ModelExport> {
  if (!liveScene) throw new Error('the 3D view is not ready yet')
  const { buildModelExport } = await import('./buildExport')
  return buildModelExport(liveScene(), usePlanStore.getState(), opts)
}

/** The button and command: download `<slug>.glb` and `<slug>.manifest.json`. */
export async function exportModel(): Promise<void> {
  const toast = usePlanStore.getState().showToast
  try {
    const { slug, glb, manifest } = await buildFromLiveScene({ from: 'app' })
    downloadBlob(new Blob([glb as BlobPart], { type: 'model/gltf-binary' }), `${slug}.glb`)
    downloadBlob(new Blob([JSON.stringify(manifest, null, 1) + '\n'], { type: 'application/json' }), `${slug}.manifest.json`)
    toast(`Saved ${slug}.glb and its manifest (${(glb.byteLength / 1048576).toFixed(1)} MB)`)
  } catch (e: unknown) {
    toast(`The 3D model could not be saved: ${e instanceof Error ? e.message : 'unexpected error'}`)
    throw e
  }
}

/** For tools/export/export_scene.mjs: the same export, as base64 and JSON instead of downloads. */
export async function exportModelForScript(opts: ModelExportOptions = {}): Promise<{ slug: string; glbBase64: string; manifest: ModelExport['manifest'] }> {
  const { slug, glb, manifest } = await buildFromLiveScene({ ...opts, from: 'headless' })
  return { slug, glbBase64: toBase64(glb), manifest }
}

const BASE64_CHUNK = 0x8000

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK))
  return btoa(s)
}
