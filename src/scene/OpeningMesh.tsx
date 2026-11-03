import { FIT, type OpeningPiece, type PlacedOpening } from '../buildings/openingLayout'
import { ftToM } from '../site/units'
import type { DisplayStyle } from '../store/types'
import { Surface } from './Surface'

/** How far the casing stands off the wall face: flush trim, not a box frame. */
const TRIM_DEPTH_M = 0.03
/** Glass and door leaves are thin boxes in the hole, seen from inside and out (legacy panes 4 cm). */
const GLASS_M = 0.02
const DOOR_M = 0.045
const MULLION_M = 0.045
/** A casing this narrow is drawn even when trim is set to 0, so the opening still reads. */
const MIN_FRAME_M = 0.035
const SILL_DEPTH_M = 0.07
/** The door's glass lite sits just proud of the door's outside face. */
const DOOR_LITE_M = 0.004
const CONFLICT_COLOUR = '#c0392b'
const TRIM = { part: 'trim' } as const
const GLASS = { part: 'glass' } as const
const DOOR = { part: 'door' } as const

interface Props {
  readonly op: PlacedOpening
  readonly style: DisplayStyle
  /** Outline the opening when it is picked in the Openings panel. */
  readonly highlight?: boolean
  /** The wall's thickness at each edge, feet (the shell's); FIT.wallFt by default. */
  readonly thicknessFt?: (edge: number) => number
}

/**
 * An opening in a wall cut through by the wall shell: glass or a door leaf
 * standing in the hole at mid-thickness (legacy panes at t / 2), an open
 * hole for a cut-out, and on the outer face the 3C casing whose four sides
 * meet at the corners (head and sill run the full width, the jambs fit
 * between them), mullions in the glass, and a window sill tucked under the
 * casing. Along-cuts are drawn piece by piece with jambs only at their ends
 * and at sharp corners. Meshes carry their part (glass, door, trim) for Paint mode.
 */
export function OpeningMesh({ op, style, highlight = false, thicknessFt }: Props) {
  if (op.hidden) return null
  return (
    <>
      {op.pieces.map((p, i) => (
        <PieceMesh key={i} op={op} p={p} style={style} highlight={highlight} wallM={ftToM(thicknessFt ? thicknessFt(p.edge) : FIT.wallFt)} />
      ))}
    </>
  )
}

interface PieceProps {
  readonly op: PlacedOpening
  readonly p: OpeningPiece
  readonly style: DisplayStyle
  readonly highlight: boolean
  readonly wallM: number
}

function PieceMesh({ op, p, style, highlight, wallM }: PieceProps) {
  const w = ftToM(p.w)
  const h = ftToM(op.h)
  const trim = Math.max(MIN_FRAME_M, ftToM(op.trim))
  const pos: [number, number, number] = [ftToM(p.centre[0]), ftToM(p.centre[1]), ftToM(p.centre[2])]
  const yaw = Math.atan2(p.normal[0], p.normal[1])
  const frameColour = op.conflict ? CONFLICT_COLOUR : undefined
  const glow = highlight ? 1 : 0
  // the group sits on the outer face with +z out, so the middle of the wall is -t/2
  const mid = -wallM / 2
  // a casing below the opening only where it clears the floor; doors and sliders sit on the slab
  const hasBottom = op.kind === 'window' || op.kind === 'cutout' ? ftToM(op.sill) >= trim : false
  // seen from outside, the piece's right end is local +x
  const left = p.jambLeft ? trim : 0
  const right = p.jambRight ? trim : 0
  const outerW = w + left + right
  const midX = (right - left) / 2

  const bar = (x: number, y: number, bw: number, bh: number, key: string, depth = TRIM_DEPTH_M, z = depth / 2) => (
    <mesh key={key} position={[x, y, z]} castShadow userData={TRIM}>
      <boxGeometry args={[bw, bh, depth]} />
      <Surface kind="frame" style={style} color={frameColour} glow={glow} layer={2} />
    </mesh>
  )

  // mullions stand in the glass, through its plane
  const mullions = []
  for (let k = 1; k <= op.mullV; k++) mullions.push(bar(-w / 2 + (w * k) / (op.mullV + 1), 0, MULLION_M, h, `mv${k}`, MULLION_M, mid))
  for (let k = 1; k <= op.mullH; k++) mullions.push(bar(0, -h / 2 + (h * k) / (op.mullH + 1), w, MULLION_M, `mh${k}`, MULLION_M, mid))

  return (
    <group position={pos} rotation={[0, yaw, 0]}>
      {op.kind === 'door' ? (
        <>
          <mesh position={[0, 0, mid]} castShadow userData={DOOR}>
            <boxGeometry args={[w, h, DOOR_M]} />
            <Surface kind="door" style={style} />
          </mesh>
          <mesh position={[0, h * 0.18, mid + DOOR_M / 2 + DOOR_LITE_M]} userData={GLASS}>
            <planeGeometry args={[w * 0.32, h * 0.45]} />
            <Surface kind="glass" style={style} layer={1} />
          </mesh>
        </>
      ) : op.kind === 'cutout' ? null : (
        <mesh position={[0, 0, mid]} userData={GLASS}>
          <boxGeometry args={[w, h, GLASS_M]} />
          <Surface kind="glass" style={style} />
        </mesh>
      )}
      {bar(midX, h / 2 + trim / 2, outerW, trim, 'head')}
      {hasBottom && bar(midX, -h / 2 - trim / 2, outerW, trim, 'bottom')}
      {p.jambLeft && bar(-w / 2 - trim / 2, 0, trim, h, 'left')}
      {p.jambRight && bar(w / 2 + trim / 2, 0, trim, h, 'right')}
      {op.kind !== 'cutout' && mullions}
      {op.kind === 'window' && hasBottom && (
        <mesh position={[midX, -h / 2 - trim - 0.012, SILL_DEPTH_M / 2]} castShadow userData={TRIM}>
          <boxGeometry args={[outerW + 0.04, 0.024, SILL_DEPTH_M]} />
          <Surface kind="frame" style={style} color={frameColour} glow={glow} layer={2} />
        </mesh>
      )}
    </group>
  )
}
