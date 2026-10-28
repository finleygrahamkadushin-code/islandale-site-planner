# Phase 3C plan: keep the work, fit the openings, one home for the plan

Status: **Built, all steps (Oct 27 2026).** The hosted home is https://claude.ai/artifact/HpHkXNcd2ZWnp2UVdvPc3m.

**Built:** steps 1-12 and 14, with the tests listed below. The old planner artifact was republished twice (versions 35 and 36). `scripts/legacy-openings-check.mjs` passes for Scheme C and C2-C4, and so does the matching unit test for the new app.

**Hosted home (steps 13, 15-17):**
- **Step 13.** Claude Code's ArtifactData wrote the row, and an open copy of the page loaded the write and saved it back (row version 2 became 3). Claude chat uses the same artifact database tools, but this was not tried from a chat.
- **Step 15.** One row instead of one per object; see PLAN.md, "Deliberate changes".
- **Step 16.** Pull and push are ArtifactData steps that Claude Code runs (see PLAN.md, "Editing the plan from Claude"), not a script: a script cannot call ArtifactData. The "N saves behind" notice is not built.
- **Step 17.** Automatic import is not possible across sites. The localhost plan came in through the repo file; the old artifact's layout comes in by copying and pasting.

- **Review.** A review workflow (four areas, each finding checked by two skeptics) found the old planner's block writing over the row without checking it, and the new app able to mistake its own save for an outside edit. Both are fixed, with tests: `src/store/artifactHome.test.ts`, new cases in `src/store/autosave.test.ts`, and `scripts/legacy-hosted-check.mjs` (10 checks). Many verifiers did not finish because of a usage limit; every finding was read and the real ones fixed.
- **Old planner in the hosted home.** Opened as its own page, `legacy.html` got no claude.ai runtime: Finley opened it on Oct 28 and no `legacy/layout` row appeared. It now opens in a frame over the new planner and borrows the main page's runtime. `scripts/hosted-build-check.mjs` checks this against the build (5 checks); the live check is still to be repeated.

**Not yet:** three old-planner details (frames on curved walls, doors starting at the slab top in 3D, merging overlapping holes as a safety net).

**Deviations:** the leave-page prompt shows only when a save has failed, since the closing copy covers a pending save. A History entry made on opening is never merged into, so a bad edit straight after opening can be undone. The corner rule uses the next wall's thickness alone (0.66 ft ÷ sin), not thickness plus trim, so a square corner needs 0.75 ft plus trim, as the tests ask. Step 14 came before steps 9-12, because it is the part that gives Claude Code a way in.

Earlier status: **in progress (started Oct 27 2026).** Finley approved Phase 3B and said "ok start" to option C with yes to questions 2 and 3. The other questions use the defaults below until he says otherwise.

**Answers in force:**

1. Home: **C**, the repo file first (step 14), then the hosted artifact database (steps 13, 15-17).
2. The old planner may be edited through appended `ext:` blocks only. CLAUDE.md now says so.
3. The Openings panel is pulled forward from Phase 5.
4. Default: the old planner joins the hosted home as `legacy.html` and keeps its own autosave too.
5. Default: both old copies come in as History versions; nothing is overwritten.
6. Default: 3.5 in trim, 4 in gap, 0.75 ft corner clearance, 1 in snap. Trim sits proud of the wall, inside the corner clearance, so it never reaches the next wall.
7. Default: saved schemes are warned with **Fit all**, not changed on load.
8. Default: nobody else edits the home.
9. Default: the repo is not pushed anywhere until Finley asks.

Branch: `phase-3c-safe-work`, branched from `phase-3b-fidelity` once 3B is merged or approved.

## Why this phase

Finley has lost work more than once. The planners have three problems that need fixing before Phase 4 builds tools on top of them.

**1. Saving is not safe in either planner.**

- The old planner saves only when **Save in browser** is clicked (`legacy/islandale-planner.html:2111`, button at `:726`). It has no timer and no save on close.
- The Walls editor keeps its own undo stack (`wlUndo`, `:8522-8524`). That stack is wiped every time the editor reopens, and the main undo never sees those edits.
- The new app autosaves to IndexedDB 400 ms after a change (`src/store/autosave.ts:4`, `:31-36`), but it can still lose work in three ways:
  - Nothing is written when the tab is closed or hidden. The stop function cancels the pending save instead of running it (`autosave.ts:68-72`).
  - If the saved plan cannot be read, the app starts from Scheme C. The next change then overwrites the unreadable save (`autosave.ts:59-64`).
  - There is one key, no history, and no guard against two tabs (`src/store/persistence.ts:158-160`).

**2. Openings overlap the building and look bad in both planners.**

- **Old planner:**
  - Openings may sit 0.2 ft from a corner, but the next wall fills the first 0.66 ft (`:8566` against `t=0.2` at `:1282`).
  - Nothing stops two openings on the same wall from overlapping (`:8498`).
  - Doors start inside the 0.15 m floor slab (`:1282`, `:8504`).
  - The editor and the 3D code clamp to different limits.
  - Openings are never re-fitted after a wall is resized or reshaped.
  - Only five fields can be edited, all in 0.5 ft steps (`:366-370`, `:8566`).
- **New app:**
  - Walls are zero-thickness quads (`src/buildings/walls.ts:21-26`). Openings are glass planes plus frame bars standing up to 11 cm proud of the wall (`src/scene/OpeningMesh.tsx:6-8`, `:17`).
  - Placement only clamps an opening to its own edge, with no corner clearance and no overlap check (`src/buildings/openings.ts:62-67`).
  - The frame corners are ragged and the sill floats (`OpeningMesh.tsx:41-48`).
  - The inspector has no opening controls at all (`src/ui/Inspector.tsx:37-67`).

**3. The plan has no single home.** The old planner's copy lives in one artifact URL's localStorage (`'islandale-layout'`). The new app's copy lives in one Mac's IndexedDB at `localhost:5173` (`'islandale-plan'`). Neither Claude Code nor Claude chat can reach either copy, and the repo has no git remote.

**Done when:**

- **No lost work.** In both planners, an edit made just before the tab is closed, reloaded or crashes is there when the plan reopens. The last 20 saves can be restored from a menu.
- **Openings fit.** In both planners, every opening keeps clear of corners, never overlaps another opening, never runs into the slab or the eave, and can be set to the inch from a proper editor, with undo and locks. The opening check list (below) passes for Scheme C and C2–C4 in both planners.
- **One home.** The plan lives in one named place. Claude Code can edit it, and an edit made there shows up in the planner without a manual copy and paste. If Finley picks the hosted option (open question 1), Claude chat can edit it too, and so can either planner on any device.

## What you will be able to do at the end

**Saving**

- Stop thinking about saving. Both planners save on every change and again when the tab closes or goes to the background.
- See a save status ("Saved 2 s ago", "Saving…", "Not saved: <reason>") in both planners.
- Open **History** and restore any of the last 20 saves, each shown with its time and a short summary ("moved Gathering prow").
- Get a warning, not silent overwriting, when the same plan is open in a second tab. The second tab opens read-only.

**Openings**

- Pick a wall and see a list of its openings. Edit kind (window, slider, door, cut-out), width, height, sill, head height, from-left and from-right in feet and inches ("2' 9\"", "33in" or "2.75").
- Centre an opening on its wall, line up its head with another opening, and duplicate or delete it, all undoable.
- Set an optional trim (casing) width and the number of mullions.
- See an opening that was moved to fit, with the reason ("moved 6 in to clear the corner"). Overlapping openings are outlined in red.

**The home**

- Ask Claude Code, or Claude chat if hosted, to "make the south window on the prow 8 ft wide" and see the change in the planner.

## Not in this phase

- **Real cut-through walls in the new app** (thick walls with holes, manifold-3d). These stay in Phase 4, Track 3. This phase makes openings fit cleanly on the current walls.
- **Shared-wall rules**: openings on walls a wing covers, the porch beam across a slider head, and threshold plates on glass walls. The new app hides openings on buried edges. The old planner only warns. The full fix comes with real walls in Phase 4.
- **Arched or non-rectangular openings.**
- **Named plans and a home screen** (PLAN.md, "Later"). There is still one Islandale plan.
- **Sharing with a teacher or classmates.** The home is private to Finley until he says otherwise.
- **A full two-way converter between the old layout format and PlanFile.** See Design decisions.

## Steps

### Part 1: never lose work (both planners)

1. **Harden the new app's autosave.**
   - Flush the pending save on `visibilitychange` (when the tab becomes hidden) and on `pagehide`.
   - IndexedDB writes are async, so `pagehide` also writes a synchronous copy to localStorage under `islandale-plan.shadow`. On load, the newer of the two copies wins.
   - The stop function in `src/store/autosave.ts` saves instead of cancelling.
   - Show "Not saved" in `TopBar.tsx` and add a `beforeunload` prompt only while a save is pending or has failed.
2. **Never overwrite a save that could not be read.**
   - In `autosave.ts`, when `loadFromBrowser` fails, copy the raw value to `islandale-plan.unreadable-<timestamp>` before autosave resumes. Show a toast that names it.
   - In `src/store/persistence.ts`, replace the strict `version !== 1` check (`:46`) with a `migrate(raw)` step. A file from a newer version opens read-only instead of being rejected and then overwritten.
3. **Save history in the new app.**
   - Add `src/store/history.ts`: a ring of the last 20 saves in IndexedDB under `islandale-plan.history`. A new entry is added at most once a minute, plus on every load.
   - Each entry keeps the time, the PlanFile, and the label of the undo step that triggered it.
   - Add a **History** menu in `TopBar.tsx` with Restore and Download. Restoring is itself one undoable step.
4. **One editor at a time in the new app.** Add `src/store/tabLock.ts`, a BroadcastChannel lock. The first tab holds it. A second tab opens read-only with a "Take over editing" button, which hands the lock across and reloads the other tab's plan.
5. **Autosave in the old planner.** This needs open question 2 answered yes. It is one appended block, `ext:autosave`, at the end of `legacy/islandale-planner.html`, in the file's existing patch style:
   - Wrap `pushUndo` so every change schedules a `localStorage.setItem('islandale-layout', serialize())` 400 ms later. Also write on `pagehide` and `visibilitychange`.
   - Keep the last 10 layouts in `islandale-layout.history`. Add a **History** list next to Save, and rename the Save button **Save now**.
   - Make the Walls editor's first change in each session call the main `pushUndo` (`:8523`), so Walls edits are in the global undo and get autosaved.
   - Republish the artifact afterwards.

### Part 2: openings that fit (both planners)

6. **One set of fit rules, written once.**
   - Add `src/buildings/openingLayout.ts`, pure and tested. It returns the wall faces of each mass and the openings placed on each face. Every change it makes is reported as `{id, field, wanted, got, reason}`.
   - The rules, in feet:
     - **Corner clearance:** the outer frame stays at least max(0.75, (wall thickness + trim) / sin(corner angle)) from each end.
     - **Head:** sill + h ≤ the lowest roof line over the opening's span minus 0.5. Use the fitted roof's height function from `src/buildings/fittedRoof.ts`, including the prow dip.
     - **Floor:** door and slider sills are at least the slab top. The UI shows that as sill 0.
     - **No overlap:** the gap between outer frames is at least 0.33. The later opening slides along if there is room, then shrinks, and is otherwise marked as a conflict.
     - **Buried edges:** an opening on an edge that is inside or flush against another mass is marked hidden.
   - The same numbers go into PLAN.md so the old planner uses identical limits.
7. **Fix the new app's opening data handling** in `src/buildings/openings.ts`:
   - Treat sill 0 as valid (`c.sill ?? default`, not `||`, `:48`).
   - Keep `id` on every cut and keep `cutout` as its own kind (`:95-97`).
   - Stop splitting along-cuts into separately framed pieces at every vertex (`:51-59`). One along-cut is one opening with one frame. Where it crosses a sharp corner, it gets one jamb at that corner, not two.
   - Report dropped cuts (edge index past the outline, `:63`) instead of skipping them silently.
   - In `src/scene/WallMass.tsx:30-31`, key openings by id, not by index.
8. **Redraw the new app's openings flush and clean.**
   - In `src/scene/OpeningMesh.tsx`:
     - Make the frame a mitred ring laid on the wall face, so the corners close and nothing overhangs the jambs.
     - Put the sill under the frame with no gap.
     - Add mullions from the `mullV`/`mullH` counts.
     - Set the glass back inside the frame.
     - Add `polygonOffset` on the frame and glass so nothing z-fights at site distance. The door lite moves 2 cm off the panel, not 5 mm.
   - Frames are drawn only inside the clearance from step 6, so they can no longer reach the next wall or the eave.
9. **Opening store actions in the new app.**
   - In `src/store/planStore.ts`, built on `edit()` so each one is one undo step and is refused on locked objects and layers: `addOpening`, `updateOpening`, `removeOpening`, `duplicateOpening`, `centreOpening` and `alignHeads`.
   - Each one writes `params.cuts` or `params.wings[i].cuts` immutably, without touching the wing's other fields. New cuts get `max(id)+1`.
   - When a building's size, shape or edge count changes, the same step re-fits its openings and shows a toast ("2 openings fitted").
10. **Openings panel in the new app.**
    - Add `src/ui/OpeningsPanel.tsx`, a collapsible group in `Inspector.tsx` with:
      - a wall picker (Main or Wing n, then front, back, left, right or edge n, named as legacy `wallLabel` does, `:8489`);
      - one row per opening: kind, width, height, sill, head, from-left and from-right (linked), trim and mullions, plus Centre, Duplicate and Delete;
      - a small SVG elevation of the wall below the rows, with conflicts in red and the fit notes from step 6.
    - Fields use a shared `src/ui/FeetInchesField.tsx` and commit on blur.
    - Selecting a row highlights that opening in 3D. Everything is disabled when the object is locked.
    - This pulls part of Phase 5's walls editor forward (see open question 3).
11. **Fit openings in the old planner.** This also needs open question 2 answered yes. It is one appended block, `ext:openings-fit`:
    - Replace the body of `wlClamp` (`:8566`) with `fitCut(c, e, m)`, using the same rules as step 6:
      - corner clearance from the neighbouring edges in `wallEdges`;
      - head at most `m.h` minus 0.5 ft;
      - door sills at least the slab top;
      - no overlap, with drags stopping at the neighbouring opening;
      - a 1 in snap instead of 0.5 ft.
    - Run `fitCut` over every cut when the Walls editor opens and after any change to a building's w, d or shape (wrap `rebuildObject`). Once the stored numbers are always valid, the eight copied metre clamps (`:8498`, `:9096`, `:9367`, `:10230`, `:12494`, `:13016`, `:13865`, `:14136`) stay untouched and stay in line.
    - In `wallMeshes` (`:8498`), merge any holes that still overlap before building the shape, as a safety net.
    - When a mass is no longer curved, convert its along-cuts back to per-edge cuts in `openWalls` (`:8522`).
12. **Better fields and a frame in the old planner.** In the same block:
    - The fields at `:366-370` accept feet and inches. Add Head height and From-right fields, plus Centre and Align heads buttons.
    - Fix the From-left flip bug on mirrored curved walls (`:8562`, `:8579`).
    - Draw a frame inside the hole in `wallMeshes` (`:8504`) and `curvedWallMesh` (`:1447-1448`): jambs, head, sill and mullions, with the glass at the reveal.
    - Add the optional fields `trim`, `reveal`, `mullV` and `mullH`. Their defaults reproduce today's look.
    - Show an "opening behind a wing" warning in the Walls stats when `edgeFree` is false.
    - Republish the artifact.

### Part 3: one home for the plan

13. **Check what Claude chat can do.** Before building anything that depends on it, confirm with a throwaway artifact that Claude chat on claude.ai can read and write an artifact's database rows, as `ArtifactData` does in Claude Code. Write the answer into this file. If chat cannot, the hosted home still works for both planners and Claude Code, and chat gets read-only access through a pasted export.
14. **The repo file and its endpoint.** This works with every home option.
    - Add `data/plans/islandale.plan.json` (PlanFile).
    - Add a dev-only Vite plugin, `vite/planFilePlugin.ts`, with `apply: 'serve'`, wired in `vite.config.ts`. It serves `GET` and `PUT /__plan`.
    - A PUT writes to a temp file and renames it into place. It copies the previous version to `data/plans/.history/<timestamp>.json` and keeps the last 50.
    - Each PUT carries the revision it was based on (`If-Match`). A stale tab gets a 409 and a "the plan changed elsewhere, reload?" prompt.
    - Vite watches the file, so an edit Claude Code makes to it reloads into the open app.
    - Autosave writes to IndexedDB first, then the file.
    - Add `npm run plan:commit` for a git commit of the plan file.
    - On first run, if the file does not exist, seed it from IndexedDB `'islandale-plan'`.
15. **The hosted home.** Only if Finley picks option C or B in open question 1.
    - Publish one artifact, "Islandale planner", with capabilities `{db, user}`. It holds the new app's `dist/` as `index.html` and the old planner as `legacy.html`, so both share one database.
    - Rows:
      - `plans/islandale` holds meta, `rev` and `savedAt`;
      - `plans/islandale/objects/<id>` holds one row per object, each well under the 256 KiB limit;
      - `plans/islandale/legacyLayout` holds the old planner's layout as it serializes;
      - `plans/islandale/versions/<ts>` holds at most one row a minute, pruned to 50.
    - Add `src/store/homeAdapter.ts` behind `saveToBrowser`/`loadFromBrowser`. It uses `claude.use('db')` when present and falls back to IndexedDB, then the dev file. It listens with `onSnapshot`, so edits from Claude show up live.
    - Every write checks `rev`, and a mismatch prompts instead of overwriting.
    - The old planner's `ext:autosave` block also writes its row when `db` is present.
16. **Keep the repo file and the hosted home in step.** Add `scripts/plan-sync.mjs` with `npm run plan:pull` and `npm run plan:push`. Claude Code runs them through `ArtifactData`. A push refuses when the database `rev` is not the one the file last pulled. TopBar shows "Repo copy is N saves behind" when they differ.
17. **Import the old copies once.** On first open of the home, look for localStorage `'islandale-layout'` (the old artifact) and IndexedDB `'islandale-plan'` (localhost). Offer to bring each one in as a version in History. Never upload over rows that already exist without asking.
18. **Check and commit.**
    - Run the opening check list in both planners for Scheme C and C2–C4.
    - Run the lost-work drills: close the tab within 400 ms of an edit; corrupt the save; open two tabs; edit the repo file while the app is open.
    - Send screenshots of the Walls editor and the Openings panel side by side.
    - Commit after each step that leaves the app runnable.

## Design decisions (say if you disagree)

- **Every planner writes locally first, then to the home.** IndexedDB (new app) or localStorage (old planner) is the crash buffer. The home is never the only copy of a change that has not been confirmed.
- **Fit when you edit, warn when you load.** An edit stores the fitted numbers, so what is drawn always matches the data, and the fit note says what changed. A saved scheme that breaks the rules is not changed when it loads. Its openings show a warning and a **Fit all** button. The new-app investigator suggested never rewriting stored numbers. I disagree for edits, because then the drawing and the data drift apart, as they do in the old planner today.
- **One set of rules for both planners.** The fit numbers are written once in PLAN.md and used by `openingLayout.ts` and `fitCut`. Default trim is 3.5 in, the minimum gap is 4 in, corner clearance is at least 0.75 ft, the head stays 0.5 ft below the roof line, and the snap is 1 in.
- **Opening fields are shared between the planners.** These are `id`, `kind`, `edge`, `x`, `w`, `h`, `sill`, `along`, `trim`, `reveal`, `mullV` and `mullH`, all in decimal feet. Head and from-right are worked out, not stored. A scheme's openings mean the same thing in both planners.
- **No full two-way format converter in this phase.** The home holds the new PlanFile and the old planner's layout as separate rows under one plan. Both rows are editable by Claude. The existing one-way import (`src/store/fromLegacy.ts`) brings old layouts into the new app. A converter back the other way is lossy, because the old `serialize` keeps only named fields (`:1868`, `:8346`, `:1103`), and it is not needed for "one home".
- **The old planner is changed only by appended blocks** (`ext:autosave`, `ext:openings-fit`), recorded in PLAN.md, never by edits scattered through the file. This only applies if Finley lifts the read-only rule.
- **No real holes yet in the new app.** Flush, mitred frames inside a fitted layout fix the overlap now. Thick walls with holes stay in Phase 4, Track 3, and reuse `openingLayout.ts` unchanged.
- **Hidden, not deleted.** Openings on buried edges are hidden in the new app and listed in the panel as "behind Wing 2", so nothing is lost.

## Tests to write first

- `autosave`:
  - a change followed by `pagehide` within 400 ms is saved, in both IndexedDB and the shadow copy;
  - the stop function saves a pending change;
  - an unreadable save is copied to `islandale-plan.unreadable-*` and is never overwritten;
  - a v2 file opens read-only.
- `history`: 25 saves keep the newest 20, at most one a minute. Restoring is one undo step.
- `tabLock`: a second tab is read-only, and "Take over" moves the lock.
- `openingLayout`:
  - a window 0.2 ft from a square corner moves to 0.75 ft plus trim, and a 45° corner needs more;
  - two overlapping windows end at least 4 in apart, or are marked as a conflict when the wall is too short;
  - a door sill of 0 sits at the slab top;
  - the head stays 0.5 ft under the prow dip;
  - an opening on a buried wing edge is hidden;
  - sill 0 on a window stays 0;
  - `cutout` stays `cutout`;
  - one along-cut gives one opening.
- Store actions: `updateOpening` on a wing cut leaves the wing's other fields unchanged; every action is refused on a locked object; resizing a cabin re-fits its openings in the same undo step.
- `FeetInchesField` parsing: `2' 9"`, `33in`, `2.75` and `2'` all give the right feet. Bad text is rejected with a message.
- `planFilePlugin`: a PUT is atomic (a killed write leaves the old file whole); a stale `If-Match` gets 409; history is pruned to 50.
- `plan-sync`: a push with a stale `rev` is refused.
- Playwright (`e2e/safe-work.spec.ts`): edit and close the tab immediately, then reopen and find the edit; add a window in the Openings panel, resize it, undo, and see a locked cabin refuse the change; edit `data/plans/islandale.plan.json` on disk and see the app update.
- Old planner: a scripted check in `scripts/legacy-openings-check.mjs`, run through Playwright against `legacy/islandale-planner.html`. After `fitCut`, Scheme C has no overlapping cuts, no cut nearer than 0.75 ft to a corner, and no door sill below the slab. A change made with no Save click survives a reload.

## Open questions for Finley

1. **Which home?**
   - **(A)** A repo file only. Claude Code can edit it and git keeps history, but Claude chat and the hosted old planner cannot reach it, and it saves only while `npm run dev` is running.
   - **(B)** The artifact database only. Both planners, Claude chat and any device can reach it, but there is no git history.
   - **(C, recommended)** The artifact database as the live home, with the repo file kept in step by `plan:pull`/`plan:push`.

   B and C mean publishing the new app on claude.ai as an artifact.
2. **May the old planner now be edited?** CLAUDE.md says not to edit `legacy/islandale-planner.html`. You asked for autosave and better openings "in both the original artifact and this new one", and that needs the two appended blocks in steps 5, 11 and 12, then a republish. If yes, I will change CLAUDE.md to read "edit only through appended `ext:` blocks recorded in PLAN.md". If no, the old planner gets no fixes. The other choice is a patched copy, `legacy/islandale-planner-patched.html`, published to the same artifact URL while the original stays untouched.
3. **Pull the openings editor forward?** PLAN-PHASE4.md:38 says openings are a read-only list until Phase 5. This phase builds the editable Openings panel now. Is that OK?
4. **Should the old planner share the hosted home** by being served as `legacy.html` inside the new artifact, or stay at its current URL with only its own autosave? Its current URL cannot share a database with the new artifact.
5. **Which saved copy is the real one?** There may be a layout in the old artifact's browser storage and a plan in localhost's IndexedDB. Should both be brought in as History versions, or should you pick one?
6. **Fit numbers:** are 3.5 in trim, a 4 in minimum gap, 0.75 ft corner clearance and a 1 in snap right? Should trim sit proud of the wall (more realistic) or inside the hole (never overlaps)?
7. **Saved schemes that break the rules:** should they be fitted automatically with a toast, or only warned with a **Fit all** button (my default)?
8. **Who else may edit the home** (teacher, classmates)? Nobody until you say.
9. **May the repo be pushed to a private GitHub repo?** It would give an off-machine backup of the plan file's history and read access from Claude chat through a connector.

## Changes I want (Finley fills in)

-

## Brief for Claude Code

```
Read PLAN.md, CLAUDE.md and PLAN-PHASE3C.md. Do not start until Phase 3B
has passed its done-when check and Finley has answered open questions 1-3.
Branch phase-3c-safe-work from phase-3b-fidelity. Follow the steps in order,
tests first for each. Part 1 (steps 1-5) comes first, because it stops
work being lost. Touch legacy/islandale-planner.html only if Finley said
yes to question 2, and then only through the appended ext:autosave and
ext:openings-fit blocks, recorded in PLAN.md under "Deliberate changes
from the legacy file"; republish the artifact after each. Do step 13
before steps 15-16. Show Finley the Walls editor and the Openings panel
side by side after steps 10 and 12, and run the lost-work drills after
step 18. Commit after each step that leaves the app runnable. Stop and
ask before changing any design decision.
```