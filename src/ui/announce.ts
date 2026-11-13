import { create } from 'zustand'
import { mToFt } from '../site/units'
import { formatLengthField } from './feetInches'

/**
 * What the keyboard just did, said through one polite live region
 * (`Announcer.tsx`, R10.1): what was selected, where a nudge left it, where
 * the ghost is while placing, "Placed …" and "Placing stopped". Someone who
 * can't see the 3D view hears the result. Refusals stay with the toast, as
 * for a pointer user. View state, never saved.
 */
export const useAnnounce = create<{ readonly text: string; readonly n: number; readonly say: (text: string) => void }>((set) => ({
  text: '',
  n: 0,
  say: (text) => set((s) => ({ text, n: s.n + 1 })),
}))

export const announce = (text: string): void => useAnnounce.getState().say(text)

/** A site point as the inspector's Placement fields write it: "East 10' 4", North -20'". */
export function positionWords(p: { readonly x: number; readonly n: number }): string {
  return `East ${formatLengthField(mToFt(p.x))}, North ${formatLengthField(mToFt(p.n))}`
}
