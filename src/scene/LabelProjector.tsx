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
import { dragMoves, type DragState } from './editing'
import { labelElements } from './labelRegistry'
import { labelRank, placeLabels, type LabelBox } from './labelPlacement'

/** A label's size by its text, measured once while it is shown; reading it every frame would force a layout per frame. */
const sizes = new WeakMap<HTMLElement, { readonly text: string; readonly w: number; readonly h: number }>()

function sizeOf(el: HTMLElement): { readonly w: number; readonly h: number } {
  const text = el.textContent ?? ''
  const known = sizes.get(el)
  if (known && known.text === text) return known
  const measured = { text, w: el.offsetWidth, h: el.offsetHeight }
  if (measured.w > 0) sizes.set(el, measured)
  return measured
}

/**
 * Projects each labelled object's anchor to the screen every drawn frame and
 * moves its DOM label there. Labels that would overlap drop out by rank and
 * small things' labels fade with distance (R9.3, `labelPlacement.ts`). It only
 * runs when the view draws; it never asks for a frame itself.
 */
export function LabelProjector({ drag }: { readonly drag: DragState | null }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const v = useMemo(() => new Vector3(), [])

  useFrame(() => {
    const s = usePlanStore.getState()
    const boxes: LabelBox[] = []
    const at = new Map<string, string>()
    for (const [id, el] of labelElements) {
      const stored = s.plan.objects[id]
      if (!stored) continue
      const o = drag && dragMoves(drag, id) ? { ...stored, ...drag.patch(stored) } : stored
      const [x, y, z] = labelAnchor(o, s.site.terrain)
      v.set(x, y, z)
      const distance = v.distanceTo(camera.position)
      v.project(camera)
      if (v.z > 1) {
        el.style.display = 'none'
        continue
      }
      const px = ((v.x + 1) / 2) * size.width
      const py = ((1 - v.y) / 2) * size.height
      const transform = `translate(-50%, -100%) translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`
      at.set(id, transform)
      // a label not yet measured is shown in place first, so it can be
      if (!sizes.has(el)) {
        el.style.display = ''
        el.style.transform = transform
      }
      const { w, h } = sizeOf(el)
      boxes.push({ id, x: px, y: py, w, h, rank: labelRank(o.type, s.selection.includes(id)), distance })
    }
    const shown = placeLabels(boxes)
    for (const [id, transform] of at) {
      const el = labelElements.get(id)
      if (!el) continue
      const opacity = shown.get(id)
      if (opacity === undefined) {
        el.style.display = 'none'
        continue
      }
      el.style.display = ''
      el.style.opacity = opacity < 1 ? opacity.toFixed(2) : ''
      el.style.transform = transform
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
