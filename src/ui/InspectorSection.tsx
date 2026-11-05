import type { ReactNode } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronRight } from 'lucide-react'
import { create } from 'zustand'

/**
 * One collapsible heading of the inspector (4B). Which headings are open is
 * view state, remembered per browser; Placement and Size and shape start
 * open. Other parts of the app open one by id (Paint mode opens Look, W
 * opens Openings).
 */

export type SectionId = 'placement' | 'size' | 'roof' | 'look' | 'openings' | 'railings' | 'levels' | 'path' | 'visibility'

const STORAGE_KEY = 'islandale-inspector-open'
export const DEFAULT_OPEN: readonly SectionId[] = ['placement', 'size']

function savedOpen(): readonly SectionId[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    const v: unknown = raw ? JSON.parse(raw) : null
    return Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as SectionId[]) : DEFAULT_OPEN
  } catch {
    return DEFAULT_OPEN
  }
}

function remember(open: readonly SectionId[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(open))
  } catch {
    // blocked storage: the headings just aren't remembered
  }
}

export const useOpenSections = create<{ readonly open: readonly SectionId[]; readonly setOpen: (id: SectionId, on: boolean) => void }>((set, get) => ({
  open: savedOpen(),
  setOpen: (id, on) => {
    const now = get().open
    if (now.includes(id) === on) return
    const open = on ? [...now, id] : now.filter((x) => x !== id)
    remember(open)
    set({ open })
  },
}))

interface Props {
  readonly id: SectionId
  readonly title: ReactNode
  readonly className?: string
  readonly testId?: string
  /** A first-run tour step points here (data-tour). */
  readonly tourAnchor?: string
  readonly children: ReactNode
}

export function InspectorSection({ id, title, className, testId, tourAnchor, children }: Props) {
  const open = useOpenSections((s) => s.open.includes(id))
  const setOpen = useOpenSections((s) => s.setOpen)
  return (
    <Collapsible.Root open={open} onOpenChange={(on) => setOpen(id, on)} className={`inspector-section${className ? ` ${className}` : ''}`} data-testid={testId} data-tour={tourAnchor}>
      <Collapsible.Trigger className="section-trigger" data-testid={`section-${id}`}>
        <ChevronRight size={14} aria-hidden="true" className="section-chevron" />
        <span className="section-title">{title}</span>
      </Collapsible.Trigger>
      <Collapsible.Content className="section-body">{children}</Collapsible.Content>
    </Collapsible.Root>
  )
}
