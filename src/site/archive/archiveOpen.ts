import { create } from 'zustand'

/**
 * Whether the Designs archive is open (5F), and what had focus when it
 * opened, so closing it hands focus back there (it opens from a button or a
 * command, not a Radix trigger). View state, never saved.
 */
export const useArchiveOpen = create<{
  readonly open: boolean
  readonly opener: HTMLElement | null
  readonly setOpen: (open: boolean) => void
}>((set) => ({
  open: false,
  opener: null,
  setOpen: (open) =>
    set(() =>
      open
        ? { open, opener: typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null }
        : { open },
    ),
}))
