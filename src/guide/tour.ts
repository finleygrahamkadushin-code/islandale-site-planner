import { create } from 'zustand'
import { readSaved, writeSaved } from './storage'

/**
 * The first-run tour (4C): five steps (orbit, select, move, lock, save), each
 * pointing at a real control. It never changes the plan; it only points.
 * Finishing or skipping is remembered per browser; Help replays it.
 */

export interface TourStep {
  readonly id: 'orbit' | 'select' | 'move' | 'lock' | 'save'
  readonly title: string
  readonly text: string
  /** Where to point, first one on screen wins; the view is the fallback. */
  readonly anchors: readonly string[]
}

export const VIEW_ANCHOR = '[data-tour="view"]'

export const TOUR_STEPS: readonly TourStep[] = [
  { id: 'orbit', title: 'Look around', text: 'Drag on the view to turn around the lot. Scroll to zoom, and right-drag to slide.', anchors: [VIEW_ANCHOR] },
  { id: 'select', title: 'Pick a cabin', text: 'Click a cabin, or its name tag, to select it. Its settings open on the right.', anchors: ['.label'] },
  {
    id: 'move',
    title: 'Move it',
    text: 'Drag the selected cabin across the ground; it snaps to whole feet. You can also type where it goes here.',
    anchors: ['[data-tour="placement"]', '.label.selected'],
  },
  {
    id: 'lock',
    title: 'Lock it',
    text: 'Tick Locked so it can’t be moved by accident. With nothing selected, Lock all locks everything.',
    anchors: ['[data-tour="lock"]', '[data-tour="lock-all"]'],
  },
  { id: 'save', title: 'It saves itself', text: 'Every change is saved as you go; this says when it’s done. Undo takes back any step.', anchors: ['[data-testid="save-status"]'] },
]

export const TOUR_KEY = 'islandale-tour'

export const tourSeen = (): boolean => readSaved(TOUR_KEY) === 'done'

interface TourState {
  /** The step shown, or null when the tour is off. */
  readonly step: number | null
  readonly start: () => void
  readonly next: () => void
  readonly back: () => void
  /** Finish or skip: either way it's remembered and won't start again by itself. */
  readonly end: () => void
}

export const useTour = create<TourState>((set, get) => ({
  step: null,
  start: () => set({ step: 0 }),
  next: () => {
    const s = get().step
    if (s === null) return
    if (s >= TOUR_STEPS.length - 1) get().end()
    else set({ step: s + 1 })
  },
  back: () => {
    const s = get().step
    if (s !== null && s > 0) set({ step: s - 1 })
  },
  end: () => {
    writeSaved(TOUR_KEY, 'done')
    set({ step: null })
  },
}))

/** Start the tour on a browser's first visit; true when it started. */
export function startTourIfNew(): boolean {
  if (tourSeen() || useTour.getState().step !== null) return false
  useTour.getState().start()
  return true
}
