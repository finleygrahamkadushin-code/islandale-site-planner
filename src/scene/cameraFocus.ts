import { create } from 'zustand'

/** A request to fly the camera to one object (F, or "Fly to" in command search); `n` makes a repeat request fly again. View state. */
export const useFocusRequest = create<{ readonly request: { readonly id: string; readonly n: number } | null; readonly flyTo: (id: string) => void }>((set, get) => ({
  request: null,
  flyTo: (id) => set({ request: { id, n: (get().request?.n ?? 0) + 1 } }),
}))
