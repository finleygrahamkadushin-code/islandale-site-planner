import { create } from 'zustand'
import type { Selection } from '../../interiors/edits'
import type { OpeningKind } from '../../interiors/types'

/**
 * The interior editor's view state: which cabin and floor is open, the
 * tool, what is selected, and the plan's pan and zoom. Not part of the plan
 * and never an undo step.
 */
export type InteriorTool = 'select' | 'room' | 'split' | OpeningKind | 'furniture'

export interface PlanView {
  /** Pixels per foot. */
  readonly scale: number
  /** Plan point at the centre of the canvas, feet. */
  readonly cx: number
  readonly cz: number
}

export interface InteriorViewState {
  readonly objectId: string | null
  readonly fi: number
  readonly tool: InteriorTool
  readonly sel: Selection
  /** Furniture type the Furniture tool places. */
  readonly furnType: string
  /** Snap to walls, corners and the 6 in grid (Alt held turns it off for one move). */
  readonly snap: boolean
  /** null until the canvas has been fitted to the cabin. */
  readonly view: PlanView | null
  readonly open: (objectId: string) => void
  readonly close: () => void
  readonly setFloor: (fi: number) => void
  readonly setTool: (tool: InteriorTool) => void
  readonly select: (sel: Selection) => void
  readonly setFurnType: (type: string) => void
  readonly setSnap: (snap: boolean) => void
  readonly setView: (view: PlanView | null) => void
}

export const useInteriorView = create<InteriorViewState>((set) => ({
  objectId: null,
  fi: 0,
  tool: 'select',
  sel: {},
  furnType: 'queen',
  snap: true,
  view: null,
  open: (objectId) => set({ objectId, fi: 0, tool: 'select', sel: {}, view: null }),
  close: () => set({ objectId: null, sel: {}, view: null }),
  setFloor: (fi) => set({ fi, sel: {}, view: null }),
  setTool: (tool) => set({ tool }),
  select: (sel) => set({ sel }),
  setFurnType: (furnType) => set({ furnType, tool: 'furniture' }),
  setSnap: (snap) => set({ snap }),
  setView: (view) => set({ view }),
}))
