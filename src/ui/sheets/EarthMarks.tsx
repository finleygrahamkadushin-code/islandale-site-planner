import type { SheetEarthworks } from '../../export/sheets/types'
import type { EarthPlan } from './earthLayout'
import { pts } from './planMarks'
import type { Pen } from './planLayout'

/** Site linework is drawn in this grey, under the building's black. */
const SITE_INK = '#555'
const WALL_FILL = '#d9d9d6'

const segPath = (segs: SheetEarthworks['fillLimit']) => segs.map(([a, b]) => `M${a[0]} ${a[1]} L${b[0]} ${b[1]}`).join(' ')

/** The ground work round a building, under its walls: limits of fill and cut, courts, berm crests and retaining walls. */
export function EarthLines({ earth, plan, pen }: { readonly earth: SheetEarthworks; readonly plan: EarthPlan; readonly pen: Pen }) {
  const dash = pen.text * 0.6
  return (
    <g fill="none" stroke={SITE_INK} aria-label="Earthworks">
      {earth.fillLimit.length > 0 && <path d={segPath(earth.fillLimit)} strokeWidth={pen.thin} strokeDasharray={`${dash} ${dash * 0.6}`} />}
      {earth.cutLimit.length > 0 && <path d={segPath(earth.cutLimit)} strokeWidth={pen.thin} strokeDasharray={`${dash} ${dash * 0.4} ${dash * 0.15} ${dash * 0.4}`} />}
      {earth.courts.map((c, i) => (
        <polygon key={`c${i}`} points={pts(c.outline)} strokeWidth={pen.hair} strokeDasharray={`${dash * 0.4} ${dash * 0.4}`} />
      ))}
      {earth.berms.map((m, i) => (
        <polyline key={`b${i}`} points={pts(m.crest)} strokeWidth={pen.medium} />
      ))}
      {plan.walls.map((band, i) => (
        <polygon key={`w${i}`} points={pts(band)} fill={WALL_FILL} stroke="#000" strokeWidth={pen.medium} strokeLinejoin="round" />
      ))}
    </g>
  )
}

/** The earthworks' tags, lengths and spot heights, over everything. */
export function EarthLabels({ plan, pen }: { readonly plan: EarthPlan; readonly pen: Pen }) {
  return (
    <g fill="#000" stroke="none">
      {plan.labels.map((l, i) => {
        const size = pen[l.size]
        const top = -((l.lines.length - 1) * size * 1.2) / 2
        return (
          <text key={i} x={l.at[0]} y={l.at[1]} transform={`rotate(${l.angleDeg} ${l.at[0]} ${l.at[1]})`} fontSize={size} textAnchor="middle" dominantBaseline="central">
            {l.lines.map((line, k) => (
              <tspan key={k} x={l.at[0]} dy={k === 0 ? top : size * 1.2}>
                {line}
              </tspan>
            ))}
          </text>
        )
      })}
    </g>
  )
}
