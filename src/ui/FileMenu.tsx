import { lazy, Suspense, useRef, useState } from 'react'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { downloadPlanFile, importPlanFile } from '../export/planFile'
import { exportModel } from '../export/model3d/exportModel'
import { CURRENT_SCHEME_ID, hasSchemeChoice } from '../site/schemes'
import { openSchemeNow } from '../site/archive/openScheme'
import { useArchiveOpen } from '../site/archive/archiveOpen'
import { usePlanStore } from '../store/planStore'
import { useConfirm } from '../guide/confirm'
import { loadSheets } from '../app/prefetch'
import { HistorySub } from './HistoryMenu'
import { MenuItem, TopMenu, useAfterClose } from './TopMenu'

// loaded on first use, so the first frame doesn't wait for them (4E)
const DrawingSheets = lazy(() => loadSheets().then((m) => ({ default: m.DrawingSheets })))
const LegacyPlanner = lazy(() => import('./LegacyPlanner').then((m) => ({ default: m.LegacyPlanner })))

const askReset = () =>
  useConfirm.getState().request(
    { title: 'Go back to Scheme C?', body: 'This replaces the current plan with Scheme C as saved in the old planner. You can undo this.', confirmLabel: 'Reset' },
    () => openSchemeNow(CURRENT_SCHEME_ID),
  )

const askClear = () =>
  useConfirm.getState().request(
    {
      title: 'Clear the whole plan?',
      body: 'This removes every cabin, path, tree and site object, leaving the bare lot. Locked objects stay. You can undo this.',
      confirmLabel: 'Clear',
    },
    () => usePlanStore.getState().clearPlan(),
  )

/**
 * The top bar's File menu (R9.1): the designs (only when the data holds more
 * than one scheme), the plan file, the drawings,
 * the 3D model and the saves. Reset and Clear still ask first. A step that
 * opens a dialog runs once the menu has closed, so the dialog hands focus
 * back to the File button.
 */
export function FileMenu() {
  const [legacyOpen, setLegacyOpen] = useState(false)
  const [sheetsOpen, setSheetsOpen] = useState(false)
  const readOnly = usePlanStore((s) => s.readOnly)
  const schemeChoice = usePlanStore((s) => hasSchemeChoice(s.schemes))
  const trigger = useRef<HTMLButtonElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const { later, onCloseAutoFocus } = useAfterClose(trigger)

  return (
    <>
      <TopMenu label="File" testId="menu-file" triggerRef={trigger} onCloseAutoFocus={onCloseAutoFocus}>
        {schemeChoice && (
          <>
            <MenuItem hint="Every scheme, with its plan and how it meets the brief" data-testid="open-archive" onSelect={later(() => useArchiveOpen.getState().setOpen(true))}>
              Designs…
            </MenuItem>
            <Menu.Separator className="menu-rule" />
          </>
        )}
        <MenuItem hint="Download the plan as a JSON file" data-testid="export-plan" onSelect={downloadPlanFile}>
          Export
        </MenuItem>
        <MenuItem hint="Load a plan from a JSON file" data-testid="import-plan" onSelect={() => fileInput.current?.click()}>
          Import…
        </MenuItem>
        <Menu.Separator className="menu-rule" />
        <MenuItem hint="Plans and elevations to scale, for drawing by hand" data-testid="open-sheets" onSelect={later(() => setSheetsOpen(true))}>
          Sheets…
        </MenuItem>
        <MenuItem hint="A .glb file and its manifest, for Blender and SketchUp" data-testid="export-3d" onSelect={() => void exportModel().catch(() => undefined)}>
          3D model
        </MenuItem>
        <HistorySub />
        {/* the built app runs as the hosted home, which also serves the old planner next to it */}
        {import.meta.env.PROD && (
          <MenuItem hint="The old planner, sharing the hosted home" onSelect={later(() => setLegacyOpen(true))}>
            Old planner
          </MenuItem>
        )}
        <Menu.Separator className="menu-rule" />
        <MenuItem hint="Back to Scheme C as saved in the old planner" data-testid="reset-plan" onSelect={later(askReset)}>
          Reset to Scheme C…
        </MenuItem>
        <MenuItem hint="Remove everything from the plan and start from the bare lot" data-testid="clear-plan" className="danger" disabled={!!readOnly} onSelect={later(askClear)}>
          Clear the plan…
        </MenuItem>
      </TopMenu>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        aria-label="Plan file to import"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void importPlanFile(f)
          e.target.value = ''
        }}
      />
      <Suspense fallback={<span className="toast" role="status">Opening…</span>}>
        {legacyOpen && <LegacyPlanner onClose={() => setLegacyOpen(false)} />}
        {sheetsOpen && <DrawingSheets onClose={() => setSheetsOpen(false)} opener={trigger.current} />}
      </Suspense>
    </>
  )
}
