import { useMemo } from 'react'
import { num } from '../buildings/footprint'
import { ftToM } from '../site/units'
import type { PlanObject } from '../store/types'
import { toScene } from './frame'
import { useObjectInteraction } from './useObjectInteraction'
import { Surface } from './Surface'
import { useDisplayStyle } from './useDisplayStyle'

const DECK_THICKNESS_M = 0.15

interface Segment {
  readonly position: [number, number, number]
  readonly yaw: number
  readonly length: number
}

/** A boardwalk as flat deck segments between its route points. */
export function BridgeMesh({ o }: { readonly o: PlanObject }) {
  const { selected, hovered, handlers } = useObjectInteraction(o)
  const style = useDisplayStyle()
  const width = ftToM(num(o.params.w, 5))
  const color = typeof o.params.color === 'string' ? o.params.color : '#a98c62'
  const segments = useMemo(() => routeSegments(o), [o])
  const glow = selected ? 0.18 : hovered ? 0.08 : 0
  return (
    <group name="bridge" userData={{ objectId: o.id }}>
      {segments.map((s, i) => (
        <mesh key={i} position={s.position} rotation={[0, s.yaw, 0]} castShadow receiveShadow {...handlers}>
          <boxGeometry args={[s.length, DECK_THICKNESS_M, width]} />
          <Surface kind="deck" style={style} color={color} glow={glow * 5} />
        </mesh>
      ))}
    </group>
  )
}

/** Route points in the site frame: position + relative route, rotated with the object. */
export function routePoints(o: PlanObject): readonly (readonly [number, number, number])[] {
  const route = Array.isArray(o.params.route) ? (o.params.route as (readonly number[])[]) : []
  const a = (o.rotation * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return route
    .filter((p) => p.length >= 3)
    .map(([dx, dn, elevFt]) => [o.position.x + dx * c - dn * s, o.position.n + dx * s + dn * c, ftToM(elevFt)] as const)
}

function routeSegments(o: PlanObject): Segment[] {
  const pts = routePoints(o)
  const out: Segment[] = []
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x1, n1, z1] = pts[i]
    const [x2, n2, z2] = pts[i + 1]
    const length = Math.hypot(x2 - x1, n2 - n1, z2 - z1)
    if (length < 1e-3) continue
    const mid = toScene((x1 + x2) / 2, (n1 + n2) / 2, (z1 + z2) / 2 - DECK_THICKNESS_M / 2)
    // scene yaw about +y: the segment direction in (x, -n)
    out.push({ position: mid, yaw: Math.atan2(-(-(n2 - n1)), x2 - x1), length })
  }
  return out
}
