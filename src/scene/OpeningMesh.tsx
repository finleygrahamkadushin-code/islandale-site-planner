import type { Opening } from '../buildings/openings'
import { ftToM } from '../site/units'
import type { DisplayStyle } from '../store/types'
import { Surface } from './Surface'

const FRAME_M = 0.075
const FRAME_DEPTH_M = 0.12
const PROUD_M = 0.02

/** A framed opening on the wall face: glass for windows and sliders, a panel with a lite for doors. */
export function OpeningMesh({ op, style }: { readonly op: Opening; readonly style: DisplayStyle }) {
  const w = ftToM(op.w)
  const h = ftToM(op.h)
  const pos: [number, number, number] = [ftToM(op.centre[0]), ftToM(op.centre[1]), ftToM(op.centre[2])]
  const yaw = Math.atan2(op.normal[0], op.normal[1])
  const bar = (x: number, y: number, bw: number, bh: number, key: string) => (
    <mesh key={key} position={[x, y, PROUD_M + FRAME_DEPTH_M / 2 - 0.03]} castShadow>
      <boxGeometry args={[bw, bh, FRAME_DEPTH_M]} />
      <Surface kind="frame" style={style} />
    </mesh>
  )
  return (
    <group position={pos} rotation={[0, yaw, 0]}>
      {op.kind === 'door' ? (
        <>
          <mesh position={[0, 0, PROUD_M]}>
            <planeGeometry args={[w, h]} />
            <Surface kind="door" style={style} />
          </mesh>
          <mesh position={[0, h * 0.18, PROUD_M + 0.005]}>
            <planeGeometry args={[w * 0.32, h * 0.45]} />
            <Surface kind="glass" style={style} />
          </mesh>
        </>
      ) : (
        <mesh position={[0, 0, PROUD_M]}>
          <planeGeometry args={[w, h]} />
          <Surface kind="glass" style={style} />
        </mesh>
      )}
      {bar(0, h / 2, w + FRAME_M * 2, FRAME_M, 'top')}
      {bar(0, -h / 2, w + FRAME_M * 2, FRAME_M, 'bottom')}
      {bar(-w / 2, 0, FRAME_M, h, 'left')}
      {bar(w / 2, 0, FRAME_M, h, 'right')}
      {op.kind === 'slider' && bar(0, 0, FRAME_M, h, 'mullion')}
      {op.kind === 'window' && op.w > 4 && bar(0, 0, FRAME_M * 0.7, h, 'mullion')}
      {op.kind === 'window' && (
        <mesh position={[0, -h / 2 - FRAME_M, PROUD_M + 0.06]} castShadow>
          <boxGeometry args={[w + 0.2, 0.05, 0.16]} />
          <Surface kind="frame" style={style} />
        </mesh>
      )}
    </group>
  )
}
