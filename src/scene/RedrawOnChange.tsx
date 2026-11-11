import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { usePlanStore } from '../store/planStore'
import { useLiveDrag } from './editing'
import { useIsolate } from '../tools/isolate'
import { usePresent } from '../present/present'

/**
 * The view draws only when asked (`frameloop="demand"`, R8.1). React Three
 * Fiber asks by itself when a prop on a scene object changes; this asks too
 * whenever a store the scene reads changes, so a mesh updated in an effect
 * (instance matrices, ghosting, colours) is never left undrawn, and after a
 * resize, which clears the canvas.
 */
export function RedrawOnChange() {
  const invalidate = useThree((s) => s.invalidate)
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  const dpr = useThree((s) => s.viewport.dpr)

  useEffect(() => {
    const redraw = () => invalidate()
    const stops = [usePlanStore.subscribe(redraw), useLiveDrag.subscribe(redraw), useIsolate.subscribe(redraw), usePresent.subscribe(redraw)]
    return () => stops.forEach((stop) => stop())
  }, [invalidate])

  useEffect(() => invalidate(), [width, height, dpr, invalidate])
  return null
}
