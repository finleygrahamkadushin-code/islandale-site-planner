import type { PlanObject } from '../store/types'

/**
 * Which name labels to show, and how strongly (R9.3). Labels that would
 * overlap drop out by rank: the selection first, then buildings, then the
 * rest, the nearer first within a rank. Labels of small things fade with
 * distance and go once faded out, so a far or top-down view shows the
 * buildings' names, not a pile of tags. Pure: screen boxes in, opacities out.
 */

/** 0: selected, 1: a building, 2: anything else. */
export type LabelRank = 0 | 1 | 2

export interface LabelBox {
  readonly id: string
  /** The anchor on screen in CSS pixels: the middle of the label's bottom edge (it hangs above its object). */
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly rank: LabelRank
  /** From the camera to the anchor, in metres. */
  readonly distance: number
}

const BUILDINGS: ReadonlySet<string> = new Set(['house', 'shed', 'shop'])

export const labelRank = (type: PlanObject['type'] | string, selected: boolean): LabelRank => (selected ? 0 : BUILDINGS.has(type) ? 1 : 2)

/** A small thing's label is at full strength nearer than this… */
export const FADE_NEAR_M = 95
/** …and gone this far away. The Overview camera is about 65 m from the cabins, Plan (top) about 140 m above the lot. */
export const FADE_FAR_M = 175
/** Below this a label is not worth its room. */
const MIN_OPACITY = 0.08
/** Room kept clear between two labels, in pixels. */
const GAP_PX = 2

export function farOpacity(distance: number, rank: LabelRank): number {
  if (rank < 2 || distance <= FADE_NEAR_M) return 1
  if (distance >= FADE_FAR_M) return 0
  return (FADE_FAR_M - distance) / (FADE_FAR_M - FADE_NEAR_M)
}

interface Placed {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

const boxOf = (b: LabelBox): Placed => ({ left: b.x - b.w / 2, top: b.y - b.h, right: b.x + b.w / 2, bottom: b.y })
const hits = (a: Placed, b: Placed): boolean =>
  a.left < b.right + GAP_PX && b.left < a.right + GAP_PX && a.top < b.bottom + GAP_PX && b.top < a.bottom + GAP_PX

/** The labels to show, each with its opacity; a label left out is hidden. Selected labels always show. */
export function placeLabels(boxes: readonly LabelBox[]): Map<string, number> {
  const order = [...boxes].sort((a, b) => a.rank - b.rank || a.distance - b.distance)
  const placed: Placed[] = []
  const shown = new Map<string, number>()
  for (const b of order) {
    const opacity = farOpacity(b.distance, b.rank)
    if (opacity < MIN_OPACITY) continue
    const box = boxOf(b)
    if (b.rank > 0 && placed.some((p) => hits(p, box))) continue
    placed.push(box)
    shown.set(b.id, opacity)
  }
  return shown
}
