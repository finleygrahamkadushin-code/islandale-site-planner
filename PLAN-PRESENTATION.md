# Presentation prep

Nov 12, 2026; updated Fri Nov 13 against what the other sessions are finishing. Finley wants everything ready by **Sun Nov 15, Mon Nov 16 at the latest**, showing a **live planner demo**, an **Unreal walkthrough** and **slides**, and chose to **push for Unreal** (6F and 6G) before the day.

That's about three working days, and 6F and 6G are the two biggest parts left. So the plan keeps a fallback for the Unreal walkthrough ready at every step, and has hard freeze times.

**Who does what:** the Claude review sessions finish the app; **Codex takes the Unreal track** (6F, then 6G), from [HANDOFF-codex-presentation.md](HANDOFF-codex-presentation.md). The two don't share files: Codex works in `tools/blender/` and `tools/unreal/`, and the Claude sessions in `src/`, `e2e/` and the plan documents.

## What other sessions will finish (checked Fri Nov 13, about 9:45 am)

| Session | State | Will deliver | Then |
|---|---|---|---|
| **Islander planner review** (the review lead) | Idle, waiting on the two below | Checks each branch, asks Finley's OK, merges, records it in `PLAN-REVIEW-FIXES.md` | Merges land in `main` Fri |
| **Review fixes: decisions 2 to 7** | Last browser run (21 tests) under way, about 30 min left | 12 commits: decision 5 (the dev server no longer rewrites the plan file for view changes), one feet-and-inches formatter (R11), the units rule (R11.4), R3.4 (one tread fewer), R6.14 lock tests, Cmd+K from a text field, the React "synchronous unmount" error fixed, the "not an OHWM" wording (decision 1), the R2.10 route-check note, and item 11: the buffer measured from the 8 ft high-water line | **Watch item 11:** the Gathering building in A, B, C, C2–C4, G, H and I now falls inside the 35 ft buffer. That changes what the code check shows in the demo |
| **Steady the flaky browser tests** | Full run with fixes under way | 6 test-only commits: waits instead of sleeps for old designs, tour, paint, parts rails, narrow tablet | A browser suite you can trust before freezing |
| Review fixes R10 | **Merged Nov 12** | | Archive |
| Review fixes R11 | Idle, one lint commit left | | The lead merges it with the decisions branch |
| R2–R9, 6A–6B, 6H, 5E draft, house textures, running the project, 4C, project cleanup | Idle, merged | | Archive (item 6) |
| **6E bake** (`max-height-county-code-e8e9f9`) | Idle, merged | | Bake copied out Fri; safe to archive (item 6) |
| YouTube study, Islandale upgrade, stair fixes, rebuild | Idle, in the root checkout | | Leave the folder alone |

## Where things stand

| Item | State |
|---|---|
| Review fixes R0–R10 | Merged into `main` (`a958c28`) |
| Decisions 1–7, most of R11, flaky tests | Finishing today in the sessions above |
| 6A–6E, 6H | Merged |
| **6E texture bake output** | 28 sets, 2.5 GB, copied Fri to the root checkout's `build/3d/unreal/textures/` (`build/` isn't in git). Hours to redo |
| 6F Unreal export, 6G Unreal import | **Not started.** For Codex. UE 5.8 at `/Users/Shared/Epic Games/UE_5.8`, Blender 5.2.2, Xcode Metal toolchain installed |
| 6K K2 / K3a interiors | On branches, never signed off (only K1 was) |
| Build from scratch (library) | `claude/library-from-scratch`, built **on top of** K2 and K3a, so merging it also merges them (45 files) |
| Hosted home | Version 13 = `main` at d5d52bb (Nov 9). Missing everything since |
| Disk | 43 GB free; 27 worktrees use 11 GB |

## Tidy-up list

Nothing here gets merged, deleted or pushed without Finley's OK, as usual.

1. **OK the review lead's merges today:** the decisions branch (with R11's last commit) and the flaky-test branch. Look at item 11's buffer change in the planner first, because it changes what the demo shows.
2. **Decide on Build from scratch + K2/K3a.** Recommended: leave it until after the presentation. It's 45 files on top of two unsigned interior parts, and nobody is free to review it this week. Merge it only if Finley wants to demo it and the lead has time Saturday morning.
3. **Fix only what shows up in the demo path.** Still open from R9: warning chips overlap labels and each other; the dark theme's white-model lot line hasn't been checked. Fix them only if the demo passes through them. Give it to the review lead after its merges.
4. ~~Stop the plan file churning~~: done by the decisions session (decision 5).
5. **Republish the hosted home** (version 14) from a clean worktree of the frozen `main`: `npm run build`, `scripts/checkBundle.mjs`, `scripts/hosted-build-check.mjs`, then publish. A Claude session does this (the publish uses Claude's Artifact tool).
6. **Clean up sessions, worktrees and branches.** The 6E bake is now copied out to the root checkout's `build/3d/unreal/textures/` (done Fri Nov 13: 28 sets, 2.5 GB, gitignored), where Codex's 6F reads it. Then archive the merged idle sessions (archiving removes their worktrees), list leftover worktrees and branches, and remove them on Finley's OK. Leave the lead, the decisions and flaky-test sessions until their merges land.
7. **Tag the presentation build:** `presentation-2026-11` on the frozen `main`, pushed.

## Unreal: the push and its fallback

- **6F · scene export** (`tools/blender/export_unreal.py`): one `.glb` per group plus `scene.json`, UV0 = metres / 6, and the welded lantern-corner fix. Done when the files open in UE 5.8 with north and ground contact right.
- **6G · import** (`tools/unreal/import_islandale.py`): master materials and instances, Nanite meshes, a level with sky, sun, fog and the saved cameras. Done when there's a screenshot from each camera.
- **Fallback A** (if 6G isn't producing a level by **Sat 8 pm**): import 6F's `.glb` files into UE by hand (drag in, one directional light, sky atmosphere, a camera path). Not scripted, but it walks.
- **Fallback B** (if 6F also slips): Blender renders (6A–6D, signed off) plus a recorded Present-mode fly-through from the planner.
- **Shaders:** UE compiles Metal shaders the first time a project opens, which can take a long time. Open the finished project at least once **the day before** and leave it open.
- **Backup video:** record the walkthrough on Sunday. If UE stalls on the day, play the video.

## Schedule

Numbers in the tidy-up column are the tidy-up list above.

| When | Unreal track (Codex: 6F → 6G) | Tidy-up (Claude sessions) | App and slides | Finley's checkpoints |
|---|---|---|---|---|
| **Fri Nov 13, morning** | Codex starts from the handoff and writes the 6F plan (check-in A) | **6** archive merged sessions (the 6E bake is already copied out); the decisions and flaky-test runs finish | — | Start Codex; OK 6F's plan |
| **Fri afternoon and night** | 6F coded; check-in B: the `.glb` files open in UE with north and ground right. Codex starts 6G only after Finley signs off 6F | **1** OK the lead's two merges; **2** decide (default: leave) | Slides outline; demo script draft. **3** chip fixes to the lead | Look at 6F in UE; OK merges; check item 11's buffer change |
| **Sat Nov 14** | 6G: materials, level, cameras. Check-in B by 6 pm: a screenshot per camera | **3** last demo-path fixes. **App freeze at 8 pm** | Slides draft | **8 pm: Unreal go, or fallback A** |
| **Sun Nov 15** | **Unreal freeze at noon.** Merge 6F and 6G. Open the project once (shaders); record the backup walkthrough | Full e2e from a clean worktree; **5** republish the hosted home; **7** tag `presentation-2026-11`; remove 6F/6G worktrees once merged | Slides done; first run-through | Merge, push, republish OKs; first run-through |
| **Mon Nov 16** | Nothing new | Buffer only: rehearse, fix typos in the slides | Rehearse twice |

## Demo-day kit

- [ ] Hosted home link, opened and signed in on the presenting laptop
- [ ] Offline fallback: `npm run build && npx vite preview` from the tagged build, in case the wifi fails
- [ ] The plan file (`islandale.plan.json`) downloaded, in case the hosted database is reset
- [ ] A demo script: which scheme, which saved views, which tools, in what order (5–7 steps, practised)
- [ ] The UE project opened in the last day, shaders compiled, the level saved on its first camera
- [ ] Backup videos: the planner demo and the Unreal walkthrough
- [ ] Slides with stills from all three (planner, renders, Unreal), so the talk works even if nothing live does
- [ ] Laptop: charger, Do Not Disturb on, other apps closed, display mirroring tested

## Running sessions unattended

Blender and Unreal run only on this Mac, so cloud sessions can't do 6F or 6G. They can draft slides and do doc work.

- **The lid:** a closed MacBook sleeps, and sleeping pauses every local session. To keep work going overnight, leave it **open and plugged in** (the app's keep-awake setting stops idle sleep), or closed only with power, an external display and a keyboard connected (clamshell mode).
- **Check-ins:** an unattended session can plan, code, test and push its own branch. It stops at check-ins B and C (sign-off, merge) and sends a notification. Merges into `main`, pushes of `main` and republishing still wait for Finley.
- **Faster pace (Finley's choice):** to fit three days, Finley can OK the 6F and 6G plans up front from their briefs above, so the Unreal session only stops for B (look) and C (merge).
