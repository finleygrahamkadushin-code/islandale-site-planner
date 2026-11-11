import { useEffect, useRef } from 'react'
import { invalidate } from '@react-three/fiber'
import { Camera, LogOut, Pause, Play, Rotate3d } from 'lucide-react'
import { usePlanStore } from '../store/planStore'
import { SAVED_VIEWS } from '../scene/views'
import { SEASONS } from '../site/environment/sun'
import { Tip } from '../guide/Tip'
import { usePresent, useSunHour } from './present'
import { useViewHud } from './viewState'
import { clockText, hourAt, playLength } from './sunTimeline'

const reducedMotion = (): boolean => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** Runs the sun animation while it plays: one preview hour per frame, then stops at golden hour. */
function useSunPlayer(): void {
  const playing = usePresent((s) => s.playing)
  const elapsed = useRef(0)
  useEffect(() => {
    if (!playing) return
    const reduced = reducedMotion()
    const length = playLength(reduced)
    if (elapsed.current >= length) elapsed.current = 0
    let last = performance.now()
    let raf = requestAnimationFrame(function tick(now) {
      elapsed.current = Math.min(length, elapsed.current + (now - last) / 1000)
      last = now
      const p = usePresent.getState()
      p.setPreviewHour(hourAt(elapsed.current, reduced))
      // the view draws on demand: one frame for each step of the sun (R8.1)
      invalidate()
      if (elapsed.current >= length) return p.pause()
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [playing])
  // a fresh start each time Present is entered
  const presenting = usePresent((s) => s.presenting)
  useEffect(() => {
    if (presenting) elapsed.current = 0
  }, [presenting])
}

/** Real full screen while presenting where the browser allows it; leaving full screen leaves Present. */
function useFullScreen(): void {
  const presenting = usePresent((s) => s.presenting)
  useEffect(() => {
    if (!presenting) return
    const root = document.documentElement
    let wentFull = false
    const onChange = () => {
      if (document.fullscreenElement) wentFull = true
      else if (wentFull) usePresent.getState().leave()
    }
    document.addEventListener('fullscreenchange', onChange)
    // refused in a frame without permission (the hosted home): the app just fills the window
    root.requestFullscreen?.().catch(() => undefined)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
    }
  }, [presenting])
}

/** Present mode's controls (4D): the saved views, the sun, the slow orbit, a picture, and Leave. */
export function PresentBar() {
  const presenting = usePresent((s) => s.presenting)
  useSunPlayer()
  useFullScreen()
  if (!presenting) return null
  return <Bar />
}

function Bar() {
  const { playing, orbit } = usePresent()
  const { play, pause, setOrbit, leave } = usePresent.getState()
  const hour = useSunHour()
  const season = usePlanStore((s) => s.environment.season)
  const seasonLabel = SEASONS.find((x) => x.id === season)?.label ?? ''
  const requestView = usePlanStore((s) => s.requestView)
  const current = usePlanStore((s) => s.viewRequest?.id)
  const snapshot = useViewHud((s) => s.snapshot)
  return (
    <div className="present-bar" role="toolbar" aria-label="Present" data-testid="present-bar">
      <nav className="present-views" aria-label="Saved views">
        {SAVED_VIEWS.map((v) => (
          <Tip key={v.id} label={v.hint} side="top">
            <button type="button" className={current === v.id ? 'on' : ''} aria-pressed={current === v.id} onClick={() => requestView(v.id)} data-testid={`present-view-${v.id}`}>
              {v.label}
            </button>
          </Tip>
        ))}
      </nav>
      <div className="present-controls">
        <Tip label={playing ? 'Pause the sun' : 'Play the sun from morning to golden hour'} side="top">
          <button type="button" className="icon-only" aria-label={playing ? 'Pause the sun' : 'Play the sun'} onClick={playing ? pause : play} data-testid="present-play">
            {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
          </button>
        </Tip>
        <span className="present-clock" data-testid="present-clock" aria-live="off">
          {clockText(hour)}
          <span className="muted"> · {seasonLabel}</span>
        </span>
        <Tip label="Turn slowly around the view (drag to stop)" side="top">
          <button type="button" className={`icon-only${orbit ? ' on' : ''}`} aria-pressed={orbit} aria-label="Slow orbit" onClick={() => setOrbit(!orbit)} data-testid="present-orbit">
            <Rotate3d size={18} aria-hidden="true" />
          </button>
        </Tip>
        <Tip label="Save a picture of this view" side="top">
          <button type="button" className="icon-only" aria-label="Save a picture of this view" onClick={snapshot} data-testid="present-snapshot">
            <Camera size={18} aria-hidden="true" />
          </button>
        </Tip>
        <Tip label="Leave Present" keyHint="Esc" side="top">
          <button type="button" className="present-leave" onClick={leave} data-testid="present-leave">
            <LogOut size={16} aria-hidden="true" /> Leave
          </button>
        </Tip>
      </div>
    </div>
  )
}
