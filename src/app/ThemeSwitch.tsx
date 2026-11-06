import * as ToggleGroup from '@radix-ui/react-toggle-group'
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { Tip } from '../guide/Tip'
import { useTheme, type ThemeChoice } from './theme'

const THEMES: readonly { readonly id: ThemeChoice; readonly label: string; readonly hint: string; readonly Icon: LucideIcon }[] = [
  { id: 'light', label: 'Light theme', hint: 'Light panels and bars', Icon: Sun },
  { id: 'dark', label: 'Dark theme', hint: 'Dark panels and bars', Icon: Moon },
  { id: 'system', label: 'System theme', hint: 'Follow this computer’s light or dark setting', Icon: Monitor },
]

/** Light / Dark / System in the top bar's Style group (4E). The 3D view keeps its display style either way. */
export function ThemeSwitch() {
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  return (
    <ToggleGroup.Root type="single" value={theme} onValueChange={(v) => v && setTheme(v as ThemeChoice)} aria-label="Theme" className="seg theme-switch">
      {THEMES.map(({ id, label, hint, Icon }) => (
        <Tip key={id} label={hint}>
          <ToggleGroup.Item value={id} aria-label={label} className={`icon-only${theme === id ? ' on' : ''}`} data-testid={`theme-${id}`}>
            <Icon size={15} aria-hidden="true" />
          </ToggleGroup.Item>
        </Tip>
      ))}
    </ToggleGroup.Root>
  )
}
