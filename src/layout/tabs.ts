import { create } from 'zustand'
import { usePlanStore } from '../store/planStore'
import { toolOf, type ToolId } from '../store/toolActions'
import type { LibraryGroup } from '../tools/library'

/**
 * The task tabs (4B): Site, Build, Interior and Present. Each tab decides
 * which tools the strip shows, which library groups Place offers, and what
 * the side panel holds. The tab is view state, remembered per browser;
 * switching ends a tool the new tab doesn't have and keeps the selection.
 */

export type TaskTab = 'site' | 'build' | 'interior' | 'present'

export const TAB_IDS: readonly TaskTab[] = ['site', 'build', 'interior', 'present']
export const DEFAULT_TAB: TaskTab = 'build'

export const TAB_LABELS: Readonly<Record<TaskTab, string>> = { site: 'Site', build: 'Build', interior: 'Interior', present: 'Present' }

export const TAB_HINTS: Readonly<Record<TaskTab, string>> = {
  site: 'The lot: ground, trees, ponds, sun and tide, measuring',
  build: 'Cabins, decks, paths, paint and connections',
  interior: 'Floor plans: rooms, doors and furniture',
  present: 'Saved views for showing the plan',
}

export const TAB_TOOLS: Readonly<Record<TaskTab, readonly ToolId[]>> = {
  site: ['select', 'place', 'measure'],
  build: ['select', 'place', 'paint', 'connect', 'measure'],
  interior: ['select'],
  present: [],
}

export const TAB_LIBRARY_GROUPS: Readonly<Record<TaskTab, readonly LibraryGroup[]>> = {
  site: ['site', 'trees', 'paths'],
  build: ['buildings', 'paths'],
  interior: [],
  present: [],
}

const STORAGE_KEY = 'islandale-task-tab'

/** The remembered tab, or the default when this browser has none (or no storage, as in tests). */
function savedTab(): TaskTab {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY)
    return TAB_IDS.includes(v as TaskTab) ? (v as TaskTab) : DEFAULT_TAB
  } catch {
    return DEFAULT_TAB
  }
}

function rememberTab(tab: TaskTab): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, tab)
  } catch {
    // private windows and blocked storage: the tab just isn't remembered
  }
}

export const useTaskTab = create<{ readonly tab: TaskTab; readonly setTab: (tab: TaskTab) => void }>((set) => ({
  tab: savedTab(),
  setTab: (tab) => {
    const s = usePlanStore.getState()
    if (!TAB_TOOLS[tab].includes(toolOf(s))) s.setTool('select')
    rememberTab(tab)
    set({ tab })
  },
}))
