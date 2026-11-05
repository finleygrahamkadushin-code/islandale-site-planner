import { usePlanStore } from '../store/planStore'
import type { DisplayStyle } from '../store/types'

/**
 * The display toggles (4B, old Occlusion / Shadows / Edges): each display
 * style has its own defaults, and the toggles override them one by one.
 * Choosing a style clears the overrides. Saved with the plan's view
 * settings, never an undo step.
 */

export type DisplayToggle = 'ao' | 'shadows' | 'edges'

export type DisplayOptions = Partial<Readonly<Record<DisplayToggle, boolean>>>

export const DISPLAY_TOGGLES: readonly { readonly id: DisplayToggle; readonly label: string; readonly hint: string }[] = [
  { id: 'ao', label: 'Occlusion', hint: 'Soft shading where surfaces meet' },
  { id: 'shadows', label: 'Shadows', hint: 'Sun shadows' },
  { id: 'edges', label: 'Edges', hint: 'Outlines on every edge' },
]

const STYLE_DEFAULTS = (style: DisplayStyle): Readonly<Record<DisplayToggle, boolean>> => ({
  ao: true,
  shadows: style !== 'diagram',
  edges: style === 'sketch',
})

export function effectiveDisplay(style: DisplayStyle, options: DisplayOptions): Readonly<Record<DisplayToggle, boolean>> {
  const d = STYLE_DEFAULTS(style)
  return { ao: options.ao ?? d.ao, shadows: options.shadows ?? d.shadows, edges: options.edges ?? d.edges }
}

/** The occlusion, shadows and edges the scene draws now: the style's defaults with the toggles on top. */
export function useDisplayEffects(): Readonly<Record<DisplayToggle, boolean>> {
  const style = usePlanStore((s) => s.displayStyle)
  const ao = usePlanStore((s) => s.displayOptions.ao)
  const shadows = usePlanStore((s) => s.displayOptions.shadows)
  const edges = usePlanStore((s) => s.displayOptions.edges)
  return effectiveDisplay(style, { ao, shadows, edges })
}
