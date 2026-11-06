# Present section

Showing the plan (Phase 4D): Present mode, the sun animation, the slow orbit, the compass and scale bar, the loading splash, the PNG snapshot and the WebGL check. **Work from this map.** Open only the files the task names.

## Start here, by task

| To change… | Open |
|---|---|
| Entering and leaving Present, what it hides and puts back | `present.ts` (`usePresent`); what's hidden is the "Present (4D)" block in `../app/styles.css` (`.app.presenting`) |
| Present's control bar: views, sun, orbit, picture, Leave; full screen | `PresentBar.tsx` (`useSunPlayer`, `useFullScreen`) |
| The sun animation's times and speed, the sky's half-hour steps, reduced motion | `sunTimeline.ts` |
| The hour the sun is drawn at | `present.ts` (`useSunHour`), read by `../site/environment/SceneEnvironment.tsx` |
| The compass and scale bar | `CompassScale.tsx` (draws them), `viewMaths.ts` (heading, metres per pixel, round lengths, facing north) |
| What the 3D view reports and does on request (camera readings, face north, snapshot, splash ready) | `ViewProbe.tsx` (inside the Canvas), `viewState.ts` (`useViewHud`, `useSplash`) |
| The snapshot's file name and download | `snapshot.ts` |
| The loading splash | `Splash.tsx` |
| No WebGL 2 | `webgl.ts` (`hasWebGL2`), `NoWebGL.tsx`; the check is in `../scene/Scene.tsx` |
| The slow orbit | `../scene/Scene.tsx` (`autoRotate` on `OrbitControls`; a drag turns it off) |

## How it fits together

- **View state only:** `usePresent`, `useViewHud` and `useSplash` are never saved and never undo steps.
- **No editing while presenting:** objects get no-op handlers (`../scene/useObjectInteraction.ts`), the ground ignores presses and clicks (`../site/TerrainMesh.tsx`), gizmos aren't drawn, and the keyboard only takes Escape (`../ui/useKeyboardShortcuts.ts`).
- **The sun is a preview:** the animation writes `previewHour` in `usePresent`, never the plan's `environment.hour`. The sky reflection is keyed on `skyHour`, so it rebuilds every half hour, not every frame.
- **After a frame:** the snapshot and the splash use R3F's `addAfterEffect`, so they read the canvas after post-processing has drawn it.

## Talks to

- **Uses:** `../store/planStore` (labels, tool, view requests, environment), `../scene/views` (`SAVED_VIEWS`), `../site/environment/sun` (`SEASONS`), `../guide/Tip`.
- **Used by:** `../app/App.tsx` (`PresentBar`, the `presenting` class), `../scene/Scene.tsx`, `../site/environment/SceneEnvironment.tsx`, `../layout/TabPanels.tsx` (Start presenting), `../layout/commands.ts` (Present, Save a picture), `../ui/useKeyboardShortcuts.ts`.

## Checks for this section

- **Unit tests:** `npx vitest run src/present`. Then `npx tsc -p tsconfig.app.json --noEmit` from the repo root.
- **Browser tests:** `e2e/present.spec.ts` (the 4D done-when, about 4 minutes). It saves Present pictures of all five views in Realistic and White model to `test-results/present-views/`.
- **Close previews when done:** a browser tab left on the 3D view keeps rendering and can slow the whole machine.
