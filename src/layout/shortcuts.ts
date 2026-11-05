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
      { keys: 'Arrows', does: 'Nudge 1 ft (Shift: 5 ft)' },
      { keys: '⌘D / Ctrl+D', does: 'Duplicate' },
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
      { keys: '⌘K / Ctrl+K', does: 'Search every action and setting' },
      { keys: '⌘Z / Ctrl+Z', does: 'Undo (⇧ to redo)' },
      { keys: '?', does: 'This sheet' },
    ],
  },
]
