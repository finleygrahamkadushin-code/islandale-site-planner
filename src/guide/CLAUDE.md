# Guide section

Helping a newcomer (Phase 4C): the Beginner / Advanced switch, the one shared tooltip, glossary words, the confirm dialog and the first-run tour. **Work from this map.** Open only the files the task names.

## Start here, by task

| To change… | Open |
|---|---|
| The mode, its default, remembering it | `mode.ts` (`useGuideMode`, `useBeginner`, `MODE_KEY`) |
| The switch in the top bar | `ModeSwitch.tsx` (mounted in `../ui/TopBar.tsx` beside Style) |
| What Beginner hides or renames | at each field: `../ui/ShapeFields.tsx` (roof, footprint extra), `../ui/Inspector.tsx` (Turned, How tall, the Placement hint), `../ui/LayersPanel.tsx` (padlocks) |
| A tooltip on any control | `Tip.tsx` (`Tip`; `TipProvider` is mounted once in `../app/App.tsx`) |
| A glossary word and its definition | `glossary.ts` (`GLOSSARY`), `Term.tsx` |
| Asking before deleting, Reset, removing a floor | `confirm.ts` (`requestDelete`, `useConfirm().request`), `ConfirmDialog.tsx` |
| The tour's steps and where each points | `tour.ts` (`TOUR_STEPS`, anchors are `data-tour` attributes or selectors), `TourCard.tsx` |
| How these look | the "Beginner (4C)" block at the end of `../app/styles.css` |

## How it fits together

- **View state only:** the mode, the confirm question and the tour are their own small stores. None is saved with the plan or is an undo step. The mode and "tour seen" are remembered per browser (`islandale-mode`, `islandale-tour`).
- **Beginner changes presentation only:** a hidden field keeps its value; Advanced shows it again.
- **Deleting:** every delete of whole objects (Delete key, inspector buttons, command search) goes through `requestDelete`, which asks in Beginner and deletes at once in Advanced. While the dialog is open the plan's keys are off (`../ui/useKeyboardShortcuts.ts`).
- **The tour:** starts once the plan has loaded on a browser that has never seen it, only points (it opens the Visibility and lock heading for the lock step), and Help or command search replays it. Clicks on the plan pass through the card; Escape ends it.

## Talks to

- **Uses:** `../store/planStore` (delete, load state), `../ui/InspectorSection` (`useOpenSections`).
- **Used by:** `../app/App.tsx`, `../ui/` (TopBar, Inspector, LayersPanel, ShapeFields, fields, useKeyboardShortcuts), `../layout/` (commands, Overlays), `../tools/ToolStrip.tsx`, the interior editor, and every feature panel that shows a tooltip.

## Checks for this section

- **Unit tests:** `npx vitest run src/guide` (mode, glossary, delete, tour). Then `npx tsc -p tsconfig.app.json --noEmit` from the repo root.
- **Browser tests:** `e2e/beginner.spec.ts` (the 4C done-when: the tour, the one-minute walk, Advanced). Every other spec starts as Advanced with the tour seen (`storageState` in `playwright.config.ts`, and `clearSaves` in `e2e/fresh.ts`); pass `{ newcomer: true }` to start as a new browser.
- **Lighthouse:** accessibility 100 on a fresh load, 97 with a cabin selected and every heading open (the only miss is the "+" add chips crowding each other at some camera angles).
