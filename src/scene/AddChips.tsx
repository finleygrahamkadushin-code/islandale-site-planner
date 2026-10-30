import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ATTACH_KINDS, chipEdges, kindLabel, partEdges, type AttachKind } from '../buildings/attach'
import { edgeName, partName } from '../buildings/masses'
import type { PlanObject } from '../store/types'
import { addPartAt } from './addPart'
import { openArea, placeMenu } from './menuPlace'
import { inGroup, type PartFrame } from './partFrame'
import { LAYER, ScreenChip, STOP_EVENTS } from './ScreenChip'

/** The + chip sits this far out from the edge midpoint on screen, beyond the rail chip (legacy PLUS_PX). */
const PLUS_PX = 44
const LIFT_M = 0.15

interface Props {
  readonly o: PlanObject
  readonly frame: PartFrame
  /** The picked part: only its edges get chips; null for every part of the building. */
  readonly picked: number | null
}

/**
 * A + on each free edge of the selected building (or only of its picked
 * part) that opens a small menu: Deck, Porch, Stair, Ramp, and Door on
 * enclosed walls (legacy ext:attach-add). Connect waits for 5C.
 */
export function AddChips({ o, frame, picked }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const masses = picked === null ? frame.masses.map((_, i) => i) : [picked]
  const chips = masses.flatMap((mi) => {
    const E = partEdges(frame.masses, mi, frame.site)
    return chipEdges(frame.masses, mi).map((i) => ({ mi, e: E[i], key: `${mi}:${i}` }))
  })
  const shown = open && chips.some((c) => c.key === open) ? open : null

  useEffect(() => {
    if (!shown) return
    const outside = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.aa-pop, .aa-chip')) setOpen(null)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // the menu closes first; the next Escape drops the part
      e.stopImmediatePropagation()
      setOpen(null)
    }
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('keydown', esc, true)
    }
  }, [shown])

  return (
    <>
      {chips.map(({ mi, e, key }) => {
        const m = frame.masses[mi]
        const label = `${partName(m, mi)} · ${edgeName(m, e.i)}`
        const kinds: (AttachKind | 'door')[] = m.kind === 'wall' ? [...ATTACH_KINDS, 'door'] : [...ATTACH_KINDS]
        return (
          <ScreenChip key={key} position={inGroup(frame, e.mid, e.z + LIFT_M)} normal={e.n} px={PLUS_PX} layer={shown === key ? LAYER.menu : LAYER.plus}>
            <div className="aa-wrap" {...STOP_EVENTS}>
              <button
                type="button"
                className={`aa-chip${shown === key ? ' on' : ''}`}
                data-testid={`add-chip-${mi}-${e.i}`}
                title={`Add to ${label}`}
                aria-expanded={shown === key}
                onClick={() => setOpen(shown === key ? null : key)}
              >
                +
              </button>
              {shown === key && (
                <AddMenu label={label}>
                  {kinds.map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="menuitem"
                      data-testid={`add-${k}`}
                      onClick={() => {
                        setOpen(null)
                        addPartAt(o.id, frame, mi, e.i, k)
                      }}
                    >
                      {kindLabel(k)}
                    </button>
                  ))}
                </AddMenu>
              )}
            </div>
          </ScreenChip>
        )
      })}
    </>
  )
}

/**
 * The open menu, placed every frame as the old planner's placePop does:
 * right of its chip, or left of it when the side panel or the window edge
 * is in the way, and never above or below the open view.
 */
function AddMenu({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    let raf = 0
    const place = () => {
      const el = ref.current
      const wrap = el?.parentElement
      if (el && wrap) {
        const chip = wrap.getBoundingClientRect()
        const at = placeMenu(chip.left + chip.width / 2, chip.top + chip.height / 2, el.offsetWidth, el.offsetHeight, openArea(wrap))
        el.style.left = `${at.left - chip.left}px`
        el.style.top = `${at.top - chip.top}px`
      }
      raf = requestAnimationFrame(place)
    }
    place()
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className="aa-pop" ref={ref} role="menu" aria-label={`Add to ${label}`}>
      <div className="aa-pop-h">{label}</div>
      {children}
    </div>
  )
}
