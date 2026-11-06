import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { exportModelForScript, registerModelScene } from './exportModel'

/** Inside the 3D view: hands the live scene to Export 3D model, and exposes the export to the headless script. */
export function ModelExportProbe() {
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    registerModelScene(() => scene)
    window.islandale.exportModel = exportModelForScript
    return () => {
      registerModelScene(null)
      delete window.islandale.exportModel
    }
  }, [scene])
  return null
}
