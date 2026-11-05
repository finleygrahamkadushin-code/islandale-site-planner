import { create } from 'zustand'

/** Whether the object library is open beside the tool strip (view state; the keyboard's L opens it too). */
export const useLibraryOpen = create<{ readonly open: boolean; readonly setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))
