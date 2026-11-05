import { usePlanStore } from '../store/planStore'
import { toolOf } from '../store/toolActions'
import { libraryItem } from './library'

/**
 * Which tool is on, over the view (old planner hud-mode chip): Place,
 * Connect and Measure say what to do next and how to stop. Paint has its own chip
 * (PaintHud), which also names the element under the pointer.
 */
export function ModeChip() {
  const tool = usePlanStore(toolOf)
  const item = usePlanStore((s) => s.placing?.item ?? null)
  const connectStep = usePlanStore((s) => (s.connecting ? (s.connecting.A ? 'the second end' : 'the first end') : null))
  const measureStep = usePlanStore((s) => (s.measuring ? (s.measuring.a ? 'the second point' : 'the first point') : null))
  let text: string | null = null
  if (tool === 'place' && item) text = `Placing: ${libraryItem(item).name} · click the ground · R / Q / E turn · Esc stops`
  else if (tool === 'connect' && connectStep) text = `Connect: pick ${connectStep} · Esc stops`
  else if (tool === 'measure' && measureStep) text = `Measure: click ${measureStep} on the ground or anything on it · Esc stops`
  if (!text) return null
  return (
    <div className="part-hud" data-testid="mode-chip" role="status">
      {text}
    </div>
  )
}
