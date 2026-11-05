import type { ReactNode } from 'react'
import { tileDrawing } from './tiles'
import { MARGIN_IN, PAPERS, SCALE_LABEL, TITLE_IN, type PaperId, type Scale, type Tile } from './types'
import { ptToFt } from './svgDims'
import { Tip } from '../../guide/Tip'

/** What every sheet of one drawing shares in its title strip. */
export interface SheetInfo {
  readonly paper: PaperId
  readonly scale: Scale
  readonly planName: string
  readonly buildingName: string
  readonly sheetTitle: string
  /** Degrees clockwise from up that site north points; null leaves the arrow off. */
  readonly northDeg?: number | null
}

interface PageProps extends SheetInfo {
  readonly tileLabel?: string
  /** Grow past one sheet instead of clipping (tables that run on); the printer breaks it. */
  readonly flow?: boolean
  readonly children: ReactNode
}

const TODAY = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

/** One printed sheet at its true size: margins, the drawing area, and the title strip. */
export function Page({ paper, scale, planName, buildingName, sheetTitle, northDeg = null, tileLabel, flow, children }: PageProps) {
  const p = PAPERS[paper]
  const size = flow ? { width: `${p.w}in`, minHeight: `${p.h}in` } : { width: `${p.w}in`, height: `${p.h}in` }
  return (
    <section className={`sheet-page${flow ? ' flow' : ''}`} style={{ ...size, padding: `${MARGIN_IN}in` }} aria-label={`${buildingName}: ${sheetTitle}${tileLabel ? `, ${tileLabel}` : ''}`}>
      {/* a tile sits in the top-left corner so sheets taped edge to edge line up */}
      <div className={`sheet-draw${tileLabel ? ' tiled' : ''}`}>{children}</div>
      <footer className="sheet-title" style={{ height: `${TITLE_IN}in` }}>
        <div className="sheet-title-names">
          <span className="sheet-plan">{planName}</span>
          <strong className="sheet-building">{buildingName}</strong>
          <span className="sheet-name">{sheetTitle}</span>
        </div>
        <div className="sheet-title-facts">
          {tileLabel && <span>{tileLabel}</span>}
          <span>Scale {SCALE_LABEL[scale]}</span>
          <span>{TODAY}</span>
          <span>Islandale Site Planner</span>
        </div>
        <div className="sheet-title-checks">
          <Tip label="Measure this with a ruler: it should be exactly 1 inch">
            <div className="sheet-inch">
              <span className="sheet-inch-bar" style={{ width: '1in' }} />
              <span>1 in</span>
            </div>
          </Tip>
          <ScaleBar scale={scale} />
        </div>
        {northDeg !== null && <NorthArrow deg={northDeg} />}
      </footer>
    </section>
  )
}

/** A graphic scale, 0–4–8–16 ft (0–2–4–8 ft at 1/2"), drawn in paper points. */
function ScaleBar({ scale }: { readonly scale: Scale }) {
  const marks = scale >= 0.5 ? [0, 2, 4, 8] : [0, 4, 8, 16]
  const total = marks[marks.length - 1]
  const pt = (ft: number) => ft * scale * 72
  const w = pt(total)
  return (
    <svg className="sheet-scalebar" width={`${(w + 24) / 72}in`} height={`${26 / 72}in`} viewBox={`-6 0 ${w + 24} 26`} role="img" aria-label={`Scale bar, 0 to ${total} feet`}>
      {marks.slice(1).map((m, i) => (
        <rect key={m} x={pt(marks[i])} y={4} width={pt(m - marks[i])} height={5} fill={i % 2 ? '#fff' : '#000'} stroke="#000" strokeWidth={0.6} />
      ))}
      {marks.map((m) => (
        <text key={m} x={pt(m)} y={20} fontSize={7} textAnchor="middle">
          {m === total ? `${m} ft` : m}
        </text>
      ))}
    </svg>
  )
}

function NorthArrow({ deg }: { readonly deg: number }) {
  return (
    <svg className="sheet-north" width="0.55in" height="0.75in" viewBox="-20 -24 40 54" role="img" aria-label="North arrow">
      <g transform={`rotate(${deg})`}>
        <circle r={14} fill="none" stroke="#000" strokeWidth={0.8} />
        <path d="M0 -18 L6 8 L0 3 L-6 8 Z" fill="#000" />
      </g>
      <text y={28} fontSize={9} fontWeight={700} textAnchor="middle">
        N
      </text>
    </svg>
  )
}

/** A drawing's box, feet, in its own SVG frame. */
export interface Extent {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

interface TiledProps {
  readonly info: SheetInfo
  readonly extent: Extent
  /** The drawing, in feet; drawn once per tile. */
  readonly children: ReactNode
  readonly label: string
}

/** A drawing at true scale on as many sheets as it needs, each with corner marks to tape them together. */
export function TiledDrawing({ info, extent, children, label }: TiledProps) {
  const tiles = tileDrawing(extent.w, extent.h, info.paper, info.scale)
  const rows = Math.max(...tiles.map((t) => t.row)) + 1
  const cols = Math.max(...tiles.map((t) => t.col)) + 1
  const many = tiles.length > 1
  return (
    <>
      {tiles.map((t) => (
        <Page key={t.label} {...info} tileLabel={many ? `Sheet ${t.label} of ${rows} × ${cols}` : undefined}>
          <svg
            className="sheet-svg"
            width={`${t.w * info.scale}in`}
            height={`${t.h * info.scale}in`}
            viewBox={`${extent.x + t.x} ${extent.y + t.y} ${t.w} ${t.h}`}
            role="img"
            aria-label={label}
            fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
          >
            {children}
            {many && <CropMarks tile={t} extent={extent} scale={info.scale} />}
          </svg>
        </Page>
      ))}
    </>
  )
}

/** L-shaped marks just inside each tile corner, and its label, for lining up taped sheets. */
function CropMarks({ tile, extent, scale }: { readonly tile: Tile; readonly extent: Extent; readonly scale: Scale }) {
  const x0 = extent.x + tile.x
  const y0 = extent.y + tile.y
  const x1 = x0 + tile.w
  const y1 = y0 + tile.h
  const l = 0.3 / scale
  const sw = ptToFt(0.5, scale)
  const corners: readonly (readonly [number, number, number, number])[] = [
    [x0, y0, 1, 1],
    [x1, y0, -1, 1],
    [x0, y1, 1, -1],
    [x1, y1, -1, -1],
  ]
  return (
    <g stroke="#000" strokeWidth={sw} fill="none">
      {corners.map(([x, y, sx, sy]) => (
        <path key={`${x},${y}`} d={`M${x + sx * l} ${y} L${x} ${y} L${x} ${y + sy * l}`} />
      ))}
      <text x={x0 + l * 1.2} y={y0 + l} fontSize={ptToFt(7, scale)} stroke="none" fill="#000">
        {tile.label}
      </text>
    </g>
  )
}
