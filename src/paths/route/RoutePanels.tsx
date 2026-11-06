import { isWalkToRebuild } from '../walks/rebuildWalks'
import { useMemo, useState } from 'react'
import type { PieceSpec } from '../connect/connectSpec'
import type { PieceSpec as RouteSpec } from './routeSpec'
import { isDriveway } from '../pieces'
import { autoRouteFromDriveway } from './routeAuto'
import { routeAnchors, routeItems, routeObstacles } from './routeCollect'
import { fixPiece } from './routeFix'
import { reportRows, routeReport, type RouteReport } from './routeVerdict'
import { snapTargets } from '../targets'
import { useEarthworks } from '../../site/earthworks/useEarthworks'
import { isObjectLocked, usePlanStore } from '../../store/planStore'
import type { NewPiece } from '../../store/pathActions'
import type { PlanObject } from '../../store/types'

const toNew = (s: PieceSpec | RouteSpec, name?: string): NewPiece => ({ kind: s.kind, name: name ?? ('name' in s ? s.name : undefined), position: s.position, rotation: s.rotation, w: s.w, d: s.d, ends: s.ends, surface: s.surface, lift: s.lift })

/** The accessible-route check for the whole site, kept in step with the plan. */
export function useRouteReport(): RouteReport {
  const plan = usePlanStore((s) => s.plan)
  const terrain = usePlanStore((s) => s.site.terrain)
  const { ground } = useEarthworks()
  return useMemo(() => routeReport(plan.order.map((id) => plan.objects[id]), terrain, ground), [plan, terrain, ground])
}

/**
 * The accessible route (old code check rows and Auto route panel): each
 * building's verdict from the parking (ADA 402–405), the path pieces'
 * tally, and Auto route, which lays pieces from the driveway to a
 * building's door as one undo step.
 */
export function RoutePanel() {
  const rep = useRouteReport()
  const rows = reportRows(rep)
  const plan = usePlanStore((s) => s.plan)
  const terrain = usePlanStore((s) => s.site.terrain)
  const applyPathEdit = usePlanStore((s) => s.applyPathEdit)
  const showToast = usePlanStore((s) => s.showToast)
  const { ground } = useEarthworks()
  const houses = plan.order.map((id) => plan.objects[id]).filter((o) => o?.type === 'house' && !o.hidden)
  const [to, setTo] = useState('')
  const rebuildWalks = usePlanStore((s) => s.rebuildWalks)
  const walksLeft = plan.order.filter((id) => plan.objects[id] && isWalkToRebuild(plan.objects[id])).length
  const auto = () => {
    const objects = plan.order.map((id) => plan.objects[id])
    const driveway = objects.find((o) => !o.hidden && isDriveway(o))
    const goal = routeAnchors(objects, terrain, ground, routeItems(objects, ground)).find((a) => a.building === (to || houses[0]?.id) && a.type === 'door')
    if (!driveway || !goal) {
      showToast(!driveway ? 'No driveway or parking pad to start from' : 'That building has no door to reach')
      return
    }
    const r = autoRouteFromDriveway(driveway, goal, ground, { obstacles: routeObstacles(objects, terrain, ground) })
    if (!r.pieces.length) {
      showToast(r.warnings[0] ?? 'No route found')
      return
    }
    const name = `Route to ${goal.name.split(' · ')[0]}`
    const ids = applyPathEdit(r.pieces.map((p, k) => toNew(p, `${name} · ${k + 1}`)))
    if (ids.length) showToast(`${name}: ${ids.length} piece${ids.length > 1 ? 's' : ''}${r.warnings.length ? ` · ${r.warnings[0]}` : ''}`)
  }
  return (
    <section className="panel" aria-label="Accessible route">
      <header>
        <strong>Accessible route · ADA 402–405</strong>
        <span className="muted small">Path pieces: {rows.pieces.text}</span>
      </header>
      <ul className="int-program" data-testid="route-rows">
        {rows.route.lines.map((line, i) => (
          <li key={i} className={rep.routes[i] ? (rep.routes[i].ok ? 'ok' : 'miss') : ''}>
            {line}
          </li>
        ))}
      </ul>
      {walksLeft > 0 && (
        <div className="rebuild-walks" data-testid="rebuild-walks">
          <p className="muted small">
            {walksLeft} {walksLeft === 1 ? 'walk is' : 'walks are'} drawn as plain pads, so the check can only guess where they start and stop. Rebuild them as path pieces
            (walks, ramps and stairs, joined to the doors, decks and parking they meet) for a true verdict. Undo goes back.
          </p>
          <button type="button" onClick={() => rebuildWalks()}>
            Rebuild walks as path pieces
          </button>
        </div>
      )}
      {houses.length > 0 && (
        <div className="row">
          <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Auto route to">
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
          <button onClick={auto} data-testid="auto-route">
            Auto route
          </button>
        </div>
      )}
    </section>
  )
}

/** One piece's verdict with its issues and a Fix for each (old piece check and Fix piece). */
export function PieceCheck({ o }: { readonly o: PlanObject }) {
  const rep = useRouteReport()
  const plan = usePlanStore((s) => s.plan)
  const terrain = usePlanStore((s) => s.site.terrain)
  const locked = usePlanStore((s) => isObjectLocked(s, o.id))
  const applyPathEdit = usePlanStore((s) => s.applyPathEdit)
  const showToast = usePlanStore((s) => s.showToast)
  const { ground } = useEarthworks()
  const v = rep.pieces.get(o.id)
  if (!v) return null
  const fix = (k: number) => {
    const issue = v.issues[k]
    const targets = snapTargets(plan.order.map((id) => plan.objects[id]), terrain, ground, o.id)
    const f = fixPiece(o, issue, { ground, targets })
    if (!f) {
      showToast('No one-click fix for that')
      return
    }
    applyPathEdit(f.add.map((s) => toNew(s)), [{ id: o.id, params: f.params as Record<string, unknown>, position: f.position, rotation: f.rotation }])
    if (f.note) showToast(f.note)
  }
  return (
    <div className="piece-check" data-testid="piece-check">
      <p className={`small fixture-note ${v.verdict === 'pass' ? 'ok' : v.verdict === 'fail' ? 'bad' : 'muted'}`}>
        Accessible route: {v.verdict === 'pass' ? 'passes' : v.verdict === 'fail' ? 'fails' : (v.note ?? 'not checked')}
      </p>
      {v.issues.map((it, k) => (
        <p key={k} className="small">
          {it.text}{' '}
          <button className="small" disabled={locked} onClick={() => fix(k)} data-testid="piece-fix">
            Fix
          </button>
        </p>
      ))}
    </div>
  )
}
