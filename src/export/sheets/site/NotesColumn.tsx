/**
 * The site plan's notes column: the lot facts, the setbacks in force, the
 * program budget, the clearances, the code check, and a legend of every
 * line and tone on the drawing, drawn with the drawing's own pens.
 */
import type { CSSProperties, ReactNode } from 'react'
import { VERDICT_TEXT, type NoteBlock, type SiteNotes as Notes } from './siteNotes'
import { INK } from './SiteMarks'

const SEASON_NAME = { jun: 'June 21', sep: 'September 22', dec: 'December 21' } as const

/** 2 pm, 9:30 am: the Sun and tide panel's hour as a clock reads it. */
export function clockText(hour: number): string {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  const h12 = ((h + 11) % 12) + 1
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`
}

const S = {
  col: { display: 'flex', flexDirection: 'column', gap: '0.06in', fontSize: '6.3pt', lineHeight: 1.2, color: '#111' },
  block: { breakInside: 'avoid' },
  caption: { fontSize: '7.4pt', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '0.6pt solid #111', paddingBottom: '0.015in', marginBottom: '0.025in' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', fontWeight: 400, color: '#333', padding: '0.008in 0.06in 0.008in 0', verticalAlign: 'top', whiteSpace: 'nowrap' },
  td: { textAlign: 'left', padding: '0.008in 0', verticalAlign: 'top' },
  small: { fontSize: '5.6pt', color: '#333', margin: '0.02in 0 0' },
  verdict: { fontWeight: 700, fontSize: '5.8pt', letterSpacing: '0.05em', padding: '0.012in 0.05in 0.008in 0', verticalAlign: 'top', whiteSpace: 'nowrap' },
} satisfies Record<string, CSSProperties>

function Block({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section style={S.block} aria-label={title}>
      <div style={S.caption}>{title}</div>
      {children}
    </section>
  )
}

function Rows({ block }: { readonly block: NoteBlock }) {
  return (
    <Block title={block.title}>
      <table style={S.table} data-notes={block.id}>
        <tbody>
          {block.rows.map((r, i) => (
            <tr key={i}>
              <th scope="row" style={S.th}>
                {r.label}
              </th>
              <td style={{ ...S.td, fontWeight: r.flag === 'over' || r.flag === 'warn' ? 700 : 400 }} data-flag={r.flag}>
                {r.value}
                {(r.flag === 'over' || r.flag === 'warn') && ' ⚠'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {block.notes.map((n) => (
        <p key={n} style={S.small}>
          {n}
        </p>
      ))}
    </Block>
  )
}

function CodeCheck({ code }: { readonly code: Notes['code'] }) {
  return (
    <Block title={code.title}>
      <table style={S.table} data-notes="code">
        <tbody>
          {code.rows.map((r) => (
            <tr key={r.id} data-row={r.id} data-verdict={r.verdict}>
              <td style={{ ...S.verdict, color: r.verdict === 'note' ? '#555' : '#111' }}>{VERDICT_TEXT[r.verdict]}</td>
              <td style={S.td}>
                <strong>{r.label}</strong> · {r.text}
                {/* the names the panel shows as buttons, unless the row's text already says them */}
                {r.names.some((n) => !r.text.includes(n)) && <span style={{ color: '#333' }}> ({r.names.filter((n) => !r.text.includes(n)).join(', ')})</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {code.notes.map((n) => (
        <p key={n} style={S.small}>
          {n}
        </p>
      ))}
    </Block>
  )
}

/** One legend swatch: a short run of the line or tone as the drawing draws it, 0.42 in wide. */
function Swatch({ children }: { readonly children: ReactNode }) {
  return (
    <svg width="0.42in" height="0.13in" viewBox="0 0 42 13" aria-hidden="true" style={{ display: 'block', flex: 'none' }}>
      {children}
    </svg>
  )
}

/** Legend pens in swatch units (1 unit = 1/100 in): points × 100 / 72. */
const pt = (p: number) => (p * 100) / 72

const LEGEND: readonly { readonly label: string; readonly swatch: ReactNode }[] = [
  { label: 'Lot line', swatch: <line x1={1} y1={6.5} x2={41} y2={6.5} stroke={INK.line} strokeWidth={pt(1.3)} strokeDasharray={`${pt(14)} ${pt(2.5)} ${pt(2)} ${pt(2.5)}`} /> },
  { label: 'Shoreline (OHWM)', swatch: <line x1={1} y1={6.5} x2={41} y2={6.5} stroke={INK.line} strokeWidth={pt(0.9)} /> },
  {
    label: 'Top of bank',
    swatch: (
      <g stroke={INK.line}>
        <line x1={1} y1={4} x2={41} y2={4} strokeWidth={pt(0.6)} />
        {[5, 13, 21, 29, 37].map((x, i) => (
          <line key={x} x1={x} y1={4} x2={x} y2={i % 2 ? 8 : 11} strokeWidth={pt(0.25)} />
        ))}
      </g>
    ),
  },
  { label: 'Shoreline buffer line', swatch: <line x1={1} y1={6.5} x2={41} y2={6.5} stroke={INK.line} strokeWidth={pt(0.6)} strokeDasharray={`${pt(12)} ${pt(2.7)}`} /> },
  { label: 'Side and rear setback', swatch: <line x1={1} y1={6.5} x2={41} y2={6.5} stroke={INK.mid} strokeWidth={pt(0.4)} strokeDasharray={`${pt(5)} ${pt(2.5)}`} /> },
  { label: 'Tree protection zone', swatch: <line x1={2} y1={6.5} x2={41} y2={6.5} stroke={INK.soft} strokeWidth={pt(0.4)} strokeLinecap="round" strokeDasharray={`0 ${pt(1.1)}`} /> },
  {
    label: 'In the shoreline buffer',
    swatch: (
      <g stroke={INK.hatch} strokeWidth={pt(0.25)}>
        {[-8, -2, 4, 10, 16, 22, 28, 34, 40].map((x) => (
          <line key={x} x1={x} y1={13} x2={x + 13} y2={0} />
        ))}
      </g>
    ),
  },
  {
    label: 'In the side setback',
    swatch: (
      <g stroke={INK.hatchLight} strokeWidth={pt(0.25)}>
        {[0, 8, 16, 24, 32, 40, 48].map((x) => (
          <line key={x} x1={x} y1={13} x2={x - 13} y2={0} />
        ))}
      </g>
    ),
  },
  {
    label: 'Contours, 2 ft (10 ft index)',
    swatch: (
      <g fill="none">
        <path d="M1 9 C12 5 28 11 41 6" stroke={INK.mid} strokeWidth={pt(0.4)} />
        <path d="M1 4 C12 1 28 7 41 2" stroke={INK.faint} strokeWidth={pt(0.25)} />
      </g>
    ),
  },
  {
    label: 'Roof: eave, ridge, hidden walls',
    swatch: (
      <g fill="none">
        <rect x={2} y={1.5} width={38} height={10} fill="#fff" stroke={INK.line} strokeWidth={pt(1.3)} />
        <line x1={6} y1={6.5} x2={36} y2={6.5} stroke={INK.line} strokeWidth={pt(0.6)} />
        <rect x={6} y={3.5} width={30} height={6} stroke={INK.mid} strokeWidth={pt(0.25)} strokeDasharray="2.5 1.5" />
      </g>
    ),
  },
  { label: 'Deck or porch', swatch: <rect x={2} y={2} width={38} height={9} fill={INK.deck} stroke={INK.line} strokeWidth={pt(0.4)} /> },
  { label: 'Shadow', swatch: <rect x={2} y={2} width={38} height={9} fill={INK.shadow} /> },
  {
    label: 'Clearance (inspector’s)',
    swatch: (
      <g fill={INK.line} stroke={INK.line} strokeWidth={pt(0.25)}>
        <line x1={4} y1={6.5} x2={38} y2={6.5} />
        <polygon points="1,6.5 6,4.8 6,8.2" stroke="none" />
        <polygon points="41,6.5 36,4.8 36,8.2" stroke="none" />
      </g>
    ),
  },
]

function Legend() {
  return (
    <Block title="Legend">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '0.12in', rowGap: '0.03in' }}>
        {LEGEND.map((l) => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '0.05in' }}>
            <Swatch>{l.swatch}</Swatch>
            <span>{l.label}</span>
          </div>
        ))}
      </div>
    </Block>
  )
}

export interface SiteNotesProps {
  readonly notes: Notes
  readonly sun: { readonly season: keyof typeof SEASON_NAME; readonly hour: number; readonly up: boolean }
  /** Lay the notes out in columns across a page of their own, instead of one column beside the drawing. */
  readonly columns?: number
  readonly widthIn: number
}

/** The notes, in one column beside the drawing or in several across a page of their own. */
export function SiteNotesColumn({ notes, sun, columns = 1, widthIn }: SiteNotesProps) {
  const lot = notes.blocks.find((b) => b.id === 'lot')
  const rest = notes.blocks.filter((b) => b.id !== 'lot')
  const style: CSSProperties = columns > 1 ? { ...S.col, display: 'block', columnCount: columns, columnGap: '0.3in', width: `${widthIn}in` } : { ...S.col, width: `${widthIn}in` }
  const gap = columns > 1 ? { marginBottom: '0.09in' } : undefined
  return (
    <div className="site-notes" style={style} data-testid="site-notes">
      {[lot, ...rest].filter((b): b is NoteBlock => !!b).map((b) => (
        <div key={b.id} style={gap}>
          <Rows block={b} />
        </div>
      ))}
      <div style={gap}>
        <CodeCheck code={notes.code} />
      </div>
      <div style={gap}>
        <Legend />
      </div>
      <p style={{ ...S.small, ...gap }}>
        Elevations in feet, NAVD88. Contours every 2 ft from the survey grid, with the reshaped ground inside earthworks.
        {sun.up ? ` Shadows: ${SEASON_NAME[sun.season]}, ${clockText(sun.hour)}, as set in Sun and tide.` : ' No shadows: the sun is down at the hour set in Sun and tide.'}
      </p>
    </div>
  )
}
