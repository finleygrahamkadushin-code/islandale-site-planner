import { create } from 'zustand'
import { temporal } from 'zundo'
import { loadIslandale } from '../site/islandale'
import { CURRENT_SCHEME_ID, loadSchemes, schemeById } from '../site/schemes'
import type { Site } from '../site/types'
import type { Scheme } from '../site/schemes'
import { planFromScheme } from './fromLegacy'
import type { LabelMode, ObjectId, Plan } from './types'

export interface PlanState {
  readonly site: Site
  readonly schemes: readonly Scheme[]
  readonly plan: Plan
  readonly selection: readonly ObjectId[]
  /** Terrain and lot are locked by default so the ground can never be dragged by accident. */
  readonly siteLocked: boolean
  readonly labelMode: LabelMode

  readonly select: (ids: readonly ObjectId[]) => void
  readonly loadScheme: (schemeId: string) => void
  readonly setLocked: (id: ObjectId, locked: boolean) => void
  readonly setHidden: (id: ObjectId, hidden: boolean) => void
  readonly setSiteLocked: (locked: boolean) => void
  readonly setLabelMode: (mode: LabelMode) => void
}

const site = loadIslandale()
const schemes = loadSchemes()

export const usePlanStore = create<PlanState>()(
  temporal(
    (set, get) => ({
      site,
      schemes,
      plan: planFromScheme(schemeById(schemes, CURRENT_SCHEME_ID)),
      selection: [],
      siteLocked: true,
      labelMode: 'all',

      select: (ids) => set({ selection: [...ids] }),
      loadScheme: (schemeId) =>
        set({ plan: planFromScheme(schemeById(get().schemes, schemeId)), selection: [] }),
      setLocked: (id, locked) => set((s) => ({ plan: withObject(s.plan, id, { locked }) })),
      setHidden: (id, hidden) => set((s) => ({ plan: withObject(s.plan, id, { hidden }) })),
      setSiteLocked: (siteLocked) => set({ siteLocked }),
      setLabelMode: (labelMode) => set({ labelMode }),
    }),
    {
      // Only the plan itself is undoable; selection and view settings are not.
      partialize: (s) => ({ plan: s.plan }),
      equality: (a, b) => a.plan === b.plan,
    },
  ),
)

function withObject(plan: Plan, id: ObjectId, patch: Partial<Plan['objects'][string]>): Plan {
  const existing = plan.objects[id]
  if (!existing) throw new Error(`unknown object "${id}"`)
  return { ...plan, objects: { ...plan.objects, [id]: { ...existing, ...patch } } }
}

export const useTemporalStore = usePlanStore.temporal
