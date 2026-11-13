import { useMemo } from 'react'
import { useEarthworks } from '../earthworks/useEarthworks'
import { usePlanStore } from '../../store/planStore'
import { codeCheck, type CodeRow } from './codeCheck'
import { limitText, PLANNING_AID_NOTE, ROUTE_UNCHECKED_NOTE, RULE_LIMITS, SHORE_LINE_NOTE } from './ruleSources'

/** The shortened old hint, a sentence a line. */
const HINT = [
  'Guards: 36 in on any open side more than 30 in up, with openings under 4 in.',
  'Handrails: 34–38 in on stairs with 4 or more risers and on ramps rising more than 6 in.',
  'In the shoreline buffer: only paths, stairs, ramps and structures under 30 in.',
] as const

const RULES_OFF_TEXT = 'This scheme sets the brief aside (rules off), so nothing is checked against it.'

/**
 * Code check · SJCC 18.50.540 (5E, old code check panel): a row per rule,
 * failing rows in the warning colour, and every object a row names a button
 * that selects it. Worked out from the plan, setbacks and lot only, so it
 * doesn't rerun on hover or pointer moves. It opens with the note that it is
 * a planning aid, not a code review, and lists each limit with its source or
 * "assumed" (review R2.7, R2.8); the site sheet prints the same words.
 */
export function CodeCheckPanel() {
  const plan = usePlanStore((s) => s.plan)
  const setbacks = usePlanStore((s) => s.setbacks)
  const site = usePlanStore((s) => s.site)
  const { ground: routeGround } = useEarthworks()
  const result = useMemo(
    () =>
      codeCheck({
        objects: plan.order.map((id) => plan.objects[id]).filter((o) => !!o),
        terrain: site.terrain,
        parcel: site.parcel,
        setbacks,
        schemeId: plan.schemeId,
        routeGround,
      }),
    [plan.order, plan.objects, plan.schemeId, site.terrain, site.parcel, setbacks, routeGround],
  )
  return (
    <section className="panel" aria-label="Code check" data-testid="code-check">
      <header>
        <strong>Code check · SJCC 18.50.540</strong>
      </header>
      <p className="small" data-testid="planning-aid">
        {PLANNING_AID_NOTE}
      </p>
      <p className="small muted" data-testid="route-unchecked">
        {ROUTE_UNCHECKED_NOTE}
      </p>
      <p className="small muted" data-testid="shore-line-note">
        {SHORE_LINE_NOTE}
      </p>
      {result.rulesOff && <p className="small muted">{RULES_OFF_TEXT}</p>}
      <ul className="int-program">
        {result.rows.map((r) => (
          <CodeRowItem key={r.id} row={r} />
        ))}
      </ul>
      {HINT.map((line) => (
        <p key={line} className="small muted">
          {line}
        </p>
      ))}
      <details className="small muted">
        <summary>Limits and their sources</summary>
        <ul>
          {RULE_LIMITS.map((l) => (
            <li key={l.id}>{limitText(l)}</li>
          ))}
        </ul>
      </details>
    </section>
  )
}

interface CodeRowItemProps {
  readonly row: CodeRow
}

const VERDICT_WORD = { pass: 'passes', fail: 'fails', note: 'note' } as const

function CodeRowItem({ row }: CodeRowItemProps) {
  const select = usePlanStore((s) => s.select)
  const cls = row.verdict === 'fail' ? 'miss' : row.verdict === 'pass' ? 'ok' : 'muted'
  return (
    <li className={cls} data-row={row.id} data-verdict={row.verdict}>
      <span className="sr-only">{VERDICT_WORD[row.verdict]}: </span>
      <strong>{row.label}</strong> · {row.text}
      {row.names.length > 0 && (
        <span>
          {row.names.map((n, i) => (
            <span key={`${n.id}-${i}`}>
              {' '}
              <button type="button" className="small" onClick={() => select([n.id])} title={`Select ${n.name}`}>
                {n.name}
              </button>
            </span>
          ))}
        </span>
      )}
    </li>
  )
}
