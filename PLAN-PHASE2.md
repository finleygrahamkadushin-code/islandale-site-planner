# Phase 2 plan: core editing (the first usable version)

Status: **draft, waiting for Finley's edits and OK.** Edit anything here; Claude Code reads this file before starting Phase 2.

Branch: `phase-2-core-editing` (branched from `phase-1-foundation`).

## Goal

Make the rebuilt planner usable for everyday work on Scheme C before any of the visual overhaul: see the cabins on the lot, move them, lock what should not move, hide names when they clutter, and never lose work.

**Done when:** you can rearrange Scheme C, lock it, hide names, reload the page, and find it unchanged.

## What you will be able to do at the end

- Open the app and see Scheme C's cabins, pads, trees and boardwalk sitting on the terrain inside the lot line.
- Click a thing to select it. Drag it to move it. Turn it with a rotate handle. Pull a corner to resize it.
- Lock anything with a padlock. Locked things still select (so you can read their info) but will not move, rotate, resize or delete; a small toast says "locked" if you try.
- Switch labels between All, Selected only and None. Hide one object's label on its own.
- Open a Layers panel with an eye and a padlock per category: Buildings, Decks and paths, Trees, Labels, Setbacks, Contours. "Lock all" for handing the plan to someone else.
- Undo and redo everything, with Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z.
- Close the tab, reopen it, and the plan is exactly as you left it (autosave). Export the plan as a JSON file and import one.
- Switch between Scheme C and its C2, C3 and C4 prow variants from a menu. Loading a scheme is undoable.

## Not in Phase 2 (comes later)

- Realistic materials, sky lighting, shadows and the White model / Sketch styles (Phase 3).
- Roof shapes, wings, decks attached to cabins, walls, doors, windows, interiors, paths and stairs geometry (Phase 5). In Phase 2 every object is a simple massed box with its footprint, height and rotation from the old file. Prow and octagon shapes are drawn as their footprint polygon when the old file gives one, otherwise as a box.
- The four task tabs, Beginner mode, tooltips and the tour (Phase 4). Phase 2 has one toolbar and one inspector.
- Code checks, shoreline setback and tide (Phase 5, "Site rules").

## Steps

1. **Objects on the terrain.** Draw each Scheme C object from the store as a box (or footprint polygon) sitting on the ground at its position, height and rotation, in its old colour. Trees as a trunk and a canopy ball. The boardwalk as a ribbon along its points.
   *You will see:* the whole scheme on the lot, from any angle.
2. **Select.** Click to select, Shift-click to add, click empty ground to clear, Escape to clear. Selected objects get an outline and their name in the inspector. Hovering shows a faint highlight.
3. **Move, rotate, resize.** A drei gizmo on the selected object: drag the plane handle to move along the ground (the object follows the terrain height), drag the ring to rotate, drag corner handles to resize width and depth. Arrow keys nudge 1 ft (Shift: 5 ft). Every drag is one undo step.
4. **Lock.** Padlock in the inspector and in the Layers panel. Locked objects: no gizmo, no drag, no delete, no edits in the inspector; selecting still works; a toast explains. Terrain and lot are locked by default and cannot be unlocked in Phase 2.
5. **Labels.** Name labels floating above each object. Top-bar switch: All / Selected / None. Per-object "show name" toggle in the inspector.
6. **Layers panel.** Shown on the right when nothing is selected. Eye and padlock per category, plus "Lock all" and "Show all".
7. **Inspector.** Shown on the right when something is selected: name, type, position (ft, east/north of the lot centre), rotation, width, depth, height, colour, locked, show name. Editing a field is undoable.
8. **Autosave and files.** Save the plan to IndexedDB after every change (debounced). On load, restore it; if there is none, load Scheme C. Export JSON / Import JSON buttons. "Reset to Scheme C" with a confirmation.
9. **Scheme menu.** Current: C. Variants: C2, C3, C4. Old designs: A, B, D, E, F, G, H, I in a collapsed "Archive" group. Loading one replaces the plan (undoable).
10. **Check and commit.** Walk the done-when check in the browser, run the tests, commit.

## Design decisions (say if you disagree)

- **Units shown:** feet with one decimal in the inspector; metres internally.
- **Position origin:** the lot centre (same as the old file), shown as east/north in feet.
- **Resize:** scales the footprint only; height is a separate field. Rotation is about the footprint centre.
- **Delete:** Delete/Backspace removes the selection after no confirmation, because undo brings it back. (Say if you want a confirmation.)
- **Undo scope:** plan changes only. Selection, camera and panel state are not undo steps.
- **Autosave key:** one plan per browser for now ("islandale"). Named plans and a home screen are a later phase.
- **Gizmo library:** drei `PivotControls` for move and rotate; custom corner handles for resize.

## Tests to write first

- Store: move, rotate, resize, delete and lock actions each return a new plan, are undoable, and are refused (unchanged plan) on a locked object.
- Store: label mode and per-object label flags.
- Store: layer visibility and lock by category.
- Persistence: a plan round-trips through the JSON export format; an autosaved plan is restored on load.
- Scene math: an object's scene position sits on the terrain at its site position.
- Playwright (first one): load, drag a cabin, lock it, set labels to None, reload, check the plan is unchanged.

## Open questions for Finley

1. Should the deck wings and attached parts from the old file show in Phase 2 as rough boxes, or wait for Phase 5?
2. Keep the old colour per object, or one neutral colour per category until Phase 3?
3. Anything else you need in the first usable version that is not listed above?

## Changes I want (Finley fills in)

-

## Brief for Claude Code

```
Read PLAN.md and PLAN-PHASE2.md. Start Phase 2 on branch phase-2-core-editing.
Follow the steps in order, tests first for the store. Show me the app in the
browser after steps 1, 3, 6 and 8. Commit after each step that leaves the app
runnable. Stop and ask before any change to the design decisions.
```
