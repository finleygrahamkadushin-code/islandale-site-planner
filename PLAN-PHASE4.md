# Phase 4 plan: better graphics, tools and UI

Status: **draft, waiting for Finley's edits and OK.** Edit anything here; Claude Code reads this file before starting Phase 4.

Branch: `phase-4-tools-ui` (to branch from the Phase 3C branch once 3C passes; see [PLAN-PHASE3B.md](PLAN-PHASE3B.md) and [PLAN-PHASE3C.md](PLAN-PHASE3C.md)).

## Goal

PLAN.md's Phase 4 is "UI and beginner experience". This version widens it, at Finley's request, to three tracks:

1. **UI:** the four task tabs, one inspector, Beginner mode, tooltips, a first-run tour and Present mode.
2. **Tools:** real editing tools (add, duplicate, measure, snap, box-select, command search), so the planner is for designing, not just rearranging Scheme C.
3. **Graphics polish:** fix the visual shortcuts Phase 3 took and add the site realism it left out. Fitted roofs, species trees and contour lines moved to Phase 3B.

Porting the rest of the old planner's features (decks and wings, walls editor, interiors, paths and stairs, site rules) stays in Phase 5. Exports and the path-traced Render button stay in Phase 6.

**Done when:**
- Someone new can place, move, lock and save a cabin in about a minute without help (the original Phase 4 check).
- Every tool in the left strip works with undo and locks, and has a tooltip.
- Present mode shows the five saved views full screen with no editing controls, and looks at least as good as the Phase 3 screenshots.

## What you will be able to do at the end

- Pick a task tab (**Site**, **Build**, **Interior**, **Present**) and see only the tools for it.
- Add a cabin, pad, path or tree from the tool strip, drop it on the ground, and start editing it straight away.
- Duplicate, delete, align and box-select several objects; snap moves to a 1 ft grid and rotations to 15°.
- Measure distances and heights on the terrain in feet and inches.
- Press Cmd/Ctrl+K and type "roof pitch", "lock" or "golden hour" to jump to any setting or action.
- Switch to Beginner mode, where technical settings hide and every control has a plain-language name and tooltip.
- Take a five-step tour on first launch, replayable from Help.
- Present the plan full screen with the saved views as buttons and an optional sun animation through the day.
- See windows that read as real openings, a believable beach, and a compass and scale bar. (Fitted roofs, trees and contours arrive in Phase 3B.)

## Track 1: UI and beginner experience

1. **Layout.** Top bar: plan name, the four task tabs, undo/redo, display style, save status. Left tool strip: the tools for the current tab only. Right side: the inspector for the selection, or Layers plus Sun and tide when nothing is selected. Bottom: the saved-views strip and a one-line hint ("Drag to orbit · right-drag to pan · scroll to zoom").
2. **Task tabs.** Site (layers, sun and tide, terrain lock, contours), Build (select, add, move, measure), Interior (placeholder until Phase 5, saying so), Present (enters Present mode).
3. **Inspector tidy-up.** Group fields under collapsible headings: Placement, Size, Roof, Openings (read-only list until Phase 5), Foundation, Look (siding, roof material, colours). Show feet and inches ("12′ 6″") and accept either "12.5" or "12' 6\"" when typing.
4. **Beginner / Advanced switch.** Beginner hides pitch, ridge direction, overhang, post spacing, foundation type and per-layer locks, and renames fields in plain language ("How steep the roof is"). The choice is saved per browser.
5. **Tooltips everywhere,** including one-line definitions of setback, OHWM, NAVD88, pitch and overhang, using Radix UI Tooltip so they are keyboard-reachable.
6. **First-run tour.** Five steps: orbit, select, move, lock, save. Skippable, replayable from a Help menu, remembered per browser.
7. **Empty states that teach.** An empty Build tab says "Add a cabin from the tool strip, then drag it into place."
8. **Delete confirmation in Beginner mode only.** Advanced keeps the Phase 2 behaviour (no confirm; undo brings it back).
9. **Present mode.** Hides every editing control and panel; full-screen 3D; the saved views as a strip; labels off by default; a play button that animates the sun from 7 am to the golden-hour light; Escape to leave.
10. **Compass and scale bar** in the corner of the 3D view, both following the camera.

## Track 2: Tools

1. **Tool strip and tool state.** One active tool at a time in the store (select, add-cabin, add-pad, add-path, add-tree, measure). Escape returns to select. View state, never an undo step.
2. **Add tools.** Click the ground to place a new cabin (default 16 × 20 ft, gable, board-and-batten), pad, path or tree; a ghost follows the pointer and snaps to the grid. Each placement is one undo step and is selected afterwards.
3. **Duplicate** (Cmd/Ctrl+D) offsets the copy by 5 ft; **copy and paste** within the plan.
4. **Box select:** Shift-drag on empty ground selects everything inside; the move gizmo then moves the whole group as one undo step.
5. **Snapping:** moves snap to a 1 ft grid and rotations to 15° while Shift is held (or always, with a toggle), with the snapped value shown beside the pointer.
6. **Measure tool:** click two points on the terrain or on objects; show horizontal distance, slope distance and height difference in feet and inches; keep the last few measurements until cleared.
7. **Align and distribute** for multi-selections: align edges or centres, space evenly.
8. **Command search (Cmd/Ctrl+K):** fuzzy search over actions (add cabin, lock all, golden hour, white model) and over the selected object's settings.
9. **Keyboard shortcuts sheet** under Help (?).

## Track 3: Graphics polish

1. ~~Roofs fitted to the footprint~~ moved to Phase 3B.
2. **Real openings.** Cut windows and doors through the wall with `manifold-3d`, with reveals, sills and a dark interior behind the glass so they read as openings from outside. Rebuild cuts only when the cabin's walls change, never while it moves.
3. ~~Better trees~~ moved to Phase 3B.
4. **Beach and shore.** A gravel and driftwood band along the shoreline edges, a soft foam line where the water meets the beach that moves with the tide, and darker wet sand just above the water.
5. ~~Contour lines~~ moved to Phase 3B.
6. **Sky and light.** Warmer sunset sky colours, a subtle distance haze over Mud Bay, and a soft contact shadow under each cabin so they sit on the ground in every style.
7. **Sketch style** with cleaner, slightly thicker silhouette lines and no lines on terrain triangles; optional paper texture behind.
8. **Faster first frame.** Show a loading splash while shaders compile, precompile materials once (`gl.compile`), and load the reflection and post-processing after the first frame. Target: the scene visible in under 3 seconds on a fresh load (it can take 10 seconds or more in dev today).
9. **WebGPU check.** Try `WebGPURenderer` behind a URL flag (`?gpu=1`); move AO, tone mapping and the water to TSL nodes if it works, per the CLAUDE.md rule. Stay on WebGL by default until it matches.

## Order of work

1. Tool state, tool strip and the add tools (they shape the rest of the UI).
2. Task tabs, layout, inspector grouping, feet-and-inches fields.
3. Duplicate, box select, snapping, measure, align, command search.
4. Graphics: beach and foam, contact shadows, sky.
5. Real openings with manifold-3d.
6. Beginner mode, tooltips, empty states, first-run tour.
7. Present mode, compass and scale bar, sun animation.
8. Faster first frame, then the WebGPU experiment behind a flag.
9. Done-when check with a first-time user, screenshots, tests, commit.

## Design decisions (say if you disagree)

- **Grid:** 1 ft for moves, 15° for rotation, both shown while dragging.
- **New cabin defaults:** 16 × 20 ft, 9 ft walls, 6/12 gable, 1.5 ft overhang, posts at 8 ft, board-and-batten in a neutral cedar.
- **Units in the UI:** feet and inches everywhere; metres stay internal.
- **Libraries:** Radix UI for tooltips, menus and dialogs; `cmdk` for command search; `manifold-3d` for cuts; drei `Instances` for leaves and posts.
- **Beginner mode is the default** for a new browser; Advanced is one click.

## Tests to write first

- Tool state: switching tools adds no undo step; Escape returns to select.
- Add tools: each placement is one undo step, lands on the ground at the click, and respects locked layers.
- Duplicate, paste and box-select moves are single undo steps and skip locked objects.
- Snapping: positions round to 1 ft and rotations to 15°.
- Measure: horizontal, slope and vertical distances against known terrain points.
- Feet-and-inches parsing and formatting ("12' 6\"", "12.5", "150 in").
- Openings: cutting a window removes wall area equal to the opening.
- Playwright: the one-minute beginner task (add a cabin, move it, lock it, reload, find it), the tour, Present mode entering and leaving, and command search running an action.

## Open questions for Finley

1. Should Present mode also offer a slow orbit animation, or only the sun animation?
2. Is anything from the old planner's toolbar needed in Phase 4 rather than waiting for Phase 5?

## Changes I want (Finley fills in)

-

## Brief for Claude Code

```
Read PLAN.md and PLAN-PHASE4.md. Start Phase 4 on branch phase-4-tools-ui,
from the Phase 3C branch. Follow the order of work, tests first for each step.
Show me the app in the browser after steps 1, 3, 4, 6 and 7. Commit after
each step that leaves the app runnable. Stop and ask before changing any of
the design decisions.
```
