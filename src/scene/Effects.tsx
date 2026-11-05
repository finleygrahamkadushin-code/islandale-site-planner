import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useDisplayStyle } from './useDisplayStyle'
import { useDisplayEffects } from './displayOptions'

/** Ambient occlusion, anti-aliasing and tone mapping after the scene renders. */
export function Effects() {
  const style = useDisplayStyle()
  const { ao: aoOn } = useDisplayEffects()
  const ao = style === 'realistic' ? { intensity: 2.2, radius: 1.6 } : style === 'diagram' ? { intensity: 0.8, radius: 1.2 } : { intensity: 3.2, radius: 2.4 }
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO aoRadius={ao.radius} intensity={aoOn ? ao.intensity : 0} distanceFalloff={1} quality="medium" halfRes />
      <ToneMapping mode={style === 'realistic' ? ToneMappingMode.ACES_FILMIC : ToneMappingMode.NEUTRAL} />
      <SMAA />
    </EffectComposer>
  )
}
