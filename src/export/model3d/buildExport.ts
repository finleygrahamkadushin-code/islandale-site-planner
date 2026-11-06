import type { Object3D } from 'three'
import type { PlanState } from '../../store/planStore'
import { collectModel } from './collect'
import { exportGlb } from './glb'
import { buildManifest, type Manifest, type ManifestSource } from './manifest'
import { slugify } from './names'

export interface ModelExportOptions {
  /** Rooms and furniture inside the cabins (default true). */
  readonly interiors?: boolean
  /** Who asked: the app's button, or tools/export/export_scene.mjs. */
  readonly from?: ManifestSource['from']
}

export interface ModelExport {
  readonly slug: string
  readonly glb: Uint8Array
  readonly manifest: Manifest
}

/** The live scene and the plan as a finished .glb and its manifest. Loaded only when an export runs. */
export async function buildModelExport(live: Object3D, state: PlanState, opts: ModelExportOptions = {}): Promise<ModelExport> {
  const { plan, site, environment, displayStyle } = state
  const slug = slugify(plan.name)
  const collected = collectModel(live, plan, { interiors: opts.interiors ?? true })
  const sceneName = plan.name
  collected.scene.userData = { scene: sceneName, exag: 1, manifest: `${slug}.manifest.json` }
  const { glb, counts } = await exportGlb(collected.scene)
  const manifest = buildManifest({
    plan,
    site,
    environment,
    nodes: collected.nodes,
    slug,
    source: { scene: sceneName, from: opts.from ?? 'app', schemeId: plan.schemeId, exportedAt: new Date().toISOString(), displayStyle },
    stats: { ...counts, objects: collected.nodes.length, bytes: glb.byteLength, skippedEmpty: collected.empty, terrainPatches: collected.patches },
  })
  return { slug, glb, manifest }
}
