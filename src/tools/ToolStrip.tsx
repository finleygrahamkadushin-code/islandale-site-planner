import type { ReactNode } from 'react'
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Magnet, MousePointer2, Paintbrush, SquarePlus, Spline, type LucideIcon } from 'lucide-react'
import { usePlanStore } from '../store/planStore'
import { toolOf, type ToolId } from '../store/toolActions'
import { LibraryPanel } from './LibraryPanel'
import { useLibraryOpen } from './libraryOpen'

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
]

/** One tooltip: the control's name and its key, shown on hover and on keyboard focus. */
function Tip({ label, keyHint, children }: { readonly label: string; readonly keyHint: string; readonly children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tool-tip" side="right" sideOffset={8}>
          {label} <kbd>{keyHint}</kbd>
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

/**
 * The left tool strip (4A): Select, Place, Paint and Connect as one group
 * (one tool at a time, see toolOf), then the Snap toggle. Place opens the
 * object library beside the strip; picking an item there starts placing it.
 */
export function ToolStrip() {
  const tool = usePlanStore(toolOf)
  const snap = usePlanStore((s) => s.snap)
  const { setTool, setSnap } = usePlanStore.getState()
  const libraryOpen = useLibraryOpen((s) => s.open)
  const setLibraryOpen = useLibraryOpen((s) => s.setOpen)
  const shown: ToolId = libraryOpen ? 'place' : tool

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
    <Tooltip.Provider delayDuration={300}>
      <nav className="toolstrip" aria-label="Tools">
        <ToggleGroup.Root type="single" orientation="vertical" value={shown} onValueChange={choose} aria-label="Current tool" className="toolstrip-group">
          {TOOLS.map(({ id, label, keyHint, Icon, testId }) => (
            <Tip key={id} label={label} keyHint={keyHint}>
              <ToggleGroup.Item value={id} aria-label={label} className="tool-button" data-testid={testId}>
                <Icon size={18} aria-hidden="true" />
              </ToggleGroup.Item>
            </Tip>
          ))}
        </ToggleGroup.Root>
        <hr className="toolstrip-rule" />
        <Tip label={snap ? 'Snap is on: 1 ft moves, 5° turns (hold Shift to drag freely)' : 'Snap is off'} keyHint="S">
          <button type="button" className="tool-button" aria-pressed={snap} aria-label="Snap to the 1 ft grid and 5° turns" data-testid="tool-snap" onClick={() => setSnap(!snap)}>
            <Magnet size={18} aria-hidden="true" />
          </button>
        </Tip>
      </nav>
      {libraryOpen && <LibraryPanel onClose={() => setLibraryOpen(false)} />}
    </Tooltip.Provider>
  )
}

