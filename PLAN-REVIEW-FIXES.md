# Review fixes

Nov 10, 2026. The findings of a full review of the planner at commit `46ad18f`, grouped into parts to fix. Finley asked for the review ("real feedback, don't hold back") and then for this plan ("set up for a large work session to debug and fix the stuff you found").

**How each finding was checked** is marked on it:

- **ran**: a script or the running app showed it.
- **traced**: the code path was read end to end.
- **suspected**: likely from the code, not proven.

## Parts

Each part is one branch, fixed test-first, checked in the browser where it can be seen, and committed before the next starts. The order puts trust and data safety before polish.

| Part | What | Done when |
|---|---|---|
| **R0 · Baseline** | A unit test run that is green every time; the commands for this session | `npx vitest run` passes three times in a row on a busy machine |
| **R1 · Keyboard** | Shortcuts respect the focused control and open dialogs | `e2e/keys.spec.ts` passes; arrows on tabs and sliders never move the selection; no key acts behind a dialog |
| **R2 · Site rules** | The code check covers what it claims, measures from walls, and says what it is not | The probe cases in R2 fail before and pass after; the panel and the sheet carry a "not a code review" note |
| **R3 · Stairs and rails** | Fit to code fits; the stair pass names its limits; added stairs meet the planner's own rule | Every stair Fit applies to in every scheme passes after one click; no "+" stair is born failing |
| **R4 · Building geometry** | Triangle footprint, hip roof, fitted roofs, curved-wall openings, two numeric faults | A test per bug that fails before and passes after |
| **R5 · Interiors** | Wall and corner edits cannot overlap rooms or drop pieces; the edit code has tests | Unit tests for `edits.ts`, `rooms.ts`, `envelope.ts`; the overlap probe is refused |
| **R6 · Fields, undo, saving** | Size limits, quarter inches, one undo step per colour pick, import round trip, one bad object no longer loses the plan | A test per item; a plan file with one malformed object opens with the rest intact |
| **R7 · Crashes and stuck states** | Error boundaries; cancelled drags recover; toasts that can be read | A failed lazy chunk shows a message, not a blank page; a cancelled drag leaves keys and orbit working |
| **R8 · Performance** | The view stops drawing when nothing changes; a drag stops rebuilding walls | Nothing is drawn while the view is still; a drag step rebuilds no wall geometry |
| **R9 · Interface** | Top bar size, Beginner mode, labels, sheet default scale, small layout faults | Done, merged Nov 12 (decision 6's default) |
| **R10 · Accessibility** | Keyboard selection of objects, contrast, menu semantics, touch multi-select | A keyboard-only user can select, move and delete an object. Done, merged Nov 12 |
| **R11 · Housekeeping** | Shared units and geometry helpers, CI, a linter, test hooks out of production, CSS | CI runs typecheck and unit tests on every push |

## Decisions Finley needs to make

These change what gets built. Each has a default that will be used if nothing else is said, except the first, which needs facts only Finley has.

1. **What is the shoreline line in `parcel.json`?** Assessor parcel line, LiDAR water edge, or a surveyed ordinary high water mark? And is the tide slider really NAVD88, or MLLW relabelled? (R2.5) No default: this needs the source.
2. **Which code are stairs and guards checked against?** Today: 7 in riser / 11 in tread (IBC), 36 in guards (IRC). Default: keep the numbers, name the source on each row, and stop citing IRC for the 11 in tread.
3. **Do sheds, shops and pools count for the shoreline buffer and height limit, and standalone decks for the side setback?** Default: yes to all three.
4. **Is the hour clock time?** Default: yes, with daylight saving applied in June and September.
5. **Should the dev server keep rewriting the tracked `data/plans/islandale.plan.json`?** It is the shared home by design (3C), but opening the app changes `savedAt` and view settings and dirties git. Default: keep the home, but stop saving view-only changes to it and skip the write when the plan itself is unchanged.
6. **Top bar direction** (R9.1). Default: one row; Export, Import, Reset, Clear, Sheets, 3D model and History move into a File menu; display options into a View menu.
7. **Is the Escape-with-a-tooltip behaviour right?** (R1) Default: Escape still reaches the plan when a tooltip closes on it.

**Answered Nov 13.** Finley answered "Yes, use them" to the lead session's recommended answers for decisions 2 to 7, and then answered decision 1 (branch `claude/review-decisions-6842ee`).

- **1 (the shoreline):** in Finley's words, "navd88 and dont have a file for shoreline". The tide slider is NAVD88, as it reads; there is no survey of the shoreline. The ring's shoreline edges are the assessor's lot line at the water (`parcel.json`'s `meta.source`: the San Juan County assessor via the WDFW statewide parcel service), which the review measured at 6.1 to 8.9 ft NAVD88, below mean higher high water. The app, the site plan and the code now call it the lot line at the water, not the OHWM. Asked next whether to measure the shoreline buffer from the 8 ft contour instead, Finley answered "Yes, 8 ft contour": see R2.5 in PLAN.md (the approximate high-water line). Measured wholly from that line, the gathering building of schemes A, B, C, C2–C4, G, H and I fell inside the 35 ft buffer (the east shore's top of bank moved about 10 ft inland with it). Shown that, Finley said, in this session: "alright i give you permisison to change that one rule back so that those all pass / the shor buffer that is". Taken to mean: the east shore's top of bank goes back to 45 ft in from the assessor's lot line (a fixed place on the ground), so every scheme's shoreline verdict is as it was; the 8 ft line is kept for the south-west shore's buffer (where the lot line already stands above 8 ft, so that buffer does not move), for the "to shore" distances, for the tree zones and as the drawn and named line. If Finley meant the whole buffer back on the lot line, that is one more change: the south-west buffer is unaffected either way, and only the "to shore" distances and tree zones would go back.

- **2 (stair code):** the defaults stand: 7 in / 11 in (IBC 1011.5.2), 36 in guards (IRC R312.1), each row naming its source. With it, **R3.4 is fixed, not kept as a legacy rule**: a stair of n risers has n − 1 treads, so the run is (n − 1) × 11 in in Fit to code, the + chip, Connect, the stair-wing tread check and the path-piece check, and the stair is drawn that way (PLAN.md).
- **3 (what counts for the buffer and setbacks):** yes to all three, as the default; nothing more to do here.
- **4 (clock time):** yes, as the default.
- **5 (the tracked plan file):** the default: the file stays the shared home, and the dev server no longer writes a save whose plan matches the file, so opening the app or changing only view settings leaves it alone (`vite/planFileStore.ts`).
- **6 (top bar):** the default, already built in R9.
- **7 (Escape and tooltips):** the default, already built in R1.
- With these, Finley's answers on the open items: **R6.14** both gaps are intended (hiding ignores locks; a copy is unlocked), now commented and pinned by tests; **R8.8** the TSL rule is dropped from `CLAUDE.md` and `PLAN.md`; **R11.4** the units rule is corrected to what the store keeps, `params` untouched; **R11's formatters** are down to one on screen (`formatLengthField`) and one on drawings (`formatArch`); **R2.10** the panel and site sheet say which ramp items the route check leaves out, without building them.

## Who does what

Finley asked (Nov 10) for the fixes to go to Opus 5.5 agents, to save usage on the larger model. Status and owner per part:

| Part | Owner | Notes |
|---|---|---|
| R0 Baseline | **Done** | `testTimeout` raised; the full unit run is green (152 files, 1,779 tests) |
| R1 Keyboard | **Done** | `e2e/keys.spec.ts` passed. Not re-run after the last tweak (Escape still reaches the plan when a tooltip closes on it; the More menu and the tour stop their own Escape) |
| R2 Site rules | **Merged Nov 10** | Done by Opus. Still open: R2.5 (waits for decision 1) and the unchecked ramp items in R2.10 (landing width, edge protection, passing spaces, door clearance, whether a ramp wing's foot counts as arriving) |
| R3 Stairs and rails | **Merged Nov 10** | Done by Opus. Still open: R3.4 (one tread too many) waits for Finley |
| R4 Building geometry | **Merged Nov 10** | Done by Opus (R4.1 to R4.6). A hip roof's ridge now runs along the longer side whatever the ridge setting |
| R5 Interiors | **Merged Nov 10** | Done by Opus: wall, corner and room edits refuse overlaps, crossings and splits; the edit code has tests |
| R6 Fields, undo, saving | **Merged Nov 10** | Done by Opus (R6.1 to R6.13). Still open, as recommendations in its report: R6.14 (lock gaps), R6.15 (versioning), decision 5 (the tracked plan file) |
| R7 Crashes and stuck states | **Merged Nov 10** | Done by Opus: error boundaries, cancelled drags recover, toasts can be read and closed |
| R8 Performance | **Merged Nov 10** | Done by Opus (R8.1 to R8.4, and the texture in R8.7), checked by the lead session in a headless browser: nothing is drawn while the view is still, and flights, drags, the sun animation, the slow orbit, the isolate fade, resize and the elevation sheets all still draw. Two extras came with it: the camera's coast after an orbit lasts the same time on any machine and ends under a pixel, and an unknown season or a NaN hour no longer blacks out the view. Still open: R8.5 (mesh and material count), R8.6 (first-paint size), R8.8 (the TSL rule, Finley's decision). Not checked: frame rate on a real screen. Found on the way, for R9: a route or junction chip under the pointer takes the mouse wheel, so zoom does nothing there |
| R9 Interface | **Merged Nov 12** | Done by Opus (R9.1 to R9.9, and R9.10: the mouse wheel zooms over a chip too), on decision 6's default: a one-row top bar with File and View menus. Checked by the lead session in a headless browser: the one-row bar and both menus, what Beginner hides, label culling, the magenta lot line on the white model, the tour's first card, Ctrl / ⌘ hints, the sheets' default scale, the Entry view, and that the view still idles. Full browser suite on the R9 branch: 105 of 111 passed; the three old-designs tests for schemes F, G and H and two paint tests failed late in the 1.4 hour run and passed when re-run alone; the rail-click test in `parts.spec` had been failing since R3.7 moved the rail bars, because its second click landed on the "Remove rail" chip, and the test now drops the picked rail before each click. After the merge that test failed once on its first run and passed four times in a row; the cause of the one failure was not found. Still open: warning chips overlap labels and each other; the phone layout is cramped; the dark theme's white-model lot line was not looked at; the suite log shows React "synchronously unmount a root" console errors that nobody has traced |
| R10 Accessibility | **Merged Nov 12** | Done by Opus (R10.1 to R10.7), R10.1 on the design Finley approved with seven review notes: "Select <name>" and "Place <item>" in command search, compass arrows of 1 ft (Shift 5 ft), focus on the 3D view, one polite live region, an "Add to selection" toggle, a setting that turns single-key shortcuts off. Checked by the lead session: the branch's accessibility browser tests, the old-planner overlay test against a production build, and a separate headless run (select, nudge, place, undo, hidden layers left out, same-named trees told apart, arrows in a field left alone, shortcuts off, and text at 4.5:1 and control borders at 3:1 on the live page in both themes). Not checked: the full browser suite on this branch; the tool-strip toggle and the Shift-click fix with a pointer; a real screen reader or touch device; contrast of labels and chips inside the 3D view; the field error text's size. Still open: picking a wing, rail or opening by keyboard; the tablet test in `narrow.spec` failed once in R9's run and once in R10's and passed alone both times; Ctrl / ⌘+K did not open command search from inside an inspector field (not traced, may be older) |
| R11 Housekeeping | **Partly merged Nov 10** | Done by Opus, checked by the lead session: the feet-to-metres constant comes from `src/site/units.ts`; the identical point-in-polygon and point-to-segment copies live in `src/site/geom2d.ts`; `buildRoof`'s unreachable branch is gone (R11.3, part of R11.7); the `window.islandale` probes are on the dev server only, or in a build made with `VITE_ISLANDALE_PROBES=1` (R11.2); CI runs the typecheck and unit tests on every push (R11.1). Lint (`tools/lint/`, `npm run lint:install`, `npm run lint`) is in CI too and exits clean: 0 errors, 221 warnings (220 `any` in `e2e/`, for R11.5, and one hook dependency in `src/scene/useObjectInteraction.ts`). Finley added its two rule options to `eslint.config.js` (`_`-named discards allowed; `any` a warning in `e2e/`), because a config-protection hook stops a Claude session from editing that file. Still open: the four feet-and-inches formatters (Finley picks one), R11.4 (units, a decision), R11.5 (e2e), R11.6 (CSS, after R9), the rest of R11.7 (large files), R11.8 (the plan documents) |
| Decisions 1 to 7 | **Merged Nov 13** | Done by Opus on Finley's answers (recorded under "Decisions Finley needs to make"). This closes R3.4 (a stair of n risers has n − 1 treads), R6.14 (hiding ignores locks and copies are unlocked, on purpose), decision 5 (the dev server skips a save whose plan matches the file), R8.8 (the TSL rule is gone from `CLAUDE.md`), R11.4 (the units rule says what the store keeps), the feet-and-inches formatters (one on screen), and R2.5 as far as it can go without a survey: the line along the water is named as the assessor's lot line, an approximate high-water line (the terrain's 8 ft NAVD88 contour) is drawn and is what "to shore" distances and tree zones measure from, and, on Finley's later instruction, the east top of bank stays 45 ft in from the lot line so every scheme's shoreline verdict is as before. R2.10's unchecked ramp items are now stated in the panel and on the sheet, not built. Also fixed: Ctrl / ⌘+K opens command search from a text field, and the "synchronously unmount a root" console errors. Checked by the lead session: typecheck, unit tests, lint, build; every code-check row of all 12 schemes against main (168 rows: only the stairs rows of D, G and H differ, from R3.4; H's now passes); shore clearances of 253 objects (no buffer flips, no past-buffer changes, 87 east-side "to shore" figures 1 to 12 ft smaller); and in a headless browser the command-search key, the console, the plan file left alone on reopening and on moving the sun, and the new notes on the Site tab. The lead check caught one fault, fixed before the merge: the high-water change had altered the lot-width row of schemes E and F. Not checked by the lead session: the site sheet staying on one page, the branch's own browser tests, the formatter change on screen, where exactly the high-water line is drawn. Found, not fixed: scheme F's lot-width row reads "no buildings yet" because the Shell Boathouse has a corner on or past the lot line |
| Scheme C copy and R11.5's flaky tests | **On `scheme-c-only`, Nov 14** | Finley, Nov 13: only Scheme C matters from now on, and the copy is the line all work happens on until they say otherwise; `main` keeps all 12 schemes and is left alone. Done by Opus: the data holds Scheme C only, the Scheme list and File → Designs are hidden while there is one scheme, no drawing or rule code was deleted, and every test loads Scheme C only (unit tests 2,222 → 2,020; browser tests 121 → 108; `old-designs.spec` deleted; the features left with no test are listed in the copy session's hand-over notes). Checked by the lead session: Scheme C's objects, code-check rows and clearances are byte-identical to `main`. Also on the copy only: the high-water label has its own class and the sheets guard reads the building sheets only, which fix three browser tests that the decisions merge broke (`chips.spec`, `layout.spec`, `sheets.spec`; they still fail on `main`); and the flaky-test fixes for `paint`, `narrow`, `parts` and `beginner` (waits on the view being drawn, not on fixed times; 125 of 125 over five repeats in that session, 26 of 26 in the lead's run). One whole-suite run on the merged branch, machine kept awake: 107 passed, 1 skipped (the old-planner overlay test, which needs a production build), 0 failed, 47 minutes. Long runs on this Mac must be wrapped in `caffeinate`: sleep ruined a six-hour run. Found, not fixed: a saddle roof on the lantern builds a different height than the height check predicts; something overwrote the tracked plan file in the copy session's worktree once (restored, not committed, writer not found) |

**Running them.** R2 to R7 touch different files, so they can run side by side, each in its own worktree and branch off the commit that adds this file. Three at a time is kinder to the machine: first R2, R3, R6; then R4, R5, R7.

**Brief for each agent** (swap in the part):

> Fix part **R2 · Site rules** from `PLAN-REVIEW-FIXES.md` in this repo. Read that part, the "Decisions" and "Working notes" sections, the root `CLAUDE.md`, and the section map it points to; read nothing else you don't need.
>
> - Work on your own branch, `claude/review-r2-site-rules`. Touch only the files that part names, plus their tests.
> - For each numbered finding: write a test that fails for the reason given, then fix it, then see the test pass. Use the default for any decision Finley has not answered; if a finding says to report and not change, do that.
> - Check with `npx tsc -p tsconfig.app.json --noEmit` and `npx vitest run`. Run at most the one Playwright spec nearest your change, and never while editing source. Try things by hand on the `planner-e2e` launch config, never `planner`.
> - Do not edit `PLAN.md` or `PLAN-REVIEW-FIXES.md` (several agents would collide). Put any deliberate change of behaviour in your commit messages and final report instead.
> - Commit small, with messages like `fix(rules): …`. Do not push or merge.
> - Finish with a report: each finding, fixed or not and why; the test that proves it; anything you found that the plan does not list.

**After each part:** a short review of the branch's diff before merging (the larger model is worth it here: it is a small read), then Finley's OK to merge, as for every other phase.

## Working notes for the session

- **Typecheck:** `npx tsc -p tsconfig.app.json --noEmit` (`tsc -p .` checks nothing).
- **Unit tests:** `npx vitest run`, or one folder: `npx vitest run src/site`.
- **Browser tests:** `npx playwright test e2e/<name>.spec.ts --reporter=line`. They are slow under headless software GL, slower when another session is running Playwright. Never edit source while a run is in progress: the dev server hot-reloads under the test.
- **Trying things by hand:** start the `planner-e2e` launch config (port 5174, plan folder `test-results/plan-home`), not `planner`. The `planner` config autosaves into the tracked plan file.
- **Probing maths:** `window.islandale.store` and the other hooks on `window.islandale` are available in the running app.
- Every fix follows the project rules: undoable, respects locks, real units, noted in `PLAN.md` where behaviour differs from the old planner.

---

## R0 · Baseline

- **R0.1 Heavy tests time out under load (ran).** A full `npx vitest run` failed 5 to 7 tests by the 5 s default timeout on a busy machine; each passes alone in 1.6 to 3.6 s. They are the "every scheme" tests in `src/export/sheets/tables/table.test.ts:74`, `src/export/sheets/tables/MeasureTables.test.ts:35`, `src/export/sheets/model/roofs.test.ts`, `src/export/sheets/model/openings.test.ts`, `src/export/sheets/plan/planDims.test.ts`, `src/interiors/scene3d/wallCrossings.test.ts`, `src/buildings/rails/railSite.test.ts`. Fix: raise `testTimeout` in `vite.config.ts`.

## R1 · Keyboard (done)

- **R1.1 Arrow keys on tabs, toggle groups and sliders moved the selection (ran).** `src/ui/useKeyboardShortcuts.ts`. Fixed with `src/ui/keyOwner.ts` (`keepsKey`).
- **R1.2 Shortcuts acted behind dialogs, undo included (ran).** Same file. Fixed: anything inside a dialog or menu keeps its keys; the overlay guard now comes before undo.
- **R1.3 Escape that closed the More menu or the tour also cleared the selection (traced).** `src/ui/TopBar.tsx`, `src/guide/TourCard.tsx`.
- **R1.4 The old-planner overlay had no modal marker (traced).** `src/ui/LegacyPlanner.tsx`. It still has no focus trap or initial focus; that is R10.
- Left for R10: single-key shortcuts cannot be turned off or remapped.

## R2 · Site rules

All in `src/site/rules/` unless a path says otherwise.

- **R2.1 Only `type === 'house'` is checked (ran).** `ruleOutline.ts:22`, `codeCheckRows.ts:22`. A 30 ft shed on the shoreline passes the shore row and reads "no buildings yet" for height. See decision 3.
- **R2.2 No side-setback row and no "inside the lot" row (ran).** `codeCheck.ts:43-56`. `sideFt` is used only by tints, the inspector and the sheet notes. A cabin 0.07 ft from the lot line passes; a cabin at (60, 60) m, off the lot, reads "all buildings clear".
- **R2.3 Distances are measured from corners only (ran).** `codeCheckRows.ts:25-31` (`inBuffer` uses `pts.some`), `clearances.ts:75-93`. A 40 × 20 ft rectangle at (−17, −3) m, rotation 165°, has every corner 35.24 ft past the bank and a wall at 32.0 ft: it passes a 35 ft buffer. `polyDistance` in the same file is already edge-to-edge; use it for shore and lot line.
- **R2.4 The tree-zone row is always a note (ran)**, even with a building in the no-removal zone.
- **R2.5 The "OHWM" line sits at 6.1 to 8.9 ft NAVD88, median 6.5 ft, below the app's own 8 ft high-water figure (ran; real-world datum suspected).** `src/site/types.ts:24`, `setbacks.ts:16`, `src/site/environment/EnvironmentPanel.tsx:40`. By that figure 1,256 sq ft of the lot is below high water, and setbacks are generous by about 10 ft. The east top of bank is one constant, 45 ft; the terrain could give it per section. `EAST_BANK_LAST_EDGE = 120` is an unexplained ring index. Needs decision 1.
- **R2.6 The sun has no daylight saving (ran).** `src/site/environment/sun.ts:15-17,31` fixes solar noon at 12.3 h all year; the panel shows clock time. June 3:00 pm: the model gives azimuth 246.6°, elevation 49.5°; the real sun is about 230°, 57°. A 20 ft wall's shadow is drawn 17 ft instead of 13 ft. The site sheet's roof shadows inherit it (`src/export/sheets/site/siteObjects.ts:322-331`). No equation of time. See decision 4.
- **R2.7 PASS is printed under code citations with almost no caveat (traced).** `CodeCheckPanel.tsx:41,62`, `src/export/sheets/site/siteNotes.ts:86,162`. The only caveat in the app is "Verify on site." at `SetbacksPanel.tsx:55`. Add a plain note to the panel and the sheet: a planning aid, not a code review.
- **R2.8 The limits have no source (traced).** 35 / 45 / 10 ft and 50 ft strict (`src/store/types.ts:78-86`), 35 ft height (`height.ts:19`), 35 / 110 ft tree zones (`setbacks.ts:18-19`), 50 % / 40 ft lot width (`lotWidth.ts:16-18`), 800 / 1,600 sq ft (`program.ts:13-15`). Name the code section and date beside each, or mark it "assumed". The county text could not be fetched during the review.
- **R2.9 A likely wrong citation (suspected).** `codeCheckRails.ts:17` cites IRC R311.8.3 for "ramps rising more than 6 in need a handrail"; that trigger is ADA 405.8.
- **R2.10 The accessible-route check ignores the surface (ran)** and counts a ramp wing's foot as arrival (suspected). `src/paths/route/routeGraph.ts:32-42`, `src/paths/route/routeVerdict.ts:45-49`. A grass walk can pass under an ADA citation. Not checked at all: ramp landing width, edge protection, passing spaces, door clearance.
- **R2.11 NaN and off-grid inputs pass (ran).** `src/paths/route/routeCheck.ts:113-142`: a walk with `position.x = NaN` passes. `src/site/terrain.ts:34-35` clamps, so a walk 500 m off the grid reads flat and passes.
- **Tests to add:** a building in the side setback, off the lot, a shed in the buffer, a wall (not a corner) nearest the shore, a clock time against a known sun position. `codeCheck.test.ts` currently locks in "Scheme C passes" against the corner-only measure.

## R3 · Stairs and rails

In `src/buildings/`.

- **R3.1 The stair pass covers riser, tread and ramp slope only (ran).** `stairs/stairPlan.ts:163-171`, `parts/partFields.ts:91-101`, `src/site/rules/codeCheckStairs.ts:36-38`. A 30 ft drop gives 52 risers in one flight, `ok: true`, with rails off. Not checked: rise between landings, landings, width, handrail presence, a guard on an open side, ramp rise per run. Either check them or say on the row what it covers.
- **R3.2 Fit to code can leave the stair failing (ran).** `stairs/stairSite.ts:76-84` rounds to 0.001 ft while `stairs/stairs.ts:49` allows 1e-9 m. Scheme A's A-0 mass 4, F-1 mass 2 and G-0 mass 3 still fail after the click (3 of 22). The 4-pass cap (`FIT_PASSES`, line 52) is a second cause: D-0 mass 4 raised 4 ft needs two clicks. Fix: round up, or compare with the same tolerance.
- **R3.3 The "+" chip adds stairs that fail the planner's rule (ran).** `parts/attach.ts:126-128,152-168`: run is `round(drop × 1.6)` clamped to 6 to 14 ft, so drops of 4, 5, 6, 10 and 12 ft all give treads under 11 in. A ramp with a 38 in rise is added as one 39 ft run. As shipped, 22 of 35 stair and ramp wings in the schemes fail.
- **R3.4 One tread too many (traced).** `stairs/stairs.ts:43-50`: n risers need n − 1 treads, but the run must be n × 11 in, so every fitted stair is 11 in too long. `stairs.test.ts:24` asserts it. Decide whether this is a kept legacy rule.
- **R3.5 Two stair rules in one folder (traced).** `decks/deckSteps.ts:5-8,89-91` uses 7.68 in / 11 in and cites IRC for the 11 in tread (IRC's is 10 in). Past 30 risers the rise grows silently.
- **R3.6 "Guard required" includes a 0.15 m slab the app no longer draws (ran).** `rails/railRules.ts:88-94,182-183`, `rails/rails.ts:16`. A deck 24.4 in up reports "2.53 ft up" and needs a guard. Safe side, but the number shown is 6 in off; `rails.test.ts:36` locks it in.
- **R3.7 Drawn rail infill misses the 4 in rule in several styles (arithmetic from constants).** `rails/railStyles.ts:14,26-28,96-110`: wood exactly 4.00 in, steel pickets 3.9 to 4.3 in, cable with a 5.3 in gap under the top rail. `stairs/stairRails.ts:90-91`: the steel stair rail has 10 to 12 in openings. `decks/bridges.ts:197-225,252-261`: open bridge panels.
- **R3.8 Supports look engineered and are not (traced).** 8 ft grid, 6 in posts at any height, with no note. Add one.

## R4 · Building geometry

In `src/buildings/`.

- **R4.1 The Triangle footprint is wound clockwise; every other shape is counter-clockwise (ran).** `footprint.ts:46`. Consequences: `roofs/roof.ts:333-355` shrinks the overhang inside the walls; `openings/openingLayout.ts:247-258,277` points opening normals inward; `decks/deckSteps.ts:51-57` offsets sitting steps into the deck. No scheme uses a triangle. Rewinding changes the edge indices stored cuts and rails use, so check for saved triangles first.
- **R4.2 A hip roof with the ridge across the long side doubles the rise (ran).** `roofs/roof.ts:183,211-216`. 40 × 20 ft at 6:12: ridge x gives 5 ft, ridge z gives 10 ft with 12:12 ends and two zero-area triangles. The height rule reads this rise. Hip, shed, pyramid and flat have no numeric test; `roof.ts` has no test file.
- **R4.3 Fitted roofs fan from the mass origin, not a point inside the outline (ran).** `roofs/fittedRoof.ts:54-56`. A U-shaped outline gets a roof over its courtyard (area ratio 1.27). On non-rectangles "hip" is always a pyramid (line 48) and "gambrel" has no knuckle (line 51).
- **R4.4 Openings on curved and outline walls skip the fit rules (ran).** `openings/openingLayout.ts:230-239`: two openings can overlap by 3 ft with no conflict. Lines 201-205 and 142-155: a 3 ft door on a 1.2 ft wall is placed past the wall end; on a 0.3 ft wall the height comes out −0.2.
- **R4.5 `sculptRiseFt` ignores the roof finish (ran).** `roofs/sculptRoof.ts:60-70`: a sod dome built 5.93 ft high is reported as 5.41 ft to the height check.
- **R4.6 `mitre` divides by zero on a 180° fold between walls of unequal thickness (ran).** `walls/wallShell.ts:115-116`: NaN positions.

## R5 · Interiors

In `src/interiors/`.

- **R5.1 Dragging a wall can overlap rooms (ran).** `edits.ts:199-214` calls `fitRoom(..., [])` with no neighbours; `editor/PlanCanvas.tsx:291-297,381` has no clamp. A 30 × 20 ft cabin ended with 760 sq ft of rooms in 600 sq ft, hidden because `rooms.ts:345` clamps `unassigned` at 0.
- **R5.2 Corner and wall edits keep only the first piece (ran).** `edits.ts:143-170,199-214` (`res.polys[0]`). A bow-tie corner drag turns a 160 sq ft room into a 96 sq ft triangle with no message.
- **R5.3 No direct tests** for `edits.ts`, `rooms.ts` or `envelope.ts`; `geom.test.ts` has 13 cases for 836 lines and no degenerate inputs.
- **R5.4 Small:** "Inside the walls 670 sf" beside "Rooms (8) 671 sf" (seen in the browser); the plan opens small in the editor instead of fitted; labels overlap in small rooms.

## R6 · Fields, undo, saving

- **R6.1 `NumField` has no upper bound (ran).** `src/ui/fields.tsx:55-57`, `src/ui/Inspector.tsx:106-108`. Width accepted 99,999 ft. A rejected value snaps back with no message. Escape does not cancel an edit.
- **R6.2 The feet-and-inches field shows quarter inches but accepts whole inches (ran).** `src/ui/feetInches.ts:33,50`. `3.5"` becomes `4"`; `1/2"` and `5 ft. 6 in.` are rejected; a 400-digit number parses to Infinity; the formatter gives `NaN' NaN"` and `-0"`.
- **R6.3 The inspector's Colour well writes an undo step per shade (traced).** `src/ui/Inspector.tsx:130`. `src/buildings/paint/ExteriorPanel.tsx:220-239` has a commit-once input to reuse.
- **R6.4 `SingleInspector` is not keyed by object id (traced).** `src/ui/Inspector.tsx:44`: a field's error can carry over to the next selection.
- **R6.5 One malformed object makes the whole plan unreadable (traced).** `src/store/persistence.ts:95-112`, `src/store/autosave.ts:176-198`. The set-aside copy (`islandale-plan.unreadable-*`) is never read back anywhere. Fix: skip and report the bad object; add a way to open the set-aside copy.
- **R6.6 `params` is never validated (traced).** `src/store/persistence.ts:107`: any record passes. `type` is any string.
- **R6.7 `id in objects` accepts inherited keys (traced).** `src/store/persistence.ts:84-85`: `order: ["constructor"]` survives.
- **R6.8 Import applies view settings even when the plan was refused, and drops `contours` and `displayOptions` (traced).** `src/export/planFile.ts:29-34`.
- **R6.9 Undo and redo skip the read-only guard (traced).** `src/ui/useKeyboardShortcuts.ts`, `src/ui/TopBar.tsx:116`, `src/layout/commands.ts:100`.
- **R6.10 Selection is not pruned after undo (suspected crash).** `src/store/planStore.ts:209-214,496-500`. `select` also accepts ids that do not exist (seen: `select('C-0')` stored `['C','-','0']`).
- **R6.11 Undo history has no limit (traced).** `src/store/planStore.ts:481-485`.
- **R6.12 Every save rewrites up to 20 full plan texts to IndexedDB, and saves are not serialised (traced).** `src/store/autosave.ts:98-130`.
- **R6.13 The dev plugin's write is not atomic against a second writer (traced).** `vite/planFileStore.ts:52-65`. Also `vite/planFilePlugin.ts:50-57`: an unhandled rejection in the watcher can kill the dev server; an oversized body never gets a 413.
- **R6.14 Locks:** `setHidden` and `setLabelVisible` ignore the layer lock (`src/store/planStore.ts:356-370`); duplicating a locked object gives an unlocked copy (`src/store/toolActions.ts:148-178`). Confirm which are intended.
- **R6.15 Versioning is a stub (traced).** `src/store/persistence.ts:64-69`: no migration steps, unknown fields stripped. Write the first migration before the first schema change.
- See decision 5 for the tracked plan file.

## R7 · Crashes and stuck states

- **R7.1 No error boundary anywhere (traced).** `src/scene/Scene.tsx:42,89-93` (lazy `Effects`), `src/app/App.tsx:23,41-45` (lazy `InteriorEditor`). A failed chunk fetch blanks the page.
- **R7.2 Box select and drag never handle `pointercancel` (traced).** `src/tools/useBoxSelect.tsx:59-77`: listeners leak and orbit stays off. `src/tools/useDragMove.ts:57-63,83`: every key stays swallowed until Escape. `src/scene/DragHandle.tsx:130` already does it right.
- **R7.3 Toasts are the only error channel (traced).** `src/ui/Toast.tsx:4-20`: 2.5 s, no dismiss, and `z-index: 3`, under the interior editor and the sheets.

## R8 · Performance

- **R8.1 The view never idles (traced).** `src/scene/Scene.tsx:67-70`: `frameloop="always"`, dpr up to 2; a 4096² shadow map re-rendered every frame (`src/site/environment/SceneEnvironment.tsx:93-94`); a reflector re-rendering the scene (`:105-122`); N8AO and SMAA on top. Fix: `frameloop="demand"` with invalidation, shadow map on change, reflector on change.
- **R8.2 A drag rebuilds the cabin's walls, openings and foundation every pointer move (traced; measured 2 to 3 ms a step on an M4 Pro).** `src/buildings/BuildingMesh.tsx:55-72` puts `o.position` in the `sites` memo; `src/buildings/walls/WallMass.tsx:62-64` and `src/buildings/foundation/FoundationMesh.tsx:42,88` follow. Fix: key walls on shape only.
- **R8.3 Nothing in the 3D tree is memoized (traced).** `src/scene/Scene.tsx:48`, `src/scene/PlanObjects.tsx:19-28`. `src/scene/ScreenChip.tsx:67` re-emits every chip on every parent render.
- **R8.4 The route report runs three or four times per edit (ran: 10 to 13 ms each; `codeCheck` 55 to 120 ms).** `src/paths/route/RoutePanels.tsx:19-24` has no shared cache, unlike `useEarthworks`.
- **R8.5 712 meshes and 94,000 triangles for 17 objects (ran); every mesh has its own material; interiors always cast shadows.** `src/scene/Surface.tsx`, `src/interiors/scene3d/InteriorMesh.tsx:25-52`.
- **R8.6 First paint is about 2.1 MB raw, 610 kB gzip (ran).** `schemes.json` (199 kB) and `codeCheck` (86 kB) load eagerly.
- **R8.7 Small:** `src/site/TerrainMesh.tsx:30` clones the grass texture and never disposes it; `src/scene/LabelProjector.tsx:21-38` projects labels every frame.
- **R8.8 The "TSL for WebGPU" rule has no code behind it.** No TSL exists; `postprocessing`, `n8ao`, drei `Sky`, `MeshReflectorMaterial`, `Line` and `Edges` are WebGL-only. Decide whether to keep the rule.

## R9 · Interface

Seen in the browser at 1440 × 900 unless noted.

- **R9.1 The top bar is too big.** About 35 controls, the same on every tab: three rows at 1440 px, five at 1024 px (a quarter of the height), and on a phone it leaves about 15 % of the screen for the model. See decision 6.
- **R9.2 Beginner mode opens on a failing ADA panel, the program budget and the code check.** The plan said Beginner hides code checks.
- **R9.3 Labels pile up** in the plan view and at a distance; they do not fade or cull.
- **R9.4 Sheets default to 1/4" = 1'-0", which tiles the Gathering prow's plan over 12 pages.** Default to the largest scale that fits one page. There is no fit-to-screen preview.
- **R9.5 Values wrap in the right panel** ("1,599 / 1,600 sq" then "ft"; "7" then "%").
- **R9.6 The lot line is white on the white model.**
- **R9.7 The tour's first card sits over the buildings; warning chips show in Present's tab and in Beginner.**
- **R9.8 "Entry at the west notch" opens behind a tree trunk and grey box cars.**
- **R9.9 Shortcut hints are Mac-only** (`src/ui/TopBar.tsx:115,120,222`).

## R10 · Accessibility

- **R10.1 No keyboard way to select, place or move an object (traced).** `src/scene/LabelLayer.tsx:24-34`; the layers panel lists layers, not objects; no "select …" command.
- **R10.2 Multi-select needs Shift (traced)**, so it is unreachable on touch. `src/tools/useBoxSelect.tsx:53`, `src/scene/useObjectInteraction.ts:54`.
- **R10.3 Contrast failures (computed).** White on accent 2.31:1 (`src/app/styles.css:706,179`); control borders 1.30 to 1.44:1; a hidden layer's eye button 2.1 to 2.8:1 (`:108`); measure label 4.10:1 (`:401`); field error text at 10 px (`:143`).
- **R10.4 Hand-rolled menus (traced).** `src/ui/HistoryMenu.tsx:56-77`: no arrow keys, Escape or outside click. `src/ui/TopBar.tsx:140-220`: More's content sits before its toggle. Task tabs have no tabpanel.
- **R10.5 Single-key shortcuts cannot be turned off or remapped** (WCAG 2.1.4).
- **R10.6 The old-planner overlay has no focus trap or initial focus** (`src/ui/LegacyPlanner.tsx`).
- **R10.7 After the confirm dialog closes, focus goes to the page, not back to the button** (seen in the browser).

## R11 · Housekeeping

- **R11.1 No CI and no linter.** `playwright.config.ts` has `retries: process.env.CI ? 2 : 0` that never applies; `src/guide/TourCard.tsx:64` disables a lint rule for a linter that is not installed.
- **R11.2 Test hooks ship in production.** `src/main.tsx:32`, `src/scene/CameraRig.tsx:64-225`. Gate on `import.meta.env.DEV` plus a test flag.
- **R11.3 Duplicated helpers.** `const FT = 0.3048` in about 60 files (`src/site/units.ts` exports it); 9 point-in-polygon functions; 6 point-to-segment; 3 polygon offsets (`roofs/roof.ts:333`, `outline.ts:9`, `organic.ts:265`); 4 feet-and-inches formatters with different rounding.
- **R11.4 Units.** Sizes are stored in feet and positions in metres in an untyped `params` bag; `CLAUDE.md` says metres internally. Either type `params` per object type or correct the rule.
- **R11.5 e2e.** 91 tests, one worker, 20 fixed sleeps, 64 direct store calls. No test of Import, touch, or any keyboard-only flow.
- **R11.6 CSS.** One 710-line file organised by build phase; `:root` four times; 17 z-index values with no scale; about 40 raw hex colours.
- **R11.7 Oversized units.** `roofs/sculptRoof.ts` (854 lines), `interiors/geom.ts` (836), `PlanCanvas` (one 380-line component), `buildRoof` (113 lines with an unreachable branch at `roof.ts:217-225`).
- **R11.8 Docs.** Thirteen `PLAN*.md` files, 3,300 lines, at the repo root.

## Not reviewed

The whole Playwright suite was not run. Frame rate was not measured (the preview pane throttles it). `tools/blender/` and the Unreal handoff were out of scope. The county code text and the NOAA datum could not be fetched.
