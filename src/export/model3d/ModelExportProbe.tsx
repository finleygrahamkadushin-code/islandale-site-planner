import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { exportModelForScript, registerModelScene } from './exportModel'
import { PROBES_ON } from '../../app/probes'

/** Inside the 3D view: hands the live scene to Export 3D model, and exposes the export to the headless script. */
export function ModelExportProbe() {
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    registerModelScene(() => scene)
    const probes = PROBES_ON ? window.islandale : undefined
    if (probes) probes.exportModel = exportModelForScript
    return () => {
      registerModelScene(null)
      if (probes) delete probes.exportModel
    }
  }, [scene])
  return null
}
