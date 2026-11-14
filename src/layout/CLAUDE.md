# Layout section

How the screen is organised (Phase 4B): the Site / Build / Interior / Present task tabs, which tools, library groups and panels each tab shows, the bottom bar, command search (Cmd/Ctrl+K), the shortcuts sheet (?) and the old view keys. **Work from this map.** Open only the files the task names, and only open another section when "Talks to" says the task crosses into it.

## Start here, by task

| To change… | Open |
|---|---|
| What each tab offers (tools, library groups) and the default tab | `tabs.ts` (`TAB_TOOLS`, `TAB_LIBRARY_GROUPS`, `DEFAULT_TAB`) |
| The tab buttons in the top bar | `TaskTabs.tsx` (`TaskTabs`; `TaskPanel` is the side panel's `tabpanel`, labelled by the current tab; `TabPanel` shows children only on its tabs) |
| Which panels the right side shows on each tab | `../ui/SidePanel.tsx` (built from `TabPanel`) |
| The Interior and Present tabs' own panels | `TabPanels.tsx` |
| The bottom bar: pointer readout, camera hint, Clear measurements | `BottomBar.tsx`; the readout maths is `../site/pointer.ts` |
| What command search can run | `commands.ts` (`commandsFor`; `objectCommands`, the "Select …" entries shown once something is typed, R10.1); "Browse designs" is left out while the data holds one scheme (`hasSchemeChoice`, `../site/schemes.ts`) |
| The command search and shortcuts dialogs | `Overlays.tsx` (`useOverlay` says which is open, and `afterClose` sends focus to the 3D view, `../scene/planView.ts`, after Select or Place); the search itself is `CommandMenu.tsx`, loaded on first use (`../app/prefetch.ts` fetches it after the first frame) |
| The shortcuts sheet's list | `shortcuts.ts` (one table) |
| Keys 1–4, F, I, W | `viewKeys.ts`; Cmd/Ctrl+K and ? are in `../ui/useKeyboardShortcuts.ts` |
| Turning single-key shortcuts off (R10.5): the setting, the Help sheet's checkbox | `../ui/singleKeys.ts` (`useSingleKeys`, `singleKeyOff`), `Overlays.tsx` (`HelpSheet`) |
| Which keys the focused control keeps from the plan (text fields, sliders, tabs and radios, anything inside a dialog or menu) | `../ui/keyOwner.ts` (`keepsKey`, pure); a layer that edits the plan opts back in with `data-plan-keys` (the interior editor, the tour card) |
| How tabs, the bottom bar and the dialogs look | the "Layout (4B)" and "Command search" blocks in `../app/styles.css` |

## How it fits together

- **Tab state:** the current tab is view state in `useTaskTab`, remembered per browser (`localStorage` key `islandale-task-tab`). `setTab` ends a tool the new tab lacks and keeps the selection.
- **Who reads the tab:** the tool strip, the library, the side panel and the tool keys (`../tools/toolKeys.ts`) all read it, so a key only switches to a tool the tab has.
- **Command search:** commands are built from the store each time the menu opens. A setting command opens its inspector heading through `../ui/InspectorSection.tsx` (`useOpenSections`).
- **Fly to:** F and "Fly to the selection" post a request to `../scene/cameraFocus.ts`, which `../scene/CameraRig.tsx` follows.

## Talks to

- **Uses:** `../store/` (`planStore`, `toolActions`, `types`), `../tools/` (`library`, `libraryOpen`), `../ui/InspectorSection`, `../scene/` (`views`, `cameraFocus`), `../site/` (`pointer`, `earthworks/useEarthworks`) and `../interiors/editor/interiorView`.
- **Used by:** `../app/App.tsx` (`BottomBar`, `Overlays`), `../ui/TopBar.tsx` (`TaskTabs`, the Search and ? buttons; File and View are `../ui/FileMenu.tsx` and `../ui/ViewMenu.tsx`), `../ui/SidePanel.tsx`, `../ui/useKeyboardShortcuts.ts`, `../tools/ToolStrip.tsx`, `LibraryPanel.tsx` and `toolKeys.ts`.

## Checks for this section

- **Unit tests:** `npx vitest run src/layout` (tabs and command search). Then `npx tsc -p tsconfig.app.json` from the repo root.
- **Browser tests:** `e2e/layout.spec.ts` (the 4B done-when: tabs, measuring, the readout, box select with a group drag, and Cmd+K; about 2.5 minutes). Inspector headings start closed except Placement and Size and shape; e2e specs open one with `openSection` from `e2e/inspector.ts`.
