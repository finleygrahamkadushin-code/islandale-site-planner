# Phase 4 plan: tools, UI and beginner experience

Status: **split into parts 4A–4E (Finley's OK, Nov 4 2026). 4A approved Nov 4 2026, built and merged into main. 4B approved, built and merged into main. 4C approved (Finley, Nov 5 2026: "make 4c now using plan"), built and merged into main. 4D approved (Finley, Nov 5 2026), built, look checked by Finley and merged into main. 4E in detail below, waiting for Finley's OK.** Claude Code reads this file before starting each part.

## Why this plan changed

The first draft of this plan was written before Phases 5A–5D. Since then:
- **Already built:** real wall holes for openings (5D), sun and tide, Roofs off, the saved-views strip, feet-and-inches fields, save history, and placing path pieces with a ghost (5C).
- **Folded in:** Phase 5E's tools (place, duplicate, snap, measure, help) were folded into Phase 4 on Oct 29 2026. 5E keeps its site rules (setback sliders, the code check, lot coverage, the program budget, clearances), which follow Phase 4.

Phase 4 is too big for one branch, so it is split like Phase 5. Each part gets its own branch, ends in something you can use, and has its own done-when check.

| Part | Builds | Done when |
| --- | --- | --- |
| **4A · Tools (essentials)** | One current tool and a mode chip; a left tool strip; the object library and place tool for every object type; drag to move; snapping (1 ft, 5°) with Q / E / R turns; duplicate | From Scheme C you can place a cabin, a tree and a pad from the library, duplicate one, drag it with snapping, and turn it with Q / E / R. Each step is one undo step and is refused on a locked layer |
| **4B · Layout and site tools** | Site / Build / Interior / Present task tabs; the grouped inspector; the measure tool; the pointer's elevation and slope readout; display toggles; legend; lot facts; selection stats; Help with a shortcuts sheet; Cmd/Ctrl+K command search; box select, group moves, align and distribute; keep placing with Shift-click | Every tool sits in one tab, the inspector reads top to bottom by heading, you can measure between two cabins and read the ground under the pointer, and Cmd+K finds and runs any action or setting |
| **4C · Beginner** | The Beginner / Advanced switch (**Beginner by default**), plain-language names, tooltips with one-line definitions, delete confirmation in Beginner only, the five-step first-run tour, and a full accessibility pass | Someone new can place, move, lock and save a cabin in about a minute without help, and the Lighthouse accessibility score is 95 or more |
| **4D · Present** | Present mode with the sun animation; compass and scale bar; loading splash; PNG snapshot; a message when WebGL isn't available | Present mode shows the saved views full screen with no editing controls and looks at least as good as the Phase 3 screenshots |
| **4E · Polish** | Beach and shore; contact shadows; sky and haze; a cleaner Sketch style; faster first frame; React re-render tuning; the WebGPU test; a light theme and a narrow-screen layout | The scene shows in under 3 s on a fresh load, dragging stays smooth on Scheme C, and the shore and shadows read in every display style |

## Decisions (Finley, Nov 4 2026)

- **Order:** 4A first. The tabs and Beginner mode are built around the tools, so the tools come first.
- **Snapping:** moves snap to 1 ft and turns to **5°**, as in the old planner (Q / E turn 5°, R turns 90°).
- **Beginner mode is the default** for a new browser; Advanced is one click and remembered.
- **Graphics polish** is its own part, 4E, after 4D.
- **4A holds only the essentials**; everything else from the first draft, from 5E's tools, and from the old planner's toolbar is placed in 4B–4E below.

## Libraries, skills and design rules (all parts)

- **Libraries:**
  - **Radix UI primitives** for tooltips, toggle groups, popovers, dialogs and collapsibles. They're accessible and keyboard-reachable, and styled with the app's own CSS tokens.
  - **`lucide-react`** for SVG icons, never emoji.
  - **`cmdk`** for command search (4B).
  - **No Tailwind or shadcn/ui:** both would mean restyling the whole app.
- **Design rules:** every part follows the ui-ux-pro-max accessibility and interaction rules:
  - Text contrast of at least 4.5:1.
  - A visible focus ring on every control.
  - Hit targets of at least 32 px.
  - No hover-only controls.
  - Every icon button has an `aria-label` and a tooltip.
  - New colours are tokens on `:root` in `src/app/styles.css`, never raw hex in components.
- **Skills, used where they fit** (installed Nov 4 2026):

| Skill | From | Used in |
| --- | --- | --- |
| `web-design-guidelines` (Vercel's Web Interface Guidelines, pinned locally) | vercel-labs/agent-skills | A review of every part's new UI files before its done-when check |
| `ui-ux-pro-max` | nextlevelbuilder/ui-ux-pro-max-skill | Accessibility and interaction rules in every part; style and palette choices in 4C and 4E |
| `vercel-composition-patterns` | vercel-labs/agent-skills | 4B: the inspector regrouping and the task tabs as compound components, not boolean props |
| `frontend-design` | anthropics/skills (example-skills) | 4B layout and 4D Present mode's look |
| `webapp-testing` | anthropics/skills (example-skills) | 4C: the first-time-user walk and tour tests |
| `vercel-react-best-practices` | vercel-labs/agent-skills | 4E: re-render and bundle-size tuning |
| `theme-factory` | anthropics/skills (example-skills) | 4E: the light theme |

## 4A in detail: the essentials (approved, built)

Branch: `phase-4a-tools`, from `main`.

The tools get their own section, `src/tools/`, with a `CLAUDE.md` map like the others. The tool's store slice is `src/store/toolActions.ts`.

1. **One current tool.** The store holds one `tool`: `select`, `place` (with the library item), `paint` or `connect`.
   - Today's separate `placing`, `painting` and `connecting` flags become this one value. They already exclude each other, so behaviour doesn't change.
   - Switching tools is view state: never an undo step, never saved with the plan. Escape returns to Select.
   - A mode chip over the view says what's active ("Placing: Guest cabin · R to turn · Esc to stop"), so you always know which tool you're in.
2. **Left tool strip.** A narrow strip down the left edge of the 3D view:
   - **Tools:** Select (V), Place (opens the library), Paint (P), Connect (C), and the Snap toggle, as Radix toggle buttons with lucide icons. Each has a tooltip with its name and key.
   - **Path pieces:** the Path pieces library moves into Place, alongside the other objects. Measure joins the strip in 4B.
3. **Object library and place tool.** Every object the old planner's library offers, with its defaults: Main house, Guest cabin, Shop / garage, Deck, Driveway, Trailer pad, Shed, Drainfield reserve, Garden beds, the four trees, Granite erratic, Native meadow, Rain-garden pond, Sky bridge and Plunge pool, plus the five path pieces.
   - **Placing:** a ghost follows the pointer on the ground. R turns it 90°, and Q / E turn it 5°. A click places it as one undo step, selects it, and returns to Select.
   - **Locks:** placing is refused on a locked layer, with a toast saying why.
4. **Drag to move.** Drag a selected, unlocked object across the ground to move it, as the old Select tool did. It's one undo step, and the move gizmo stays as it is.
5. **Snapping and turning.** With Snap on (the default), moves land on a 1 ft grid and turns on 5° steps: dragging, the gizmo, placing, and the resize handles. Q / E turn the selection 5° and R turns it 90°, each as one undo step and refused when locked.
6. **Duplicate.** Cmd/Ctrl+D copies the selection 5 ft east and south, as one undo step, and selects the copies. Refused on a locked layer.

**Tests first:**
- **Tool state:** switching tools adds no undo step, Escape returns to Select, and starting one tool ends the others.
- **Library:** every library item makes a valid object with the old planner's defaults.
- **Placing:** each placement is one undo step, lands at the click, is selected afterwards, and is refused on a locked layer.
- **Snapping:** positions round to 1 ft and turns to 5°; Q / E / R turn by 5°, 5° and 90°.
- **Duplicate:** one undo step, offset 5 ft, refused on a locked layer.
- **E2e:** the done-when walk above, in Playwright.

**Review before done-when:** run the `web-design-guidelines` skill over the new `src/tools/` UI files, and fix what it finds.

Anything that behaves differently from the old planner goes into PLAN.md under "Deliberate changes from the legacy file".

## 4B in detail: layout and site tools (approved, built)

Branch: `phase-4b-layout`, from `main` after 4A.

**Already there, so not rebuilt:**
- **Camera views:** the saved-views strip has Overview, From the water, Entry, Golden hour and Plan (top), and the free orbit is the default view.
- **Elsewhere:** the contours switch is in Layers, and Roofs off is on the views strip.

**New libraries:**
- `cmdk` 1.1.1 for command search.
- Radix Collapsible 1.2.1 for the inspector headings.
- Radix Dialog 1.3.1 for the shortcuts sheet.

All are unstyled and take the app's tokens. **New section:** `src/layout/`, with its own `CLAUDE.md` map, for the tabs, side-panel switching, help, command search and the bottom bar. The inspector stays in `src/ui/`.

### Order of work

1. **Task tabs.**
   - **Where:** the top bar gets four tabs: **Site**, **Build**, **Interior** and **Present**. The current tab is view state, remembered per browser, and opens on Build.
   - **Tools per tab:** the left strip shows the current tab's tools, and the library is filtered to the tab's groups.
   - **Side panel per tab:** the right panel shows the tab's panels.
   - **Built as compound components** (`<TaskTabs>`, `<TaskTabs.Panel tab="site">`), not boolean props, following `vercel-composition-patterns`.

   | Tab | Tool strip | Library groups | Right panel, nothing selected | Right panel, something selected |
   | --- | --- | --- | --- | --- |
   | **Site** | Select, Place, Measure | Site, Trees, Path pieces | Lot facts, Layers, Sun and tide, Legend | the inspector |
   | **Build** | Select, Place, Paint, Connect, Measure | Buildings, Path pieces | Accessible route, Layers | the inspector |
   | **Interior** | Select | (none) | "Pick a cabin to open its floor plan" | Open floor plan, the cabin's room stats |
   | **Present** | (none) | (none) | Saved views; Present mode itself arrives in 4D | (same) |

2. **The grouped inspector.**
   - **Headings:** the single-object inspector gets Radix collapsible headings, in this order: **Placement** (east, north, rotation), **Size and shape** (height, width, depth, shape fields), **Roof**, **Look** (colour, the Exterior panel), **Openings**, **Railings**, **Levels**, and **Visibility and lock** (locked, show name, hide, delete).
   - **Open by default:** Placement and Size and shape. Which headings are open is remembered per browser.
   - **Selection stats:** a one-line summary sits above the headings: footprint area (sq ft), floor elevation (NAVD88), and the lowest ground under the object.
   - **Empty states:** they teach. For example: "Nothing selected. Pick something in the view, or add a cabin from Place."
3. **Measure and readouts.**
   - **Measure tool (M):** a new tool in `toolOf`. Click two points on the ground or any object. It shows horizontal distance, slope distance and rise in feet and inches, as a line and label in 3D. The last five stay until Clear; Esc drops the one in progress. View state.
   - **Bottom bar:** under the 3D view it shows the pointer's ground elevation (NAVD88, ft) and slope (%), with earthworks applied, plus the hint "Drag to orbit · right-drag to pan · scroll to zoom".
   - **Lot facts** (Site tab): lot area (20,847 sq ft from the parcel data), shoreline length, and the area covered by buildings and decks.
   - **Legend** (Site tab): the ground colour key for earthworks tints, contours, the parcel line and the shoreline buffer.
4. **Selecting and arranging.**
   - **Box select:** Shift-drag on empty ground selects every visible object inside the box.
   - **Group moves:** dragging any selected object moves the whole selection as one undo step, through the existing `nudgeObjects`, which skips locked objects. The gizmo stays single-object.
   - **Align and distribute:** the multi-object inspector gets align (west, east, north, south edges and centres) and distribute evenly (east–west, north–south) buttons. Each is one undo step, and locked objects stay put.
   - **Keep placing:** Shift-click places one and stays in Place.
5. **Help, keys and command search.**
   - **Help menu (?)** in the top bar, with a Radix Dialog shortcuts sheet.
   - **Old keys:** **1–4** display styles, **M** Measure, **I** open the selected cabin's floor plan, **F** fly to the selection. (The old **W** opened the walls editor; its job is the Openings panel now, so W expands that heading.)
   - **Command search (Cmd/Ctrl+K):** `cmdk` over every action and setting, for example "Place guest cabin", "Lock all", "Golden hour", "White model", "Roofs off", "Snap off" and "Roof pitch" (which jumps to that inspector field). Running one closes it.
6. **Display toggles.**
   - **What:** occlusion, shadows and edges, each on or off on its own, in a small Display popover beside the style buttons. Each starts as its style's default, and choosing a style resets them.
   - **Where:** in the Effects pass, the sun's shadows, and `Surface`'s edges.
   - **Saved:** with the plan, like the display style, and not undoable.

### Done when

- **Tabs:** every tool and panel sits in exactly one tab (or is shared on purpose), and switching tabs is never an undo step.
- **Inspector:** reads top to bottom by heading.
- **Measure and readout:** from the Site tab you can measure between two cabins, and the bottom bar reads the ground under the pointer.
- **Box select:** Shift-drag selects a group, and a drag moves it as one undo step.
- **Cmd+K:** finds and runs "Lock all", "Golden hour" and "Place guest cabin".

### Tests first

- **Tabs:** which tools, library groups and panels each tab shows; switching adds no undo step; the tab is remembered.
- **Measure:** horizontal, slope and vertical distances against known terrain points; at most five kept; Esc and Clear.
- **Pointer readout:** elevation and slope against the terrain grid, with a cut applied.
- **Lot facts:** lot area, shoreline length and covered area for Scheme C.
- **Box select:** what's inside a box, hidden objects left out.
- **Align and distribute:** positions, one undo step each, locked objects untouched.
- **Commands:** every registered command runs and names its key.
- **Display toggles:** each turns its effect off and on; a new style resets them.
- **E2e:** the done-when walk above, plus "switching tabs keeps the selection".

**Skills:**
- `vercel-composition-patterns` for the tabs and inspector.
- `frontend-design` for the layout.
- `web-design-guidelines` over every new UI file before the done-when check.

### Decisions (say if you disagree)

- **The tab contents** in the table above, and Build as the tab a new browser opens on.
- **Present before 4D:** in 4B the Present tab only shows the saved views. Full-screen Present mode comes in 4D.
- **Inspector headings open by default:** Placement and Size and shape; the rest start closed and are remembered.
- **W:** expands the Openings heading, rather than opening a separate walls editor.

## 4C in detail: Beginner (approved, built)

Branch: `phase-4c-beginner`, from `main` after 4B.

**New library:** Radix Popover (pinned, at least two weeks old) for the tour. Tooltips already use Radix Tooltip from 4A.

**Where the code goes:** a new `src/guide/` section with its own `CLAUDE.md` map, holding the mode, the glossary, the shared tooltip and the tour. The plain-language names live next to each field.

### Order of work

1. **Beginner / Advanced switch.**
   - **Where:** a switch in the top bar, remembered per browser. **Beginner is the default** for a browser that has never chosen.
   - **Store:** `mode` is view state in its own small store: never saved with the plan, never an undo step.
   - **Command search:** "Beginner mode" and "Advanced mode" commands.
2. **What Beginner hides and renames.**
   - **Roof:** Pitch, Ridge runs and Overhang are hidden. Roof type shows as "Roof shape".
   - **Supports:** post spacing, post size, bracing and foundation type are hidden. The building keeps the old planner's automatic support.
   - **Layers:** per-layer padlocks are hidden; "Lock all" and "Unlock all" stay.
   - **Inspector:** the advanced shape fields (taper, skew, bend, curl) are hidden.
   - **Plain names:** the remaining fields get plain-language names: "How tall the walls are" (Height), "Turned" (Rotation), "East" and "North" with "from the centre of the lot".
   - **Only the presentation changes:** a hidden field keeps its value, and Advanced shows it again.
3. **Tooltips everywhere.**
   - **One shared tooltip:** a single `Tip` component (moved from the tool strip into `src/guide/`) replaces every native `title` hint in the 13 files that have one. Each control gets its name and, where there is one, its key.
   - **Glossary terms:** setback, OHWM (ordinary high water mark), NAVD88, pitch, overhang, contour, berm, lot coverage and accessible route get a dotted underline wherever they appear, and their one-line definition on hover or focus. The definitions live in one `GLOSSARY` table.
4. **Delete confirmation in Beginner only.**
   - **When:** in Beginner, Delete (the key or the button) asks first in a Radix Dialog: "Delete the Guest cabin? You can undo this."
   - **Why a Dialog:** it replaces the browser `window.confirm`, which can't be styled or tested well.
   - **Advanced:** keeps today's behaviour (no question; undo brings it back).
   - **Other confirms:** Reset and removing a floor move to the same dialog in both modes.
5. **First-run tour.**
   - **Steps:** orbit, select, move, lock, save. Each is a Radix Popover anchored to the real control (the view, a cabin's label, the move gizmo, the Locked box, the save status), with Next, Back and Skip.
   - **When it runs:** it starts on a browser's first visit after the plan has loaded. Help gets "Take the tour" to replay it, and finishing or skipping is remembered.
   - **Behaviour:** it never changes the plan; it only points. Escape ends it, and it respects `prefers-reduced-motion`.
6. **Full accessibility pass.**
   - **Guidelines:** run the `web-design-guidelines` and ui-ux-pro-max rules over all of `src/ui/` and every feature panel, not just the new files, and fix what they find.
   - **Lighthouse:** an accessibility audit through Chrome DevTools, with a target of 95 or more.
   - **Things to check:** labels on every control, focus rings, contrast, `prefers-reduced-motion`, and keyboard reach for every panel.

### Done when

- **The one-minute test:** someone new, in Beginner mode, can place a cabin, move it, lock it and save, in about a minute without help. As a browser test: the tour runs, then the walk is done with the real controls.
- **Lighthouse:** the accessibility score is 95 or more.

### Tests first

- **Mode:** Beginner by default, remembered, never an undo step; Advanced shows every field again with its value intact.
- **Glossary:** every term has a definition, and a `Term` shows it on focus.
- **Delete:** in Beginner it asks first and Cancel keeps the object; in Advanced it deletes at once and undo brings it back.
- **Tour:** it runs once, Skip and Escape end it and are remembered, Help replays it, and the plan is never changed.
- **E2e:** the one-minute walk, plus the tour.
- **Skills:** the `webapp-testing` skill alongside Playwright for the walk.

### Decisions (say if you disagree)

- **What Beginner hides:** the fields listed in step 2. Anything a beginner needs to finish a cabin stays.
- **Mode switch:** in the top bar, beside Style.
- **Tour steps:** five steps, and they point at real controls rather than showing a video or slides.
- **Deleting:** Beginner asks before deleting; Advanced never does.

## 4D in detail: Present (approved, built)

Branch: `phase-4d-present`, from `main` after 4C.

**No new library.** Full screen uses the browser's Fullscreen API, the snapshot uses the canvas's own `toBlob`, and the splash waits on three.js's `compileAsync`.

**Where the code goes:** a new `src/present/` section with its own `CLAUDE.md` map, holding Present mode, the sun timeline, the compass and scale bar, the snapshot and the WebGL check. The look follows the `frontend-design` skill.

### Order of work

1. **Present mode.**
   - **Entering:** a "Start presenting" button on the Present tab, and a "Present" command in command search.
   - **Layout:** the 3D view fills the screen. The top bar, tool strip, side panel, bottom bar and every chip and gizmo are hidden. The saved views become a larger strip along the bottom, with a small control bar (play the sun, snapshot, leave).
   - **Full screen:** it asks the browser for real full screen. Where the browser refuses (the hosted home runs in a frame), it fills the window instead.
   - **Labels:** off while presenting. Leaving puts back whatever Labels was set to.
   - **Leaving:** Escape, the Leave button, or leaving browser full screen. The tab, selection and labels come back as they were.
   - **Store:** `presenting` is view state in its own small store: never saved, never an undo step. Nothing in Present mode can edit the plan.
2. **Sun animation.**
   - **What it does:** Play runs the sun from 7 am to golden hour (4:45 pm, the Golden hour view's time) in about 20 seconds, then stops. Pause and a time readout ("2:30 pm, September") sit beside it.
   - **The saved time stays put:** the animation drives a preview hour in the Present store, not the plan's saved hour. Leaving Present, or stopping, goes back to the saved time.
   - **Smoothness:** the sun's direction and shadows move every frame. The sky reflection (`Environment`, which is rebuilt whenever the hour changes) only steps every half hour, so it doesn't rebuild 60 times a second.
   - **Reduced motion:** with `prefers-reduced-motion`, Play steps through five fixed times instead of sweeping.
3. **Compass and scale bar,** in the corner of the 3D view in every tab, not just Present.
   - **Compass:** a north arrow that turns with the camera's heading. Clicking it turns the view to face north.
   - **Scale bar:** a bar of a round length (5, 10, 20, 50 or 100 ft) sized to the ground at the centre of the view. It's labelled "at the centre" in perspective views and is exact in the Plan view.
4. **Loading splash.**
   - **When:** from page load until the first frame is drawn with every shader compiled (`compileAsync`), so the view never shows half-built.
   - **What:** the Islandale name, a quiet progress line from drei's `useProgress`, and the lot's outline. It fades out, or disappears at once under reduced motion.
5. **PNG snapshot.**
   - **Where:** the camera button in Present mode's control bar, and a "Save a picture of this view" command.
   - **What:** the 3D view at its drawn size, as a PNG named after the view and date (`islandale-golden-hour-2026-11-05.png`). It's the 3D scene only: names, the compass and the scale bar are HTML on top of it, so they aren't in the picture.
6. **WebGL fallback.**
   - **Check:** before the 3D view mounts, test for WebGL 2.
   - **Message:** where it's missing, the view area says so in plain words ("This browser can't draw the 3D view…"), with what to try (turn on hardware acceleration, or another browser).
   - **The rest still works:** panels, the plan file, history and the drawing sheets (which are SVG) work without the 3D view.

### Done when

- **Present mode:** shows each saved view full screen with no editing controls, and the sun plays from morning to golden hour.
- **The look:** at least as good as the Phase 3 screenshots. Those were sent in chat on Oct 26 and never saved in the repo, so the check is: the e2e run saves Present-mode pictures of all five views in Realistic and White model, and Finley compares them with the Phase 3 ones.

### Tests first

- **Present store:** entering and leaving are never undo steps; labels, tab and selection come back on leaving; nothing can edit while presenting.
- **Sun timeline:** 7 am to 4:45 pm in order, ending at golden hour; the plan's saved hour is untouched; the sky steps every half hour; reduced motion gives five steps.
- **Scale bar:** metres per pixel from the camera, the round length chosen, exact in Plan view.
- **Compass:** its angle for known camera headings; clicking faces north.
- **Snapshot:** the file name; a PNG is produced at the view's size.
- **WebGL check:** no WebGL 2 shows the message and no 3D view.
- **E2e:** enter Present, check no editing control is visible, click each view, play the sun, take a snapshot (a PNG downloads), Escape leaves with everything restored. It saves the ten done-when pictures.

### Decisions (say if you disagree)

- **Slow orbit (the open question):** yes, as an Orbit toggle in Present's control bar, off by default. It turns slowly around the view's centre and stops the moment you drag.
- **Compass and scale bar:** in every tab, because they help while editing too.
- **The sun animation is a preview:** it never changes the plan's saved time.
- **Snapshot:** the 3D scene only in 4D. Burning names into the picture can come with Phase 6's renders.
- **No key for Present yet:** P is Paint. Present is a button and a command; a key can be added if you want one.
- **The done-when pictures:** saved under `test-results/` for you to look at, not committed, unless you'd like a committed baseline for later parts.

## 4E in detail: Polish (waiting for Finley's OK)

Branch: `phase-4e-polish`, from `main` after 4D.

**Where things stand (measured Nov 5 2026):**
- **Bundle:** one 2.58 MB script (834 kB gzipped) holds the whole app, so the build warns about the 500 kB limit.
- **First frame:** about 8 s from a fresh load to the first drawn frame. That's in the test browser, which draws in software, on the unbundled dev server. Step 1 measures it properly.
- **TSL and WebGPU:** no TSL or WebGPU code exists yet. The effects (`@react-three/postprocessing`) and drei's `Sky` and `MeshReflectorMaterial` are WebGL-only, so the WebGPU step is a test, not a switch.

**New library:** none expected. The fat outlines use three.js's own `LineSegments2`, and the WebGPU test uses `three/webgpu` and `three/tsl`, which ship with three.

**Where the code goes:**
- **Shore, sky and haze:** `src/site/environment/`.
- **Contact shadows and Sketch outlines:** `src/scene/`.
- **Themes and the narrow layout:** `src/app/` and `src/layout/`.
- **The WebGPU test:** `src/scene/webgpu/`, loaded only with `?gpu=1`.

### Order of work

The parts are ordered so 4E can stop after any step with the app better than before. The speed work comes first because the new graphics add to the load.

1. **Measure first.**
   - **Probes:** a first-frame time on the splash's `ready`, and a frame-time probe during a drag.
   - **Finley's numbers:** the production build in real Chrome on Finley's Mac, recorded in this plan as the baseline.
2. **Faster first frame and bundle.**
   - **Split the script:** three.js and drei in their own chunk, the app in another.
   - **Load on first use:** the drawing sheets, the interior editor, the old planner frame, command search and the history list.
   - **After the first frame:** the water's reflection and the post-processing (AO, SMAA) mount once the first frame is drawn, so the view appears sooner and sharpens a moment later.
   - **Target:** the first frame in under 3 s on Finley's Mac; no chunk over 500 kB except three.js's own.
3. **React tuning** (`vercel-react-best-practices`).
   - **Profile:** a drag on Scheme C, to find what re-renders on every pointer move and fix the worst offenders. The plan store's wide selectors are the likely ones.
   - **Target:** a drag stays at 50 fps or more on Finley's Mac (median frame time under 20 ms).
4. **Contact shadows.**
   - **What:** one soft contact shadow under every building, in every style. Drawn once for the whole lot, not per cabin.
   - **When it redraws:** only when the plan changes, never while something is being dragged.
5. **Beach and shore.**
   - **Gravel and driftwood band:** along the parcel's shoreline edges, between low tide and the ordinary high water mark. Driftwood logs are placed from a fixed seed, so they don't move between loads.
   - **Foam line:** where the water meets the ground at the current tide. It moves when the tide slider moves, with a gentle wash that stops under reduced motion.
   - **Wet sand:** a darker band just above the water line, in the terrain's colours. Recoloured only when the tide changes.
   - **Rebuilding:** like the shadows, only when the plan or tide changes.
6. **Sky and haze.**
   - **Sunset:** warmer colours in the hour before sunset.
   - **Haze:** the fog's colour taken from the sky at the horizon, so distant water over Mud Bay fades into the sky instead of into grey.
   - **Scope:** Realistic only; the other styles keep their flat backgrounds.
7. **A cleaner Sketch style.**
   - **Lines:** slightly thicker outlines (about 1.5 px, using three.js's fat lines rather than 1-px lines).
   - **Terrain:** no lines on the terrain's triangles; contours stay.
   - **Silhouettes:** only creases sharper than about 30° are drawn, so curved walls and the dome stop showing their facets.
8. **WebGPU test behind `?gpu=1`.**
   - **What it tries:** three.js's WebGPU renderer, with AO and tone mapping as TSL nodes, the water as a TSL material, and three's TSL sky in place of drei's `Sky`.
   - **Time box:** one sitting.
   - **Outcome:** a short write-up in this plan of what draws, what doesn't and how fast it is. The `?gpu=1` path stays only if it draws Scheme C correctly. WebGL stays the default either way.
9. **Light theme** (`theme-factory`).
   - **What:** a light set of the app's colour tokens for the panels and bars. The 3D view keeps its display styles.
   - **Choosing:** it follows the system setting until you pick one, with a Light / Dark / System choice in the top bar's Style group, remembered per browser. This is how the old planner did it.
   - **Contrast:** every token pair is checked at 4.5:1.
10. **Narrow-screen layout,** for tablets and phones, as the old planner had.
    - **Under 900 px:**
      - The side panel becomes a sheet at the bottom that you can pull up.
      - The top bar folds its groups into a menu.
      - The tool strip runs along the bottom-left.
      - The compass and scale bar move up out of the way.
    - **Touch:** controls are at least 40 px on touch screens.
    - **Interior editor:** its plan and panel stack, as the old one did under 760 px.

### Done when

- **Speed:** the scene shows in under 3 s on a fresh load (production build, Finley's Mac), and dragging stays smooth on Scheme C (50 fps or more).
- **Shore and shadows:** they read in every display style.
- **Themes and layout:** the light theme passes contrast, and the app works at phone (390 px) and tablet (768 px) widths with no sideways scrolling.

### Tests first

- **Bundle:** a build check that fails when a chunk other than three.js passes 500 kB.
- **First frame:** an e2e bound. The test browser draws in software, so its limit is looser (under 6 s on the built app); the 3 s target is checked on Finley's Mac.
- **Shore:**
  - The band follows the shoreline edges.
  - The foam line sits at the tide's height and moves with the tide.
  - The wet band is above the water.
  - Nothing rebuilds while dragging.
- **Contact shadows:** they redraw on a plan change and not during a drag.
- **Sky:** the sun's colour is warmer at golden hour than at noon, and the fog matches the horizon.
- **Sketch:** terrain has no outline mesh, and the crease angle leaves a curved wall's facets unlined.
- **Themes:** contrast of every token pair in both themes; the choice is remembered; System follows the browser.
- **Narrow layout (e2e at 390 × 844 and 768 × 1024):** no sideways scroll; every tab, the inspector and the tool strip reachable; place and move a cabin by touch.
- **Look:** the 4D pictures again, all five views in all four styles, sent to Finley.

### Decisions (say if you disagree)

- **Order:** speed first, then graphics, then WebGPU, then themes and layout. If 4E runs long, the light theme and the narrow layout can become a 4F.
- **WebGPU is a test:** time-boxed, written up, and WebGL stays the default.
- **TSL:** new effects that have to run inside today's WebGL post-processing (contact shadows, foam) use three's built-in materials and drei pieces rather than new shader code. TSL comes with the WebGPU switch, so there's one rewrite, not two.
- **Light theme:** follows the system until chosen, as the old planner did. Light / Dark / System sits in the Style group.
- **Narrow layout:** the side panel becomes a bottom sheet; nothing is removed on small screens.
