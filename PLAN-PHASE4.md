# Phase 4 plan: tools, UI and beginner experience

Status: **split into parts 4A–4E (Finley's OK, Nov 4 2026). 4A in detail below, waiting for Finley's OK.** Claude Code reads this file before starting each part.

## Why this plan changed

The first draft of this plan was written before Phases 5A–5D. Since then:
- **Already built:** real wall holes for openings (5D), sun and tide, Roofs off, the saved-views strip, feet-and-inches fields, save history, and placing path pieces with a ghost (5C).
- **Folded in:** Phase 5E's tools (place, duplicate, snap, measure, help) were folded into Phase 4 on Oct 29 2026. 5E keeps its site rules (setback sliders, the code check, lot coverage, the program budget, clearances), which follow Phase 4.

Phase 4 is too big for one branch, so it is split like Phase 5. Each part gets its own branch, ends in something you can use, and has its own done-when check.

| Part | Builds | Done when |
| --- | --- | --- |
| **4A · Tools** | One current tool in the store and a left tool strip; the object library and place tool for every object type; drag to move; snapping (1 ft, 5°) with a toggle; Q / E / R turns; duplicate; the measure tool; the pointer's elevation and slope readout; a mode chip | From Scheme C you can place a cabin, a tree and a pad from the library, duplicate one, drag it with snapping, turn it with Q / E, and measure between two cabins. Each step is one undo step, refused on a locked layer, and the readout shows the ground under the pointer |
| **4B · Layout** | Site / Build / Interior / Present task tabs, each showing only its tools; the inspector grouped under collapsible headings; empty states that teach; the Help menu with a shortcuts sheet; Cmd/Ctrl+K command search; box select and moving a group; align and distribute | Every tool sits in one tab, the inspector reads top to bottom by heading, and Cmd+K finds and runs any action or setting |
| **4C · Beginner** | The Beginner / Advanced switch (**Beginner by default** for a new browser), plain-language names, tooltips on every control with one-line definitions (setback, OHWM, NAVD88, pitch, overhang), delete confirmation in Beginner only, and the five-step first-run tour | Someone new can place, move, lock and save a cabin in about a minute without help |
| **4D · Present** | Present mode (full screen, no editing controls, saved views as a strip, labels off, a sun animation from morning to golden hour, Escape to leave); compass and scale bar; loading splash; PNG snapshot | Present mode shows the saved views full screen with no editing controls and looks at least as good as the Phase 3 screenshots |
| **4E · Graphics polish** | Beach and shore (gravel and driftwood band, a foam line that moves with the tide, wet sand); soft contact shadows under each cabin; warmer sunset sky and distance haze; a cleaner Sketch style; faster first frame (target under 3 s); the WebGPU test behind `?gpu=1` | The scene shows in under 3 s on a fresh load, and the shore and contact shadows read in every display style |

## Decisions (Finley, Nov 4 2026)

- **Order:** 4A first. The tabs and Beginner mode are built around the tools, so the tools come first.
- **Snapping:** moves snap to 1 ft and turns to **5°**, as in the old planner (Q / E turn 5°, R turns 90°).
- **Beginner mode is the default** for a new browser; Advanced is one click and remembered.
- **Graphics polish** is its own part, 4E, after 4D.

## 4A in detail (waiting for Finley's OK)

Branch: `phase-4a-tools`, from `main`.

The tools get their own section, `src/tools/`, with a `CLAUDE.md` map like the others. The tool's store slice is `src/store/toolActions.ts`.

1. **One current tool.** The store holds one `tool`: `select`, `place` (with the library item), `measure`, `paint` or `connect`.
   - Today's separate `placing`, `painting` and `connecting` flags become this one value. They already exclude each other, so behaviour doesn't change.
   - Switching tools is view state: never an undo step, never saved with the plan.
   - Escape returns to Select. A mode chip over the view says what's active ("Placing: Guest cabin · R to turn · Esc to stop"), as in the old planner.
2. **Left tool strip.** A narrow strip down the left edge of the 3D view:
   - **Tools:** Select (V), Place (opens the library), Measure (M), Paint (P), Connect (C), and the Snap toggle. Each has a tooltip with its key.
   - **Path pieces:** the Path pieces library moves into Place, alongside the other objects.
3. **Object library and place tool.** Every object the old planner's library offers, with its defaults: Main house, Guest cabin, Shop / garage, Deck, Driveway, Trailer pad, Shed, Drainfield reserve, Garden beds, the four trees, Granite erratic, Native meadow, Rain-garden pond, Sky bridge and Plunge pool, plus the five path pieces.
   - **Placing:** a ghost follows the pointer on the ground, snapping when Snap is on. R turns it 90°, and Q / E turn it 5°. A click places it as one undo step and selects it. Shift-click keeps placing more.
   - **Locks:** placing is refused on a locked layer, with a toast saying why.
4. **Drag to move.** Drag a selected, unlocked object across the ground to move it, as the old Select tool did. It's one undo step, it snaps when Snap is on, and the move gizmo stays as it is.
5. **Snapping.** With Snap on, moves land on a 1 ft grid and turns on 5° steps: dragging, the gizmo, placing, and the resize handles. The snapped value shows beside the pointer while dragging. Q / E turn the selection 5° and R turns it 90°, each as one undo step.
6. **Duplicate.** Cmd/Ctrl+D copies the selection 5 ft east and south, as one undo step, and selects the copies. Refused on a locked layer.
7. **Measure tool (M).**
   - **Use:** click two points on the ground or on any object.
   - **Readout:** horizontal distance, slope distance and rise, in feet and inches, as a line and a label in 3D.
   - **Keeping measurements:** the last five stay until you press Clear. Esc drops the one in progress.
   - **Storage:** measurements are view state, not plan data.
8. **Pointer readout.** The ground elevation (NAVD88, feet) and slope (%) under the pointer, at the bottom of the view, with earthworks applied.

**Tests first:**
- **Tool state:** switching tools adds no undo step, Escape returns to Select, and starting one tool ends the others.
- **Library:** every library item makes a valid object with the old planner's defaults.
- **Placing:** each placement is one undo step, lands at the click, is selected afterwards, and is refused on a locked layer.
- **Snapping:** positions round to 1 ft and turns to 5°; Q / E / R turn by 5°, 5° and 90°.
- **Duplicate:** one undo step, offset 5 ft, refused on a locked layer.
- **Measure:** horizontal, slope and vertical distances against known terrain points.
- **Readout:** elevation and slope against the terrain grid.
- **E2e:** the done-when walk above, in Playwright.

Anything that behaves differently from the old planner goes into PLAN.md under "Deliberate changes from the legacy file".

## 4B–4E: notes carried from the first draft

**4B · Layout.**
- **Top bar:** plan name, the four task tabs, undo and redo, display style, save status.
- **Right side:** the inspector for the selection, or Layers plus Sun and tide when nothing is selected.
- **Bottom:** the saved-views strip and a one-line hint ("Drag to orbit · right-drag to pan · scroll to zoom").
- **Tabs:** Site has layers, sun and tide, the terrain lock and contours. Build has the tools, parts, openings, railings and paint. Interior opens the floor-plan editor. Present enters Present mode.
- **Inspector headings:** Placement, Size, Roof, Openings, Foundation, Look.
- **Libraries:** command search uses `cmdk`.

**4C · Beginner.**
- **Hidden in Beginner:** pitch, ridge direction, overhang, post spacing, foundation type and per-layer locks, with plain-language names ("How steep the roof is").
- **Tooltips:** Radix UI Tooltip, so they're keyboard-reachable.
- **Tour:** five steps (orbit, select, move, lock, save); skippable, replayable from Help, and remembered per browser.

**4D · Present.**
- **Open question:** should Present mode also offer a slow orbit animation, or only the sun animation?

**4E · Graphics polish.**
- **Rebuilding:** rebuild shore and shadow meshes only when the plan changes, never while something moves.
- **Shaders:** new shaders in TSL.
- **Precompiling:** precompile materials once (`gl.compile`).
- **Load order:** load the reflection and post-processing after the first frame.
