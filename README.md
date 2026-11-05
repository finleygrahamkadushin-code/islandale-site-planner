# Islandale Site Planner

A 3D site planner for the Islandale lot on Lopez Island, Washington: the surveyed ground and parcel, the cabins and decks designed for it, the paths between them, their floor plans, and printable drawing sheets at a true architectural scale.

It runs in the browser: Vite, TypeScript, React and [React Three Fiber](https://r3f.docs.pmnd.rs/) on three.js. It's a rebuild of an older single-file planner, which is kept in `legacy/` as the reference for how everything should behave.

## Run it

You need Node 20.19+ or 22.12+ (it's developed on Node 24).

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

| Command | What it does |
|---|---|
| `npm run dev` | Starts the app with live reload |
| `npm test` | Runs the unit tests (Vitest, about 1,300 tests, a few seconds) |
| `npx tsc -p tsconfig.app.json` | Type-checks the app (`tsc -p .` checks nothing) |
| `npm run test:e2e` | Runs the browser tests (Playwright; slow, best run one spec at a time) |
| `npm run build` | Type-checks and builds the static site into `dist/`, with the old planner beside it as `legacy.html` |
| `npm run extract` | Re-extracts the terrain, parcel and schemes from the old planner into `data/islandale/` |
| `npm run plan:commit` | Commits the saved plan file |

To open the old planner on its own while developing:

```bash
python3 -m http.server 8777 --bind 127.0.0.1 --directory legacy
```

Then open http://localhost:8777/islandale-planner.html.

## Where the plan is saved

The design lives in `data/plans/islandale.plan.json`. While `npm run dev` is running, the app saves to that file as you work and keeps earlier versions in `data/plans/.history/` (not committed). If the file changes on disk, for example because Claude Code edited it, the open app reloads it. The browser tests use their own plan folder (`ISLANDALE_PLAN_DIR`), so they never touch your plan.

Units: feet and inches in the interface, metres inside the code, elevations in NAVD88.

## How the code is organised

The code is organised by feature, not by layer. Each feature's maths, 3D meshes, panels and tests live together in one folder, and each feature folder has a `CLAUDE.md` map that says which file to open for which change.

```
src/
  buildings/      cabins and decks: walls, roofs, openings, rails, stairs, decks, foundation, paint, parts
  site/           the lot: terrain, parcel, contours, schemes; earthworks; trees, ponds, pools; sun and tide
  paths/          walks, ramps, stairs and boardwalks; the Connect tool; accessible-route checks; junctions
  interiors/      floor plans: rooms, doors, furniture, the plan editor, rooms in 3D
  export/sheets/  drawing sheets: floor plans, foundation plan, elevations, measurement tables
  store/          shared core: plan data, undo, selection, locks, saving
  scene/          shared 3D plumbing: cameras, effects, gizmos, labels, surfaces, display styles
  ui/             shared interface: top bar, side panel, inspector, layers, history
  app/            the app shell
data/islandale/   terrain grid, parcel and schemes (JSON)
data/plans/       the saved design
e2e/              browser tests
legacy/           the old planner (read-only reference)
tools/            map.sh (search the old planner), move-modules.mjs (move files and fix imports)
```

| To work on… | Start with |
|---|---|
| Buildings, decks, rails, stairs, roofs, paint | [`src/buildings/CLAUDE.md`](src/buildings/CLAUDE.md) |
| Terrain, earthworks, trees, ponds, sun and tide | [`src/site/CLAUDE.md`](src/site/CLAUDE.md) |
| Paths, accessible routes, Connect, junctions | [`src/paths/CLAUDE.md`](src/paths/CLAUDE.md) |
| Floor plans and furniture | [`src/interiors/CLAUDE.md`](src/interiors/CLAUDE.md) |
| Drawing sheets | [`src/export/sheets/CLAUDE.md`](src/export/sheets/CLAUDE.md) |

A few rules hold everywhere:
- The plan is data in the store, and the scene only draws it.
- Every change goes through a store action, so it can be undone and respects locks.
- New shaders are written in TSL, so the later move to WebGPU is easy.

The full working rules are in [`CLAUDE.md`](CLAUDE.md).

## Working with Claude Code

This project is built with [Claude Code](https://claude.com/claude-code). The root `CLAUDE.md` has the working rules and a "Where to look" table, and each section's `CLAUDE.md` maps tasks to files. Claude Code loads a section's map whenever it works in that folder, so a change reads only the files it needs instead of the whole codebase.

To work on one part, start a session and name the section in the first message, for example "sheets: add a roof plan" or "paths: widen the default walk".

## Plans and status

[`PLAN.md`](PLAN.md) is the rebuild plan: the goals, tech choices, the build order with each phase's done-when check, and every deliberate change from the old planner. Each phase has its own plan file next to it (`PLAN-PHASE2.md` to `PLAN-PHASE5.md`, `PLAN-DRAWING-SHEETS.md`).

| Phase | State |
|---|---|
| 1–3C: foundation, editing, graphics, design fidelity, safe autosave and openings | Done |
| 5A–5D: building parts and rails, interiors, paths, shapes, roofs, finishes, earthworks | Done |
| Drawing sheets: floor plans, foundation plan, elevations, tables | Done |
| 4: UI and beginner experience (task tabs, Beginner mode, tour, Present mode) | Planned, not started |
| 5E–5F, 6: the remaining tools, exports and renders | Planned |
| Blender → Unreal Engine 5 exterior pipeline | In progress on its own branch |

## The old planner

`legacy/islandale-planner.html` is the original planner: one 15,000-line file with lines of up to 60,000 characters of terrain data. Don't open it in an editor or `cat` it. Search it with `tools/map.sh`:

```bash
tools/map.sh def roofGeometry
```

It is edited only through appended `ext:` blocks, each recorded in `PLAN.md`.

## License

[MIT](LICENSE) © 2026 Finley Graham-Kadushin
