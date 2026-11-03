import { usePaintHover } from '../scene/paintHover'
import { usePlanStore } from '../store/planStore'

/** "Paint: Main · Wall 3 · P or Esc to leave" over the view while Paint mode is on (legacy hud-mode / hud-paint chips). */
export function PaintHud() {
  const painting = usePlanStore((s) => s.painting)
  const label = usePaintHover((s) => s.label)
  if (!painting) return null
  return (
    <div className="part-hud" data-testid="paint-hud" role="status">
      Paint: {label ?? 'click a wall, roof, rail, door…'} · P or Esc to leave
    </div>
  )
}
