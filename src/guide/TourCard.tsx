import { useEffect, useMemo, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { usePlanStore } from '../store/planStore'
import { useOpenSections } from '../ui/InspectorSection'
import { startTourIfNew, TOUR_STEPS, useTour, VIEW_ANCHOR } from './tour'

/** The first control on screen among a step's anchors, else the view. */
function anchorOf(selectors: readonly string[]): Element | null {
  for (const sel of [...selectors, VIEW_ANCHOR]) {
    const el = document.querySelector(sel)
    if (el && el.getBoundingClientRect().width > 0) return el
  }
  return null
}

/** A share of the window past which an anchor is "the whole view": the card then sits in its middle, not beside it. */
const BIG_ANCHOR = 0.5

/** Where the card points: the control itself, or the middle of a big one such as the view. */
function pointAt(el: Element | null): DOMRect {
  const r = el?.getBoundingClientRect() ?? new DOMRect(window.innerWidth / 2, window.innerHeight / 3, 0, 0)
  if (r.height < window.innerHeight * BIG_ANCHOR) return r
  return new DOMRect(r.left + r.width / 2, r.top + r.height / 3, 0, 0)
}

/** Re-render now and then, so the card follows a control that appears or moves (a label, a section opening). */
function useTick(on: boolean): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!on) return
    const t = window.setInterval(() => setTick((n) => n + 1), 400)
    return () => window.clearInterval(t)
  }, [on])
  return tick
}

/**
 * The tour card (4C): a non-modal Radix Popover beside the control each step
 * is about, with Back, Next and Skip. Clicks on the plan go through, so the
 * newcomer can try each step while it shows; Escape ends the tour.
 */
export function TourCard() {
  const step = useTour((s) => s.step)
  const { next, back, end } = useTour.getState()
  const loaded = usePlanStore((s) => s.saveStatus !== 'loading' && s.readOnly !== 'opening')
  const selection = usePlanStore((s) => s.selection.length)
  const tick = useTick(step !== null)

  useEffect(() => {
    if (loaded) startTourIfNew()
  }, [loaded])

  const current = step === null ? null : TOUR_STEPS[step]
  // the lock step points at the Locked box, which sits under a heading that starts closed
  useEffect(() => {
    if (current?.id === 'lock' && selection) useOpenSections.getState().setOpen('visibility', true)
  }, [current, selection])

  const anchor = useMemo(() => {
    // looked up when the card is placed, not during render
    const anchors = current?.anchors ?? []
    return { current: { getBoundingClientRect: () => pointAt(anchorOf(anchors)) } }
    // tick and selection: look for the control again as the screen changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, tick, selection])

  if (!current || step === null) return null
  const last = step === TOUR_STEPS.length - 1
  return (
    <Popover.Root open modal={false}>
      <Popover.Anchor virtualRef={anchor} />
      <Popover.Portal>
        <Popover.Content
          className="tour-card"
          side="bottom"
          align="center"
          sideOffset={10}
          collisionPadding={12}
          aria-label={`Tour, step ${step + 1} of ${TOUR_STEPS.length}: ${current.title}`}
          data-testid="tour"
          data-step={current.id}
          data-plan-keys=""
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            // ends the tour only: the plan's own Escape (clear the selection) must not run as well
            e.stopPropagation()
            end()
          }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <p className="tour-count muted small">
            Step {step + 1} of {TOUR_STEPS.length}
          </p>
          <div aria-live="polite">
            <h2 className="tour-title">{current.title}</h2>
            <p className="tour-text">{current.text}</p>
          </div>
          <div className="tour-actions">
            <button type="button" className="tour-skip" onClick={end} data-testid="tour-skip">
              Skip tour
            </button>
            <span className="tour-spacer" />
            {step > 0 && (
              <button type="button" onClick={back} data-testid="tour-back">
                Back
              </button>
            )}
            <button type="button" className="primary" onClick={next} data-testid="tour-next">
              {last ? 'Done' : 'Next'}
            </button>
          </div>
          <Popover.Arrow className="tour-arrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
