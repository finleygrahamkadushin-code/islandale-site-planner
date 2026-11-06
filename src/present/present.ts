import { create } from 'zustand'
import { usePlanStore } from '../store/planStore'
import type { LabelMode } from '../store/types'
import { START_HOUR } from './sunTimeline'

/**
 * Present mode (4D): the 3D view full screen, no editing. View state in its
 * own small store: never saved, never an undo step. Entering turns labels off
 * and ends any tool; leaving puts labels back. The sun animation's hour is a
 * preview here; the plan's saved time is never changed by it.
 */

interface PresentState {
  readonly presenting: boolean
  /** The sun animation is running. */
  readonly playing: boolean
  /** The animation's hour, or null for the plan's saved time. */
  readonly previewHour: number | null
  /** The slow turn around the view's centre. */
  readonly orbit: boolean
  /** What entering changed, to put back on leaving. */
  readonly saved: { readonly labelMode: LabelMode } | null
  readonly enter: () => void
  readonly leave: () => void
  readonly play: () => void
  readonly pause: () => void
  readonly setPreviewHour: (hour: number | null) => void
  readonly setOrbit: (on: boolean) => void
}

export const usePresent = create<PresentState>((set, get) => ({
  presenting: false,
  playing: false,
  previewHour: null,
  orbit: false,
  saved: null,
  enter: () => {
    if (get().presenting) return
    const s = usePlanStore.getState()
    const saved = { labelMode: s.labelMode }
    s.setTool('select')
    s.setLabelMode('none')
    set({ presenting: true, saved, playing: false, previewHour: null, orbit: false })
  },
  leave: () => {
    const { presenting, saved } = get()
    if (!presenting) return
    if (saved) usePlanStore.getState().setLabelMode(saved.labelMode)
    set({ presenting: false, saved: null, playing: false, previewHour: null, orbit: false })
  },
  play: () => set((s) => ({ playing: true, previewHour: s.previewHour ?? START_HOUR })),
  pause: () => set({ playing: false }),
  setPreviewHour: (previewHour) => set({ previewHour }),
  setOrbit: (orbit) => set({ orbit }),
}))

/** True while presenting: the plan can't be edited from the view. */
export const isPresenting = (): boolean => usePresent.getState().presenting

/** The hour the sun is drawn at: the animation's preview while it runs, else the plan's saved time. */
export function useSunHour(): number {
  const saved = usePlanStore((s) => s.environment.hour)
  const preview = usePresent((s) => (s.presenting ? s.previewHour : null))
  return preview ?? saved
}
