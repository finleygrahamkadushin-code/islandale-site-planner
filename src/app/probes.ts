import { usePlanStore } from '../store/planStore'
import { firstFrameMs, sampleFrames } from '../scene/perfProbe'
import { useLiveDrag } from '../scene/editing'
import type { exportModelForScript } from '../export/model3d/exportModel'

/**
 * Probes on `window.islandale` for the end-to-end tests, the headless 3D
 * export (tools/export/export_scene.mjs), side-by-side screenshots and the
 * console (R11.2). On under the dev server, which is how every one of those
 * loads the app; in a production build only when it is built with
 * `VITE_ISLANDALE_PROBES=1`. Otherwise the build folds this to false and
 * drops the probe code.
 */
export const PROBES_ON: boolean = import.meta.env.DEV || import.meta.env.VITE_ISLANDALE_PROBES === '1'

export interface IslandaleProbes {
  readonly store: typeof usePlanStore
  readonly firstFrameMs: typeof firstFrameMs
  readonly sampleFrames: typeof sampleFrames
  readonly liveDrag: typeof useLiveDrag
  camera?: () => number[]
  renderInfo?: () => Record<string, unknown>
  /** Export 3D model for tools/export/export_scene.mjs (set by ModelExportProbe). */
  exportModel?: typeof exportModelForScript
  /** The scene's own probes (CameraRig, ElevationCapture). */
  [probe: string]: unknown
}

declare global {
  interface Window {
    islandale?: IslandaleProbes
  }
}

/** Put the probes on `target` (the window) when they are on; the scene adds its own to them once it mounts. */
export function installProbes(target: { islandale?: IslandaleProbes }, on: boolean = PROBES_ON): void {
  if (!on) return
  target.islandale = { store: usePlanStore, firstFrameMs, sampleFrames, liveDrag: useLiveDrag }
}
