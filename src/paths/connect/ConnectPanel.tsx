import { useMemo } from 'react'
import { connectPlan, type ConnectOption } from './connectPlan'
import { usePlanStore } from '../../store/planStore'
import { useEarthworks } from '../../site/earthworks/useEarthworks'
import { Tip } from '../../guide/Tip'
import { FT_PER_M as M_TO_FT } from '../../site/units'

/**
 * The Connect tool's panel (old connect popover): which end to pick next,
 * then the ways to join the two (walk, boardwalk, ramp, stair) with their
 * check, and Build, which adds the pieces as one undo step.
 */
export function ConnectPanel() {
  const c = usePlanStore((s) => s.connecting)
  const setConnecting = usePlanStore((s) => s.setConnecting)
  const applyPathEdit = usePlanStore((s) => s.applyPathEdit)
  const showToast = usePlanStore((s) => s.showToast)
  const { ground } = useEarthworks()
  const plan = useMemo(() => (c?.A && c.B ? connectPlan(c.A, c.B, ground, { widthFt: c.widthFt }) : null), [c, ground])
  if (!c) return null
  const build = (op: ConnectOption) => {
    const to = (c.B?.label ?? 'B').split(' · ')[0]
    const ids = applyPathEdit(
      op.specs.map((s, k) => ({ kind: s.kind, name: `${op.title} to ${to}${op.specs.length > 1 ? ` · ${k + 1}` : ''}`, position: s.position, rotation: s.rotation, w: s.w, d: s.d, ends: s.ends, surface: s.surface, lift: s.lift })),
    )
    if (ids.length) {
      showToast(`${op.title}: ${op.label}`)
      setConnecting(null)
    }
  }
  const dz = plan?.dzM ?? 0
  return (
    <section className="panel" aria-label="Connect">
      <header>
        <strong>Connect</strong>
      </header>
      {!c.A && <p className="small">Pick the first end: a door, deck edge, stair foot, path end or driveway edge.</p>}
      {c.A && !c.B && (
        <p className="small">
          From <b>{c.A.label}</b>. Pick the second end.
        </p>
      )}
      {plan && (
        <>
          <p className="small">
            <b>{c.A?.label}</b> → <b>{c.B?.label}</b>
            <br />
            {Math.round(plan.distM * M_TO_FT)} ft apart · {Math.abs(dz) < 0.013 ? 'same level' : `B is ${(Math.abs(dz) * M_TO_FT).toFixed(1)} ft ${dz > 0 ? 'higher' : 'lower'}`}
          </p>
          <div className="connect-options">
            {plan.options.map((op) => (
              <Tip key={op.id} label={op.why}>
                <button className={`${op.ok ? 'ok' : 'fail'}${plan.best === op.id ? ' on' : ''}`} disabled={op.disabled || !op.specs.length} data-testid={`connect-${op.id}`} onClick={() => build(op)}>
                  <b>{op.title}</b> <span className="small">{op.label}</span>
                </button>
              </Tip>
            ))}
          </div>
        </>
      )}
      <label className="field">
        <span className="muted small">Width, ft</span>
        <input type="number" min={3} max={10} step={0.5} value={c.widthFt} onChange={(e) => setConnecting({ ...c, widthFt: Math.max(3, Math.min(10, Number(e.target.value) || 4)) })} />
      </label>
      <div className="row">
        <button onClick={() => setConnecting({ ...c, A: null, B: null })}>Start again</button>
        <button onClick={() => setConnecting(null)}>Done (Esc)</button>
      </div>
    </section>
  )
}
