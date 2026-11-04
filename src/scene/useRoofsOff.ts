import { useSyncExternalStore } from 'react'
import { usePlanStore } from '../store/planStore'
import { onRoofHold, roofsHeld } from './sheetCapture'

/** Whether roofs are left out of the 3D view: Roofs off is on, and no elevation capture is holding them on. */
export function useRoofsOff(): boolean {
  const off = usePlanStore((s) => s.roofsOff)
  const held = useSyncExternalStore(onRoofHold, roofsHeld)
  return off && !held
}
