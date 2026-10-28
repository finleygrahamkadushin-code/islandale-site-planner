import type { OpeningPiece, PlacedOpening } from '../buildings/openingLayout'
import { ftToM } from '../site/units'
import type { DisplayStyle } from '../store/types'
import { Surface } from './Surface'

/** How far the casing stands off the wall face: flush trim, not a box frame. */
const TRIM_DEPTH_M = 0.03
/** The glass and door panel sit just off the wall, inside the casing. */
const PANEL_M = 0.008
const MULLION_M = 0.045
/** A casing this narrow is drawn even when trim is set to 0, so the opening still reads. */
const MIN_FRAME_M = 0.035
const SILL_DEPTH_M = 0.07
const DOOR_LITE_M = 0.02
const CONFLICT_COLOUR = '#c0392b'

interface Props {
  readonly op: PlacedOpening
  readonly style: DisplayStyle
  /** Outline the opening when it is picked in the Openings panel. */
  readonly highlight?: boolean
}

/**
 * An opening laid on the wall face: glass, a door panel or a dark cut-out,
 * with a flush casing whose four sides meet at the corners (head and sill
 * run the full width, the jambs fit between them), mullions, and a window
 * sill tucked under the casing. Along-cuts are drawn piece by piece with
 * jambs only at their ends and at sharp corners.
 */
export function OpeningMesh({ op, style, highlight = false }: Props) {
  if (op.hidden) return null
  return (
    <>
      {op.pieces.map((p, i) => (
        <PieceMesh key={i} op={op} p={p} style={style} highlight={highlight} />
      ))}
    </>
  )
}

function PieceMesh({ op, p, style, highlight }: { readonly op: PlacedOpening; readonly p: OpeningPiece; readonly style: DisplayStyle; readonly highlight: boolean }) {
  const w = ftToM(p.w)
  const h = ftToM(op.h)
  const trim = Math.max(MIN_FRAME_M, ftToM(op.trim))
  const pos: [number, number, number] = [ftToM(p.centre[0]), ftToM(p.centre[1]), ftToM(p.centre[2])]
  const yaw = Math.atan2(p.normal[0], p.normal[1])
  const frameColour = op.conflict ? CONFLICT_COLOUR : undefined
  const glow = highlight ? 1 : 0
  // a casing below the opening only where it clears the floor; doors and sliders sit on the slab
  const hasBottom = op.kind === 'window' || op.kind === 'cutout' ? ftToM(op.sill) >= trim : false
  // seen from outside, the piece's right end is local +x
  const left = p.jambLeft ? trim : 0
  const right = p.jambRight ? trim : 0
  const outerW = w + left + right
  const midX = (right - left) / 2

  const bar = (x: number, y: number, bw: number, bh: number, key: string, depth = TRIM_DEPTH_M) => (
    <mesh key={key} position={[x, y, depth / 2]} castShadow>
      <boxGeometry args={[bw, bh, depth]} />
      <Surface kind="frame" style={style} color={frameColour} glow={glow} layer={2} />
    </mesh>
  )

  const mullions = []
  for (let k = 1; k <= op.mullV; k++) mullions.push(bar(-w / 2 + (w * k) / (op.mullV + 1), 0, MULLION_M, h, `mv${k}`, TRIM_DEPTH_M * 0.7))
  for (let k = 1; k <= op.mullH; k++) mullions.push(bar(0, -h / 2 + (h * k) / (op.mullH + 1), w, MULLION_M, `mh${k}`, TRIM_DEPTH_M * 0.7))

  return (
    <group position={pos} rotation={[0, yaw, 0]}>
      {op.kind === 'door' ? (
        <>
          <mesh position={[0, 0, PANEL_M]}>
            <planeGeometry args={[w, h]} />
            <Surface kind="door" style={style} layer={1} />
          </mesh>
          <mesh position={[0, h * 0.18, PANEL_M + DOOR_LITE_M]}>
            <planeGeometry args={[w * 0.32, h * 0.45]} />
            <Surface kind="glass" style={style} layer={1} />
          </mesh>
        </>
      ) : op.kind === 'cutout' ? (
        <mesh position={[0, 0, PANEL_M]}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial color="#1b1d1e" polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        </mesh>
      ) : (
        <mesh position={[0, 0, PANEL_M]}>
          <planeGeometry args={[w, h]} />
          <Surface kind="glass" style={style} layer={1} />
        </mesh>
      )}
      {bar(midX, h / 2 + trim / 2, outerW, trim, 'head')}
      {hasBottom && bar(midX, -h / 2 - trim / 2, outerW, trim, 'bottom')}
      {p.jambLeft && bar(-w / 2 - trim / 2, 0, trim, h, 'left')}
      {p.jambRight && bar(w / 2 + trim / 2, 0, trim, h, 'right')}
      {op.kind !== 'cutout' && mullions}
      {op.kind === 'window' && hasBottom && (
        <mesh position={[midX, -h / 2 - trim - 0.012, SILL_DEPTH_M / 2]} castShadow>
          <boxGeometry args={[outerW + 0.04, 0.024, SILL_DEPTH_M]} />
          <Surface kind="frame" style={style} color={frameColour} glow={glow} layer={2} />
        </mesh>
      )}
    </group>
  )
}
