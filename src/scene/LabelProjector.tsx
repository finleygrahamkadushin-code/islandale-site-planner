import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { num } from '../buildings/footprint'
import { ftToM } from '../site/units'
import { usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import type { Terrain } from '../site/types'
import { routePoints } from '../buildings/decks/BridgeMesh'
import { baseElevation, heightM } from './placement'
import { toScene } from './frame'
import type { DragState } from './editing'
import { labelElements } from './labelRegistry'

/** Projects each labelled object's anchor to the screen every frame and moves its DOM label there. */
export function LabelProjector({ drag }: { readonly drag: DragState | null }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const v = useMemo(() => new Vector3(), [])

  useFrame(() => {
    const s = usePlanStore.getState()
    for (const [id, el] of labelElements) {
      const stored = s.plan.objects[id]
      if (!stored) continue
      const o = drag?.id === id ? { ...stored, ...drag.patch(stored) } : stored
      const [x, y, z] = labelAnchor(o, s.site.terrain)
      v.set(x, y, z).project(camera)
      if (v.z > 1) {
        el.style.display = 'none'
        continue
      }
      const px = ((v.x + 1) / 2) * size.width
      const py = ((1 - v.y) / 2) * size.height
      el.style.display = ''
      el.style.transform = `translate(-50%, -100%) translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`
    }
  })
  return null
}

function labelAnchor(o: PlanObject, terrain: Terrain): [number, number, number] {
  if (o.type === 'bridge') {
    const pts = routePoints(o)
    const mid = pts[Math.floor(pts.length / 2)]
    if (mid) return toScene(mid[0], mid[1], mid[2] + 0.6)
  }
  const roofRise = o.type === 'house' && o.params.roof !== 'none' ? ftToM((num(o.params.pitch, 6) / 12) * (Math.min(num(o.params.w, 10), num(o.params.d, 10)) / 2 + num(o.params.overhang, 1.5))) : 0
  const h = o.type === 'tree' ? ftToM(num(o.params.h, 25)) : heightM(o) + roofRise
  return toScene(o.position.x, o.position.n, baseElevation(terrain, o) + h + 0.8)
}
