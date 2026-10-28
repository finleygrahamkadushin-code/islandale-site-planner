import { useMemo } from 'react'
import type { Mass } from '../buildings/masses'
import { stairHasHandrails } from '../buildings/rails'
import { HANDRAIL_IN, stairLayout } from '../buildings/stairs'
import { ftToM } from '../site/units'
import type { BuildingLook, MassSite, MeshHandlers } from './buildingLook'
import { EMBED_M } from './Foundation'
import { Segment } from './Segment'
import { Surface } from './Surface'

const RAIL_M = 0.05
const RAIL_POST_M = 0.07
const HANDRAIL_M = HANDRAIL_IN * 0.0254

/** A stair wing: solid tread blocks from the floor down to the ground at its foot, with handrails both sides. */
export function StairMass({ m, look, site, handlers }: { readonly m: Mass; readonly look: BuildingLook; readonly site: MassSite; readonly handlers: MeshHandlers }) {
  const layout = useMemo(
    () => stairLayout({ widthFt: m.w, nominalRunFt: m.d, floor: site.floor, groundAt: (z) => site.groundAt(0, z) }),
    [m.w, m.d, site],
  )
  const rails = stairHasHandrails(m)
  if (!layout.steps.length && !rails) return null
  const w = ftToM(m.w)
  const { style, glow } = look
  // heights here are relative to the mass floor
  const rel = (y: number) => y - site.floor
  const lowestUnder = (z0: number, z1: number) => Math.min(...[-m.w / 2, 0, m.w / 2].flatMap((x) => [site.groundAt(x, z0), site.groundAt(x, z1)]))
  // with one riser or none there are no tread blocks: the rails run the wing's length down to the ground
  const z0 = layout.steps[0]?.z0 ?? -m.d / 2
  const footZ = layout.steps.length ? layout.footZ : m.d / 2
  const footTop = rel(site.groundAt(0, footZ))
  return (
    <>
      {layout.steps.map((s, i) => {
        const bottom = rel(lowestUnder(s.z0, s.z1)) - EMBED_M
        const h = rel(s.top) - bottom
        return (
          <mesh key={i} position={[0, bottom + h / 2, ftToM((s.z0 + s.z1) / 2)]} castShadow receiveShadow {...handlers}>
            <boxGeometry args={[w, h, ftToM(s.z1 - s.z0)]} />
            <Surface kind="deck" style={style} texture="deck" glow={glow} />
          </mesh>
        )
      })}
      {rails &&
        [-1, 1].map((side) => {
          const x = side * (w / 2 - RAIL_POST_M / 2)
          const top: [number, number, number] = [x, HANDRAIL_M, ftToM(z0)]
          const foot: [number, number, number] = [x, footTop + HANDRAIL_M, ftToM(footZ)]
          return (
            <group key={side} name="rail">
              <Segment a={top} b={foot} size={RAIL_M}>
                <Surface kind="wood" style={style} />
              </Segment>
              <Segment a={[x, 0, top[2]]} b={top} size={RAIL_POST_M}>
                <Surface kind="wood" style={style} />
              </Segment>
              <Segment a={[x, footTop, foot[2]]} b={foot} size={RAIL_POST_M}>
                <Surface kind="wood" style={style} />
              </Segment>
            </group>
          )
        })}
    </>
  )
}
