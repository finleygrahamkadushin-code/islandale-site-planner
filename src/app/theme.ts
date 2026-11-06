import { create } from 'zustand'
import { readSaved, writeSaved } from '../guide/storage'

/**
 * Light / Dark / System (4E). View state in its own small store: never saved
 * with the plan and never an undo step. System follows the browser's
 * `prefers-color-scheme` and is the default for a browser that has never
 * chosen; the choice is remembered per browser. The colours themselves are
 * the tokens in styles.css: dark on `:root`, light under
 * `[data-theme="light"]` and under the system's light setting when no theme
 * is set. Only the panels, bars and dialogs change; the 3D view keeps its
 * display styles.
 */

export type ThemeChoice = 'light' | 'dark' | 'system'

export const THEME_KEY = 'islandale-theme'
export const DEFAULT_THEME: ThemeChoice = 'system'
export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system']

const isTheme = (v: string | null): v is ThemeChoice => v === 'light' || v === 'dark' || v === 'system'

export function savedTheme(): ThemeChoice {
  const v = readSaved(THEME_KEY)
  return isTheme(v) ? v : DEFAULT_THEME
}

/** Mark the page: `data-theme="light"|"dark"` on <html>, or no attribute for System. */
export function applyTheme(choice: ThemeChoice, root: Element | undefined = globalThis.document?.documentElement): void {
  if (!root) return
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)
}

/** Apply the remembered choice; main.tsx calls it before the first render so the page never flashes the other theme. */
export function initTheme(): ThemeChoice {
  const choice = savedTheme()
  applyTheme(choice)
  return choice
}

export const useTheme = create<{ readonly theme: ThemeChoice; readonly setTheme: (theme: ThemeChoice) => void }>((set) => ({
  theme: savedTheme(),
  setTheme: (theme) => {
    writeSaved(THEME_KEY, theme)
    applyTheme(theme)
    set({ theme })
  },
}))
