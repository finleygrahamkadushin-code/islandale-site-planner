import { usePlanStore, type PlanState } from '../store/planStore'
import { DISPLAY_STYLES } from '../store/types'
import { SAVED_VIEWS } from '../scene/views'
import { useFocusRequest } from '../scene/cameraFocus'
import { LIBRARY, type LibraryGroup } from '../tools/library'
import { useLibraryOpen } from '../tools/libraryOpen'
import { useOpenSections, type SectionId } from '../ui/InspectorSection'
import { useInteriorView } from '../interiors/editor/interiorView'
import { requestDelete } from '../guide/confirm'
import { useGuideMode } from '../guide/mode'
import { useTour } from '../guide/tour'
import { usePresent } from '../present/present'
import { useViewHud } from '../present/viewState'
import { useTheme } from '../app/theme'
import { useArchiveOpen } from '../site/archive/archiveOpen'
import { TAB_IDS, TAB_LABELS, TAB_LIBRARY_GROUPS, useTaskTab, type TaskTab } from './tabs'

/**
 * Everything command search (Cmd/Ctrl+K) can run (4B): tools, places,
 * styles, views, tabs, plan-wide actions, and the selected object's
 * settings (which open their inspector heading). Built from the store's
 * state each time the menu opens.
 */

export interface Command {
  readonly id: string
  readonly label: string
  readonly group: string
  /** The keyboard shortcut, when there is one. */
  readonly keys?: string
  readonly run: () => void
}

/** The tab a library group lives in: the current one if it has it, else Build, else Site. */
function tabFor(group: LibraryGroup): TaskTab {
  const now = useTaskTab.getState().tab
  if (TAB_LIBRARY_GROUPS[now].includes(group)) return now
  return TAB_LIBRARY_GROUPS.build.includes(group) ? 'build' : 'site'
}

/** Open an inspector heading and bring it into view. */
function reveal(id: SectionId): void {
  useOpenSections.getState().setOpen(id, true)
  if (typeof document !== 'undefined') document.querySelector(`[data-testid="section-${id}"]`)?.scrollIntoView({ block: 'nearest' })
}

const SETTINGS: readonly { readonly label: string; readonly section: SectionId; readonly types?: readonly string[] }[] = [
  { label: 'Position', section: 'placement' },
  { label: 'Rotation', section: 'placement' },
  { label: 'Height', section: 'size' },
  { label: 'Width and depth', section: 'size' },
  { label: 'Roof pitch', section: 'roof', types: ['house'] },
  { label: 'Roof type', section: 'roof', types: ['house'] },
  { label: 'Colour', section: 'look' },
  { label: 'Exterior paint', section: 'look', types: ['house', 'deck'] },
  { label: 'Openings', section: 'openings', types: ['house'] },
  { label: 'Railings', section: 'railings', types: ['house', 'deck'] },
  { label: 'Levels and junctions', section: 'levels', types: ['house', 'deck'] },
  { label: 'Lock or hide', section: 'visibility' },
]

export function commandsFor(s: PlanState): Command[] {
  const get = () => usePlanStore.getState()
  const tab = (t: TaskTab) => useTaskTab.getState().setTab(t)
  const cmds: Command[] = [
    { id: 'tool-select', group: 'Tools', label: 'Select and move', keys: 'V', run: () => get().setTool('select') },
    { id: 'tool-measure', group: 'Tools', label: 'Measure', keys: 'M', run: () => (tab(useTaskTab.getState().tab === 'site' ? 'site' : 'build'), get().setTool('measure')) },
    { id: 'tool-paint', group: 'Tools', label: 'Paint mode', keys: 'P', run: () => (tab('build'), get().setTool('paint')) },
    { id: 'tool-connect', group: 'Tools', label: 'Connect two ends', keys: 'C', run: () => (tab('build'), get().setTool('connect')) },
    { id: 'tool-library', group: 'Tools', label: 'Open the library', keys: 'L', run: () => useLibraryOpen.getState().setOpen(true) },
    { id: 'snap', group: 'Tools', label: s.snap ? 'Snap off' : 'Snap on', keys: 'S', run: () => get().setSnap(!get().snap) },
    ...LIBRARY.map((item) => ({
      id: `place-${item.id}`,
      group: 'Place',
      label: `Place ${item.name}`,
      run: () => {
        tab(tabFor(item.group))
        get().setTool('place', item.id)
      },
    })),
    ...DISPLAY_STYLES.map((d, i) => ({ id: `style-${d.id}`, group: 'Display', label: d.label, keys: String(i + 1), run: () => get().setDisplayStyle(d.id) })),
    { id: 'roofs', group: 'Display', label: s.roofsOff ? 'Roofs on' : 'Roofs off', run: () => get().setRoofsOff(!get().roofsOff) },
    { id: 'contours', group: 'Display', label: 'Contours on or off', run: () => get().setContours(!(get().contours ?? get().displayStyle !== 'realistic')) },
    { id: 'theme-light', group: 'Display', label: 'Light theme', run: () => useTheme.getState().setTheme('light') },
    { id: 'theme-dark', group: 'Display', label: 'Dark theme', run: () => useTheme.getState().setTheme('dark') },
    { id: 'theme-system', group: 'Display', label: 'System theme: follow this computer', run: () => useTheme.getState().setTheme('system') },
    ...SAVED_VIEWS.map((v) => ({ id: `view-${v.id}`, group: 'Views', label: v.label, run: () => get().requestView(v.id) })),
    ...TAB_IDS.map((t) => ({ id: `tab-${t}`, group: 'Tabs', label: `Go to ${TAB_LABELS[t]}`, run: () => tab(t) })),
    { id: 'archive', group: 'Plan', label: 'Browse designs: every scheme, old and current', run: () => useArchiveOpen.getState().setOpen(true) },
    { id: 'setbacks-show', group: 'Site rules', label: s.setbacks.shown ? 'Hide setbacks' : 'Show setbacks', run: () => get().setSetbacks({ shown: !get().setbacks.shown }) },
    { id: 'setbacks-strict', group: 'Site rules', label: 'Strict setback: shoreline 50 ft', run: () => (tab('site'), get().setSetbacks({ shoreFt: 50 })) },
    { id: 'setbacks-panel', group: 'Site rules', label: 'Setbacks', run: () => tab('site') },
    { id: 'code-check', group: 'Site rules', label: 'Code check', run: () => tab('site') },
    { id: 'program-budget', group: 'Site rules', label: 'Program budget: square feet against the 1,600 cap', run: () => tab('build') },
    { id: 'lock-all', group: 'Plan', label: 'Lock all', run: () => get().lockAll(true) },
    { id: 'unlock-all', group: 'Plan', label: 'Unlock all', run: () => get().lockAll(false) },
    { id: 'show-all', group: 'Plan', label: 'Show everything', run: () => get().showAll() },
    { id: 'undo', group: 'Plan', label: 'Undo', keys: '⌘Z', run: () => usePlanStore.temporal.getState().undo() },
    { id: 'redo', group: 'Plan', label: 'Redo', keys: '⇧⌘Z', run: () => usePlanStore.temporal.getState().redo() },
    { id: 'mode-beginner', group: 'Help', label: 'Beginner mode: plain names, fewer settings', run: () => useGuideMode.getState().setMode('beginner') },
    { id: 'mode-advanced', group: 'Help', label: 'Advanced mode: every setting', run: () => useGuideMode.getState().setMode('advanced') },
    { id: 'tour', group: 'Help', label: 'Take the tour', run: () => useTour.getState().start() },
    { id: 'present', group: 'Views', label: 'Present: full screen, no editing', run: () => usePresent.getState().enter() },
    { id: 'snapshot', group: 'Views', label: 'Save a picture of this view', run: () => useViewHud.getState().snapshot() },
  ]
  if (s.selection.length) {
    cmds.push(
      { id: 'duplicate', group: 'Selection', label: 'Duplicate', keys: '⌘D', run: () => get().duplicateObjects(get().selection) },
      { id: 'fly-to', group: 'Selection', label: 'Fly to the selection', keys: 'F', run: () => useFocusRequest.getState().flyTo(get().selection[0]) },
      { id: 'delete', group: 'Selection', label: 'Delete the selection', keys: 'Delete', run: () => requestDelete(get().selection) },
    )
  }
  const one = s.selection.length === 1 ? s.plan.objects[s.selection[0]] : undefined
  if (one) {
    for (const st of SETTINGS) {
      if (st.types && !st.types.includes(one.type)) continue
      cmds.push({ id: `setting-${st.label}`, group: `${one.name}`, label: st.label, run: () => (tab(useTaskTab.getState().tab === 'site' ? 'site' : 'build'), reveal(st.section)) })
    }
    if (one.type === 'house') cmds.push({ id: 'interior', group: `${one.name}`, label: 'Open the floor plan', keys: 'I', run: () => useInteriorView.getState().open(one.id) })
  }
  return cmds
}
