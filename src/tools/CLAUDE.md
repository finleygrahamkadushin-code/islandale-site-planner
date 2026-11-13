# Tools section

The editing tools (Phase 4A): the one current tool (Select, Place, Paint, Connect), the left tool strip, the object library and the Place tool, drag to move, snapping (1 ft, 5°), Q / E / R turns and Duplicate. **Work from this map.** Open only the files the task names, and only open another section when "Talks to" below says the task crosses into it.

## Start here, by task

| To change… | Open |
|---|---|
| Which tool is on, and switching tools | `../store/toolActions.ts` (`toolOf`, `setTool`); the exclusive setters `setPlacing`, `setPainting`, `setConnecting` are in `../store/planStore.ts` |
| The tool strip: buttons, icons, tooltips, the Snap toggle | `ToolStrip.tsx` |
| What the library offers and each item's defaults | `library.ts` (`LIBRARY`, `buildLibraryObject`) |
| The library picker beside the strip | `LibraryPanel.tsx`, `libraryOpen.ts` (open or closed) |
| Putting an item down: snapping, layer locks, path pieces | `../store/toolActions.ts` (`placeItem`); the ghost is `../scene/PlaceGhost.tsx`, the ground click `../site/TerrainMesh.tsx` |
| The 1 ft grid and 5° steps | `snap.ts` |
| Dragging a selected object across the ground | `useDragMove.ts` (wired in through `../scene/useObjectInteraction.ts`) |
| Snapping on the move gizmo and corner handles | `../scene/SelectionGizmo.tsx`, `../scene/ResizeHandles.tsx` |
| Duplicate and turning the selection | `../store/toolActions.ts` (`duplicateObjects`, `turnObjects`) |
| The tool keys (V, L, S, P, C, Esc; R / Q / E while placing) | `toolKeys.ts`; Cmd/Ctrl+D and Q / E / R on the selection are in `../ui/useKeyboardShortcuts.ts` |
| The Measure tool (M): maths, keeping five, drawing | `measure.ts` (`measureOf`), `../store/toolActions.ts` (`measurePoint`), `MeasureLayer.tsx` |
| Box select (Shift-drag on empty ground) | `useBoxSelect.tsx` (window listeners from the ground's press), `arrange.ts` (`idsInBox`) |
| Keyboard placing (R10.1): the ghost starts where the view looks, arrows move it (compass, 1 ft / Shift 5 ft), Enter places | `keyboardPlace.ts` (`startPlacingAtView`, `placeKey`, called from `toolKeys.ts`), `arrowSteps.ts` (shared with the selection's nudge); the view centre is `../scene/cameraFocus.ts` (`viewCentre`) |
| Keyboard selecting (R10.1): what a "Select …" entry does | `keyboardSelect.ts` (`selectByKeyboard`); the entries are `objectCommands` in `../layout/commands.ts`; what is said goes through `../ui/announce.ts` |
| Add to selection: multi-select with no modifier key (R10.2), the strip's toggle | `addMode.ts` (`useAddMode`, `addsToSelection`, `afterBox`), read by `useBoxSelect.tsx` and `../scene/useObjectInteraction.ts` |
| Align and distribute several objects | `arrange.ts`, `../store/toolActions.ts` (`alignObjects`, `distributeObjects`), the buttons in `../ui/Inspector.tsx` |
| Group drag (drag any selected object) | `useDragMove.ts` (commits through `nudgeObjects`); `DragState.group` in `../scene/editing.ts` |
| Groups: group and ungroup (Cmd/Ctrl+G, Shift ungroups), a click picking the whole group, copies' groups | `groups.ts` (pure), `../store/toolActions.ts` (`groupObjects`, `ungroupObjects`, `duplicateObjects`), the buttons in `../ui/Inspector.tsx`, the keys in `../ui/useKeyboardShortcuts.ts` |
| Isolate and edit: double-click to work on an object or group alone, Esc leaves | `isolate.ts` (the view-state store, `isolationFor`), `IsolateChip.tsx` (the chip, and leaving on Present or when what was isolated is gone); the double-click and the fade are in `../scene/PlanObjects.tsx` and `../scene/Ghosted.tsx`, the empty-space double-click in `../scene/Scene.tsx` |
| The "Placing: … · Esc stops" chip | `ModeChip.tsx` (Paint keeps its own `../buildings/paint/PaintHud.tsx`) |
| How the strip, library and tooltips look | the "Tools (4A)" block at the end of `../app/styles.css` |

## How it fits together

- **One tool at a time:** what each tool holds (`placing`, `painting`, `connecting` in the plan store) decides the tool, and each setter clears the other two. `toolOf(state)` is the one reading of it. Switching tools is view state: never an undo step, never saved.
- **The library:** `library.ts` is pure data. It holds the old planner's `LIB` sizes and colours plus the five path pieces from `../store/pathActions.ts` (`PIECE_LIBRARY`). Path pieces are placed through `addPathPiece`, so they still snap to doors and other pieces; everything else is built by `buildLibraryObject`.
- **Snapping:** `snap` in the plan store (on by default). Positions snap to the site's 1 ft grid and turns to 5° steps. Holding Shift drags freely.
- **Groups and isolate:** a group is plan data (`group` on each member, flat, no nesting). Isolating is view state in `useIsolate`, never undone or saved. While isolated, the rest (`isolation.rest`) is ghosted by `Ghosted`, which swaps in one see-through material and turns off raycasting, so clicks pass through it. Box select, labels and contact shadows also skip the rest.
- **Drags:** the live drag is `useLiveDrag` in `../scene/editing.ts`. The scene draws the object where the drag has it, and the move is committed once on release as one undo step.

## Changing data (the store)

Every edit is one undo step, refused on a read-only tab, with a toast saying why:
- **`placeItem`:** refused on a locked layer.
- **`duplicateObjects`:** refused whole if any object is on a locked layer.
- **`turnObjects`:** locked objects stay put.
- **`groupObjects` / `ungroupObjects`:** refused whole if any member is locked; grouping needs two or more objects.
- **Dragging:** commits through `transformObject`, so locks and path-piece snapping apply as for the gizmo.

## Talks to (open these only when the task crosses over)

- **Uses:** `../store/` (`planStore`, `types`, `ids`, `pathActions`), `../site/units` and `terrain` (ground for a new bridge), `../paths/pieces` (path kinds), `../buildings/parts/partKeys` (`TURN_KEYS`), and `../scene/editing` (`useLiveDrag`).
- **Used by:** `../app/App.tsx` (mounts `ToolStrip` and `ModeChip`), `../scene/useObjectInteraction.ts` (drag), `../scene/PlaceGhost.tsx`, `SelectionGizmo.tsx` and `ResizeHandles.tsx` (snapping), and `../ui/useKeyboardShortcuts.ts` (`toolKey`).
- **Test ids other sections' tests rely on:** `connect-tool` (the strip's Connect button), `place-walk` / `place-ramp` / … (path pieces in the library).

## Checks for this section

- **Unit tests:** `npx vitest run src/tools src/store/tools.test.ts src/store/groups.test.ts` (fast). Then `npx tsc -p tsconfig.app.json` from the repo root.
- **Browser tests:** `e2e/isolate.spec.ts` (double-click, fade, Esc, groups), `e2e/tools.spec.ts` (the 4A done-when: place, duplicate, drag, Q / E / R, locks; about 2 minutes). After changing the drag or the keys, also run `e2e/parts.spec.ts`, `chips.spec.ts` and `paths.spec.ts`.
- **Test probes:** `islandale.lookAtSite(x, n)` and `islandale.screenOf(x, n)` (in `../scene/CameraRig.tsx`) aim the camera and give a site point's screen position, so a test can click the ground.
- **New UI:** run the `web-design-guidelines` skill over new tools files before the part's done-when check.
