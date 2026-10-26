import { usePlanStore } from '../store/planStore'
import type { DisplayStyle } from '../store/types'

export const useDisplayStyle = (): DisplayStyle => usePlanStore((s) => s.displayStyle)

/** Neutral palettes for the non-realistic styles. */
export const STYLE_GROUND: Readonly<Record<Exclude<DisplayStyle, 'realistic'>, string>> = {
  white: '#cfcfcb',
  sketch: '#f2f1ec',
  diagram: '#dfe3d3',
}
export const STYLE_BACKGROUND: Readonly<Record<DisplayStyle, string>> = {
  realistic: '#b9c9d6',
  white: '#ecebe7',
  sketch: '#fbfaf6',
  diagram: '#f3f1ea',
}
