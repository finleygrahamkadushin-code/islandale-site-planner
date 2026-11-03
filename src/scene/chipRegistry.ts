import type { ReactNode } from 'react'

/**
 * Scene chips drawn by the DOM layer (`ChipLayer`) and placed each frame by
 * the in-canvas `ScreenChip`, the way labels are. One React root draws them
 * all, so chips coming and going with picks, locks and undo never unmount a
 * root mid-render (each drei Html had its own root).
 */
export interface ChipView {
  readonly id: number
  readonly layer: number
  readonly node: ReactNode
}

let views: readonly ChipView[] = []
const listeners = new Set<() => void>()
/** The chip's DOM element, once the layer has drawn it. */
export const chipElements = new Map<number, HTMLDivElement>()

let nextId = 1
export const newChipId = (): number => nextId++

function emit(next: readonly ChipView[]): void {
  views = next
  listeners.forEach((l) => l())
}

/** Add or update a chip; nothing is redrawn when its layer and content are unchanged. */
export function putChip(view: ChipView): void {
  const i = views.findIndex((v) => v.id === view.id)
  if (i < 0) return emit([...views, view])
  const old = views[i]
  if (old.layer === view.layer && old.node === view.node) return
  emit(views.map((v, k) => (k === i ? view : v)))
}

export function dropChip(id: number): void {
  if (views.some((v) => v.id === id)) emit(views.filter((v) => v.id !== id))
}

export function subscribeChips(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const chipViews = (): readonly ChipView[] => views
