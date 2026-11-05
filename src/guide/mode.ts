import { create } from 'zustand'
import { readSaved, writeSaved } from './storage'

/**
 * Beginner or Advanced (4C). View state in its own small store: never saved
 * with the plan and never an undo step. Beginner is the default for a browser
 * that has never chosen; the choice is remembered per browser. Beginner only
 * changes what the panels show and what they call things: a hidden field keeps
 * its value, and Advanced shows it again.
 */

export type GuideMode = 'beginner' | 'advanced'

export const MODE_KEY = 'islandale-mode'
export const DEFAULT_MODE: GuideMode = 'beginner'

export function savedMode(): GuideMode {
  const v = readSaved(MODE_KEY)
  return v === 'beginner' || v === 'advanced' ? v : DEFAULT_MODE
}

export const useGuideMode = create<{ readonly mode: GuideMode; readonly setMode: (mode: GuideMode) => void }>((set) => ({
  mode: savedMode(),
  setMode: (mode) => {
    writeSaved(MODE_KEY, mode)
    set({ mode })
  },
}))

/** True in Beginner mode. */
export const useBeginner = (): boolean => useGuideMode((s) => s.mode === 'beginner')

/** The plain name in Beginner, the usual one in Advanced. */
export const usePlainName = (usual: string, plain: string): string => (useBeginner() ? plain : usual)
