import * as ToggleGroup from '@radix-ui/react-toggle-group'
import { Tip } from '../guide/Tip'
import { Magnet, MousePointer2, Paintbrush, Ruler, SquarePlus, Spline, type LucideIcon } from 'lucide-react'
import { usePlanStore } from '../store/planStore'
import { toolOf, type ToolId } from '../store/toolActions'
import { LibraryPanel } from './LibraryPanel'
import { useLibraryOpen } from './libraryOpen'
import { TAB_TOOLS, useTaskTab } from '../layout/tabs'

interface ToolButton {
  readonly id: ToolId
  readonly label: string
  readonly keyHint: string
  readonly Icon: LucideIcon
  readonly testId: string
}

const TOOLS: readonly ToolButton[] = [
  { id: 'select', label: 'Select and move', keyHint: 'V', Icon: MousePointer2, testId: 'tool-select' },
  { id: 'place', label: 'Place from the library', keyHint: 'L', Icon: SquarePlus, testId: 'tool-place' },
  { id: 'paint', label: 'Paint walls, roofs and rails', keyHint: 'P', Icon: Paintbrush, testId: 'paint-tool' },
  { id: 'connect', label: 'Connect two ends with a walk, ramp, boardwalk or stair', keyHint: 'C', Icon: Spline, testId: 'connect-tool' },
  { id: 'measure', label: 'Measure between two points', keyHint: 'M', Icon: Ruler, testId: 'tool-measure' },
]

/**
 * The left tool strip (4A, 4B): the current tab's tools as one group (one
 * tool at a time, see toolOf), then the Snap toggle; none on Present. Place opens the
 * object library beside the strip; picking an item there starts placing it.
 */
export function ToolStrip() {
  const tool = usePlanStore(toolOf)
  const snap = usePlanStore((s) => s.snap)
  const { setTool, setSnap } = usePlanStore.getState()
  const tabTools = TAB_TOOLS[useTaskTab((s) => s.tab)]
  const libraryOpen = useLibraryOpen((s) => s.open) && tabTools.includes('place')
  const setLibraryOpen = useLibraryOpen((s) => s.setOpen)
  const shown: ToolId = libraryOpen ? 'place' : tool
  if (!tabTools.length) return null

  const choose = (value: string) => {
    const next = (value || 'select') as ToolId
    if (next === 'place') {
      setLibraryOpen(!libraryOpen)
      return
    }
    setLibraryOpen(false)
    setTool(next)
  }

  return (
    <>
      <nav className="toolstrip" aria-label="Tools">
        <ToggleGroup.Root type="single" orientation="vertical" value={shown} onValueChange={choose} aria-label="Current tool" className="toolstrip-group">
          {TOOLS.filter((t) => tabTools.includes(t.id)).map(({ id, label, keyHint, Icon, testId }) => (
            <Tip key={id} label={label} keyHint={keyHint} side="right">
              <ToggleGroup.Item value={id} aria-label={label} className="tool-button" data-testid={testId}>
                <Icon size={18} aria-hidden="true" />
              </ToggleGroup.Item>
            </Tip>
          ))}
        </ToggleGroup.Root>
        <hr className="toolstrip-rule" />
        <Tip side="right" label={snap ? 'Snap is on: 1 ft moves, 5° turns (hold Shift to drag freely)' : 'Snap is off'} keyHint="S">
          <button type="button" className="tool-button" aria-pressed={snap} aria-label="Snap to the 1 ft grid and 5° turns" data-testid="tool-snap" onClick={() => setSnap(!snap)}>
            <Magnet size={18} aria-hidden="true" />
          </button>
        </Tip>
      </nav>
      {libraryOpen && <LibraryPanel onClose={() => setLibraryOpen(false)} />}
    </>
  )
}

