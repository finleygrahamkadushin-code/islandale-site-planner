import type { SheetSupport } from '../../export/sheets/types'
import type { Pen } from './planLayout'

/** What stands under the floor is drawn in this grey, under the building's black. */
const SUPPORT_INK = '#555'
const POST_FILL = '#bdbdbb'

/** One support's pieces in plan: beams dashed, then the struts and stilts, the mast, each footing, and every post, pier and pile at its section. */
function SupportPlan({ support: s, pen }: { readonly support: SheetSupport; readonly pen: Pen }) {
  const dash = `${pen.text * 0.8} ${pen.text * 0.4}`
  const fine = `${pen.text * 0.35} ${pen.text * 0.3}`
  const half = (s.section?.sizeFt ?? 0) / 2
  const footing = (s.footingDiameterFt ?? 0) / 2
  return (
    <g>
      {s.beams.map(([a, b], i) => (
        <line key={`b${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} strokeWidth={pen.thin} strokeDasharray={dash} />
      ))}
      {s.struts.map((t, i) => (
        <line key={`s${i}`} x1={t.a[0]} y1={t.a[1]} x2={t.b[0]} y2={t.b[1]} strokeWidth={pen.hair} strokeDasharray={s.mast ? fine : undefined} />
      ))}
      {!s.mast && footing > 0 && s.struts.map((t, i) => <circle key={`f${i}`} cx={t.b[0]} cy={t.b[1]} r={footing} strokeWidth={pen.hair} strokeDasharray={fine} />)}
      {s.mast && (
        <>
          <circle cx={s.mast.at[0]} cy={s.mast.at[1]} r={s.mast.headDiameterFt / 2} strokeWidth={pen.thin} strokeDasharray={dash} />
          <circle cx={s.mast.at[0]} cy={s.mast.at[1]} r={s.mast.footDiameterFt / 2} fill={POST_FILL} strokeWidth={pen.thin} />
        </>
      )}
      {half > 0 &&
        s.posts.map(({ at: [x, z] }, i) =>
          s.section?.round ? (
            <circle key={`p${i}`} cx={x} cy={z} r={half} fill={POST_FILL} strokeWidth={pen.thin} />
          ) : (
            <rect key={`p${i}`} x={x - half} y={z - half} width={half * 2} height={half * 2} transform={`rotate(${s.axisDeg} ${x} ${z})`} fill={POST_FILL} strokeWidth={pen.thin} />
          ),
        )}
    </g>
  )
}

/** Everything the parts stand on, under the floor, in grey. */
export function SupportMarks({ supports, pen }: { readonly supports: readonly SheetSupport[]; readonly pen: Pen }) {
  return (
    <g fill="none" stroke={SUPPORT_INK} aria-label="Supports">
      {supports.map((s) => (
        <SupportPlan key={s.massIndex} support={s} pen={pen} />
      ))}
    </g>
  )
}
