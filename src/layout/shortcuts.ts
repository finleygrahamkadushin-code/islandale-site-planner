import { keys } from '../ui/keyHint'

/** Every keyboard shortcut, as the Help sheet lists them (4B). One table, so the sheet and the keys can't drift apart. */

export interface Shortcut {
  readonly keys: string
  readonly does: string
}

export const SHORTCUT_GROUPS: readonly { readonly title: string; readonly items: readonly Shortcut[] }[] = [
  {
    title: 'Tools',
    items: [
      { keys: 'V', does: 'Select and move' },
      { keys: 'L', does: 'Open the library to place something' },
      { keys: 'M', does: 'Measure between two points' },
      { keys: 'P', does: 'Paint walls, roofs and rails' },
      { keys: 'C', does: 'Connect two ends with a walk, ramp, boardwalk or stair' },
      { keys: 'S', does: 'Snap on or off (1 ft moves, 5° turns)' },
      { keys: 'Esc', does: 'Stop the current tool, or drop a half-made measurement' },
    ],
  },
  {
    title: 'The selection',
    items: [
      { keys: 'Q / E', does: 'Turn 5° (while placing too)' },
      { keys: 'R', does: 'Turn 90° (Shift+R the other way)' },
      { keys: 'Arrows', does: 'Nudge 1 ft north, south, east or west, whichever way the view faces (Shift: 5 ft); while placing they move the ghost' },
      { keys: 'Enter', does: 'While placing, put it down' },
      { keys: keys('Mod+D'), does: 'Duplicate' },
      { keys: keys('Mod+G'), does: 'Group (with Shift: ungroup); a click then picks the whole group' },
      { keys: 'Double-click', does: 'Edit an object or group alone (the rest fades); Esc or a double-click on empty space leaves' },
      { keys: 'Delete', does: 'Delete' },
      { keys: 'F', does: 'Fly the camera to it' },
      { keys: 'I', does: 'Open the selected cabin’s floor plan' },
      { keys: 'W', does: 'Open its Openings' },
      { keys: 'Shift+drag', does: 'Box select on empty ground; drag freely without snapping' },
      { keys: 'Shift+click', does: 'Add to or take from the selection; place and keep placing' },
    ],
  },
  {
    title: 'View and plan',
    items: [
      { keys: '1 2 3 4', does: 'Realistic, White model, Sketch, Diagram' },
      { keys: keys('Mod+K'), does: 'Search every action and setting' },
      { keys: keys('Mod+Z'), does: 'Undo (with Shift: redo)' },
      { keys: '?', does: 'This sheet' },
    ],
  },
]
