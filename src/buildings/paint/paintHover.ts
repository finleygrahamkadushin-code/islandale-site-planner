import { create } from 'zustand'

/** What Paint mode's pointer is over, for the mode chip (view state; never saved or undone). */
export const usePaintHover = create<{ readonly label: string | null; readonly setLabel: (label: string | null) => void }>((set) => ({
  label: null,
  setLabel: (label) => set({ label }),
}))
