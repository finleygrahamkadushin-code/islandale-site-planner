import { useMemo } from 'react'
import { useEarthworks } from '../earthworks/useEarthworks'
import { usePlanStore } from '../../store/planStore'
import { codeCheck, type CodeRow } from './codeCheck'

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
 * doesn't rerun on hover or pointer moves.
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
