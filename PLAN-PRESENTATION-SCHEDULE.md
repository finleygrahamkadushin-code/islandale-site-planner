# Presentation schedule: parallel sessions, Unreal included

Written Sat Nov 14, 10:10 am. The presentation is **Sun Nov 15, or Mon Nov 16 at the latest**. Finley chose to **go ahead with Unreal** and to work **as fast as possible**: every session starts on **Sonnet**, and anything that fails moves up to **Opus** or **Fable** by the rules below.

This replaces the timing in `PLAN-PRESENTATION.md` (branch `claude/presentation-prep-plan-f276aa`). Its checklists still apply. The Unreal briefs come from `HANDOFF-codex-presentation.md` on the same branch. Codex never started, so Claude sessions take the Unreal track.

## Where we start (checked 10:05 am)

| Item | State |
|---|---|
| Review fixes, decisions 1–7 | In `main` (`f3596ef`) |
| Scheme C only copy | `claude/scheme-c-only-a74068`, **not merged** |
| Flaky-test fixes | `claude/magical-bassi-56ad84`, **not merged** |
| Prep plan + Codex handoff | `claude/presentation-prep-plan-f276aa`, **not merged** |
| 6E texture bake | Copied to `build/3d/unreal/textures/` in the root checkout (28 sets, 2.5 GB). **Never regenerate or move it** |
| 6F export, 6G import | **Not started**. No `tools/unreal/`, no UE project |
| Hosted home | v13 (Nov 9) |
| Root checkout | `data/plans/islandale.plan.json` has an uncommitted change |

## How the speed-up works

The old plan ran 6F and then 6G one after the other. This schedule splits 6G in two, so most of the Unreal work starts **now**, alongside 6F:

- **6G-1 · materials and project** needs only the 6E bake, which already exists: make the UE project, import the 28 texture sets, build the master materials and one instance per key from `materials.json`, and compile the shaders once. Shader compiling is the slowest single step on a Mac, so it starts first.
- **6G-2 · meshes, level, cameras** needs 6F's `.glb` files and `scene.json`, so it waits for 6F.

The two halves own different files, so they never collide:

| Session | Owns |
|---|---|
| 6F | `tools/blender/export_unreal.py`, `tools/blender/tests/test_export_unreal*.py` |
| 6G-1 | `tools/unreal/import_materials.py`, `tools/unreal/README.md`, the UE project under its worktree's `build/3d/unreal/` |
| 6G-2 | `tools/unreal/import_islandale.py` (it calls 6G-1's script, doesn't edit it) |
| Merge / app lane | `src/`, `e2e/`, `data/`, the plan documents |
| Slides lane | `presentation/` (new), screenshots under `build/` |

**Machine limits.** Everything shares this Mac:
- **Only one Unreal Editor process at a time.** 6G-1 owns UE until 6G-2 takes over, and they hand over by message.
- Blender headless and Vite can run alongside UE.
- Ports: 6F's scene export uses `--port 5199`; the app sessions use 5173–5197.
- **Disk:** 43 GB free, and a UE project can grow to tens of GB. Each Unreal session reports its size at every check-in. Stop and tell Finley if free space drops below 15 GB.
- **Keep the Mac awake** and plugged in, with the lid open, from now until Sunday's freeze. A sleeping Mac pauses every session.

## Model rule: Sonnet first, escalate on failure

Every session starts on **Sonnet**. A session has **failed** when any of these happens:

- the same test or check fails after **two** honest fix attempts;
- it stalls for **45 minutes** without a commit or a check passing;
- its result is wrong at a check-in (Finley looks and says no);
- it's guessing at an API it can't verify (UE 5.8 Python), or going round in circles.

Then the coordinator (this session) decides where it goes:

| The failure is… | Move it to | Why |
|---|---|---|
| A bug that needs careful reasoning: geometry, the weld, axis or unit conventions, a test that won't go green, a merge conflict | **Opus** | Deeper reasoning on one well-defined problem |
| An open-ended problem with no clear spec: UE 5.8's Python API behaving differently from the docs, a material graph that won't build, a level that imports wrong for no visible reason | **Fable** | The hardest, least-defined problems |
| Opus also failed on the same problem | **Fable** | Last step up |
| Fable also failed, or it's past the go / fallback time | **Fallback** (below) | Stop spending time |

Escalating means restarting the work in a new session on the stronger model, **forked from the failed one** so it inherits what was tried, with a one-paragraph note on what failed. The failed session is stopped, never left running alongside it on the same files.

Work that is mechanical stays on Sonnet even after one failure: merges with no conflicts, screenshots, slides, the republish, the tag.

## Schedule

Times are Saturday unless marked. **Bold** times are hard gates.

### Wave 1: start now (10:30 am), five sessions in parallel

| # | Session | Model | Starts from | Does | Done when | Reports by |
|---|---|---|---|---|---|---|
| 1 | **Merge lane** | Sonnet | `main` | After Finley's OK, merges in order: the flaky-test branch, the prep-plan branch, then the Scheme C copy. Runs `npm test` and the typecheck (`tsc -p tsconfig.app.json`) after each. Asks Finley about the root checkout's uncommitted plan-file change | All three in `main`, unit tests and typecheck green | 12:00 |
| 2 | **6F · Unreal export** | Sonnet | `main` | The 6F brief in `HANDOFF-codex-presentation.md` (read with `git show claude/presentation-prep-plan-f276aa:HANDOFF-codex-presentation.md`). One `.glb` per group, `scene.json`, UV0 = metres / 6, the lantern-corner weld, numpy tests then one Blender run | The files import into UE with buildings on the ground, north right, 6 m tile = 600 units. **Needs UE briefly: ask 6G-1 for a turn** | Check-in **3:00 pm** |
| 3 | **6G-1 · UE project and materials** | Sonnet | `main` | Makes the UE 5.8 project (Python Editor Script Plugin and Interchange on), imports the bake (BaseColor sRGB; ORM and Height linear; Normal DirectX), builds master materials (opaque, glass, water, world-Z blend) and an instance per `materials.json` key, safe to run twice. **Opens the project once to compile shaders** | A material-preview level shows every instance on a sphere, with a screenshot | Check-in **2:00 pm** |
| 4 | **Fallback B kit** (insurance) | Sonnet | `main` | Collects the signed-off Blender renders (6A–6D) into `build/presentation/renders/`. Records a Present-mode fly-through of Scheme C from the planner with headless Playwright (port 5197) as video | Renders folder and a fly-through video exist | 2:00 pm |
| 5 | **Slides and demo script** | Sonnet | `main` | Writes `presentation/demo-script.md` (5–7 steps through Scheme C: saved views, a tool or two, the code check, Present mode, sheets) and a slide outline. Takes planner stills headless. Unreal slides left as placeholders | Script and outline Finley can read | 3:00 pm |

### Wave 2: midday to evening

| When | Session | Model | Does | Gate |
|---|---|---|---|---|
| 12:00 | **Demo-path check** (after the merge lane) | Sonnet | Walks the demo script in the planner on merged `main`: the Gathering building inside the 35 ft buffer (the code check flags it; decide how to present that), warning chips overlapping labels, the dark-theme lot line. Fixes only what the demo passes through | Finley OKs each fix |
| 2:00 pm | **6G-1 check-in** | — | Finley looks at the material screenshot | OK, or escalate per the model rule |
| **3:00 pm** | **6F check-in** | — | Finley looks at the import screenshot | **Signed off → 6G-2 starts.** Not working → escalate (Opus first: this is geometry and conventions) |
| 3:00 pm | **6G-2 · meshes, level, cameras** | Sonnet | Cut from 6F's branch with 6G-1's branch merged in. Imports the `.glb` files (Interchange, Nanite on), assigns the instances from `scene.json`, builds `/Game/Islandale/Maps/Islandale`: SkyAtmosphere, sun from `scene.json`, SkyLight, height fog, post-process, a CineCamera per hero camera, and a **Level Sequence through the cameras** | — |
| 3:00 pm | **Slides draft** (slides session continues) | Sonnet | Turns the outline into slides with the planner stills and renders | — |
| **6:00 pm** | **6G-2 check-in** | — | One screenshot per camera; the sequence plays | OK, or escalate (Fable if it's UE behaving oddly) |
| **8:00 pm** | **Go / fallback** | — | Is the level working? | **Go:** polish until Sunday noon. **No:** fallback A |
| **8:00 pm** | **App freeze** | — | Nothing new into `src/` after this, only fixes Finley asks for | — |

### Saturday night (unattended, Mac awake)

- 6G-2 keeps polishing on its branch: lighting, the camera path's timing, a missing material. It can commit and push **its own branch** only.
- No merges into `main` overnight. A session that hits a check-in stops and sends a notification.

### Sunday Nov 15

| When | Session | Model | Does | Gate |
|---|---|---|---|---|
| 9:00 am | **Full e2e** from a clean detached worktree of `main` | Sonnet | Runs the whole browser suite (long timeouts under software GL). Known flake: `beginner.spec:39` | Green, or each failure explained |
| **12:00 pm** | **Unreal freeze** | — | Everything committed on the 6F, 6G-1 and 6G-2 branches | — |
| 12:00 pm | **Unreal merge** | Sonnet | Merges 6F, 6G-1 and 6G-2 into `main` (only `tools/`, so no app conflicts) | Finley's OK |
| 12:30 pm | **Shaders and backup video** | Sonnet + Finley | Opens the final UE project once and leaves it open; records the walkthrough (the Level Sequence) as a backup video | Video file exists |
| 1:00 pm | **Republish + tag** | Sonnet | From a clean worktree of frozen `main`: `npm run build`, `scripts/checkBundle.mjs`, `scripts/hosted-build-check.mjs`, publish the hosted home as **v14**, tag `presentation-2026-11` and push | Finley's OK to push and publish |
| 2:00 pm | **Slides final** | Sonnet | Adds the Unreal stills and the backup-video slide | — |
| 3:00 pm | **Run-through 1** | Finley | Demo + Unreal + slides, timed | Notes become typo-level fixes only |
| Evening | **Clean-up** | Sonnet | Archives the finished sessions; lists leftover worktrees and branches for Finley to remove | Finley's OK to delete |

### Monday Nov 16 (if presenting Monday)

Buffer only: rehearse twice, fix slide typos. Open the UE project once in the morning so its shaders are warm.

## Fallbacks

- **Fallback A** (6G-2 not working at **8 pm Saturday**): stop 6G-2. A Sonnet session drags 6F's `.glb` files into 6G-1's project (which already has the materials and compiled shaders), adds the sun, sky and fog by hand, and makes one Level Sequence through the cameras. Steps go into `tools/unreal/README.md`.
- **Fallback B** (6F not working at **3 pm**, even after escalating): stop the Unreal track. Use the renders and the planner fly-through that session 4 already made. Nothing else to build.
- **Last resort on the day:** the backup videos and the slides' stills carry the talk even if nothing runs live.

## Finley's checkpoints (in order)

1. **Now:** OK this schedule; OK the merge lane's three merges; say what to do with the root checkout's plan-file change; keep the Mac awake.
2. **2 pm:** 6G-1's material screenshot.
3. **3 pm:** 6F's import screenshot. This is the one that unlocks 6G-2.
4. **6 pm:** a screenshot from each camera.
5. **8 pm:** go, or fallback A.
6. **Sunday 12 pm:** OK the Unreal merge.
7. **Sunday 1 pm:** OK the push, the tag and the republish.
8. **Sunday 3 pm:** run-through.
