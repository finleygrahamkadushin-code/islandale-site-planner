import { levelReport } from '../../paths/junctions/levels'
import { reportRows, routeReport, type RouteReport } from '../../paths/route/routeVerdict'
import { named, type CheckContext, type CodeRow, type NamedObject } from './codeCheckTypes'

/**
 * The path rows of the code check, read from the 5C checks as the
 * Accessible route panel shows them: each building's route from the
 * parking, the path pieces' tally, and level floors and thresholds.
 */

// the route report is the costliest check; the route and pieces rows share one per context
const reports = new WeakMap<CheckContext, RouteReport>()
function reportOf(c: CheckContext): RouteReport {
  const hit = reports.get(c)
  if (hit) return hit
  const rep = routeReport(c.objects, c.terrain, c.routeGround)
  reports.set(c, rep)
  return rep
}

const namesOf = (c: CheckContext, ids: readonly string[]): NamedObject[] =>
  ids.flatMap((id) => {
    const o = c.objects.find((x) => x.id === id)
    return o ? [named(o)] : []
  })

export function routeRow(c: CheckContext): CodeRow {
  const rep = reportOf(c)
  const { route } = reportRows(rep)
  const label = 'Accessible route · ADA 402–405'
  const text = route.lines.join('; ')
  if (!rep.summary.n || !rep.routes.length) return { id: 'route', label, text, verdict: 'note', names: [] }
  const names = namesOf(c, rep.routes.filter((r) => !r.ok).map((r) => r.building))
  return { id: 'route', label, text, verdict: route.ok ? 'pass' : 'fail', names }
}

export function pathPiecesRow(c: CheckContext): CodeRow {
  const rep = reportOf(c)
  const { pieces } = reportRows(rep)
  const verdict = !rep.summary.n ? 'note' : pieces.ok ? 'pass' : 'fail'
  return { id: 'pieces', label: 'Path pieces', text: pieces.text, verdict, names: namesOf(c, rep.summary.failingIds) }
}

export function levelsRow(c: CheckContext): CodeRow {
  const reps = c.objects
    .filter((o) => o.type === 'house')
    .map((o) => ({ o, rep: levelReport(o, c.objects, c.terrain, c.routeGround) }))
  const steps = reps.filter((r) => !r.rep.ok)
  const label = 'Level floors & thresholds'
  if (!reps.length) return { id: 'levels', label, text: 'no buildings yet', verdict: 'note', names: [] }
  if (!steps.length) return { id: 'levels', label, text: 'all flush', verdict: 'pass', names: [] }
  const count = steps.reduce((s, r) => s + r.rep.items.length, 0)
  const text = `${count} step${count > 1 ? 's' : ''} found: ${steps.map((r) => r.rep.items.map((it) => `${r.o.name} · ${it.what}`).join('; ')).join('; ')}`
  return { id: 'levels', label, text, verdict: 'fail', names: steps.map((r) => named(r.o)) }
}
