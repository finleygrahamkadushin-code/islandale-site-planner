import { usePresent } from '../present/present'
import { useTaskTab, type TaskTab } from '../layout/tabs'
import { useGuideMode, type GuideMode } from './mode'

/**
 * What Beginner leaves out (R9.2): the code checks. A newcomer opens on the
 * plan, not on a failing ADA report; Advanced shows every check. Like every
 * Beginner rule this is presentation only: nothing is turned off, and
 * command search still reaches each panel (it switches to Advanced).
 */

export type CheckPanel = 'code-check' | 'program-budget' | 'route'

/** The side panels that only Advanced shows: the code check, the program budget, the accessible route. */
export const CHECK_PANELS: readonly CheckPanel[] = ['code-check', 'program-budget', 'route']

export const checkPanelShown = (_panel: CheckPanel, mode: GuideMode): boolean => mode === 'advanced'

/**
 * The route and step warning chips over the model (R9.7): Advanced only, and
 * never on the Present tab or while presenting, where the model is shown, not checked.
 */
export function warningChipsShown({ mode, tab, presenting }: { readonly mode: GuideMode; readonly tab: TaskTab; readonly presenting: boolean }): boolean {
  return mode === 'advanced' && tab !== 'present' && !presenting
}

export const useCheckPanelShown = (panel: CheckPanel): boolean => checkPanelShown(panel, useGuideMode((s) => s.mode))

export function useWarningChipsShown(): boolean {
  const mode = useGuideMode((s) => s.mode)
  const tab = useTaskTab((s) => s.tab)
  const presenting = usePresent((s) => s.presenting)
  return warningChipsShown({ mode, tab, presenting })
}
