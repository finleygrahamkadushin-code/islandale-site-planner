import * as ToggleGroup from '@radix-ui/react-toggle-group'
import { useGuideMode, type GuideMode } from './mode'
import { Tip } from './Tip'

const MODES: readonly { readonly id: GuideMode; readonly label: string; readonly hint: string }[] = [
  { id: 'beginner', label: 'Beginner', hint: 'Plain names, fewer settings, and a question before deleting' },
  { id: 'advanced', label: 'Advanced', hint: 'Every setting, with its usual name; undo is the safety net' },
]

/** The Beginner / Advanced switch in the top bar (4C), beside Style. */
export function ModeSwitch() {
  const mode = useGuideMode((s) => s.mode)
  const setMode = useGuideMode((s) => s.setMode)
  return (
    <ToggleGroup.Root type="single" value={mode} onValueChange={(v) => v && setMode(v as GuideMode)} aria-label="Beginner or Advanced" className="seg" data-tour="mode">
      {MODES.map((m) => (
        <Tip key={m.id} label={m.hint}>
          <ToggleGroup.Item value={m.id} className={mode === m.id ? 'on' : ''} data-testid={`mode-${m.id}`}>
            {m.label}
          </ToggleGroup.Item>
        </Tip>
      ))}
    </ToggleGroup.Root>
  )
}
