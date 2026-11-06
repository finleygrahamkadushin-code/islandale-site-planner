import { create } from 'zustand'

/**
 * What the compass and scale bar show, written by a probe inside the 3D view
 * (`ViewProbe`) only when it changes enough to matter, and the requests they
 * send back (face north, take a snapshot).
 */
interface ViewHudState {
  readonly headingDeg: number
  readonly mPerPx: number
  /** The camera looks straight down, so the scale is exact. */
  readonly exact: boolean
  readonly set: (patch: Partial<Pick<ViewHudState, 'headingDeg' | 'mPerPx' | 'exact'>>) => void
  /** Bumped to ask the view to face north. */
  readonly northRequest: number
  readonly faceNorth: () => void
  /** Bumped to ask the view for a PNG. */
  readonly snapshotRequest: number
  readonly snapshot: () => void
}

export const useViewHud = create<ViewHudState>((set) => ({
  headingDeg: 0,
  mPerPx: 0.1,
  exact: false,
  set: (patch) => set(patch),
  northRequest: 0,
  faceNorth: () => set((s) => ({ northRequest: s.northRequest + 1 })),
  snapshotRequest: 0,
  snapshot: () => set((s) => ({ snapshotRequest: s.snapshotRequest + 1 })),
}))

/** The splash stays until the first frame is drawn with its shaders compiled. */
export const useSplash = create<{ readonly ready: boolean; readonly setReady: () => void }>((set) => ({
  ready: false,
  setReady: () => set({ ready: true }),
}))
