import * as Menu from '@radix-ui/react-dropdown-menu'
import { usePlanStore } from '../store/planStore'
import { DISPLAY_STYLES, type DisplayStyle, type LabelMode } from '../store/types'
import { DISPLAY_TOGGLES, useDisplayEffects } from '../scene/displayOptions'
import { useTheme, type ThemeChoice } from '../app/theme'
import { MenuKeys, MenuText, MenuTick, TopMenu } from './TopMenu'

const LABEL_MODES: readonly { readonly id: LabelMode; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'selected', label: 'Selected' },
  { id: 'none', label: 'None' },
]

const THEMES: readonly { readonly id: ThemeChoice; readonly label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Same as this computer' },
]

/** Picking a look keeps the menu open, so styles can be tried one after another. */
const stayOpen = (e: Event) => e.preventDefault()

/**
 * The top bar's View menu (R9.1): how the model and the panels look. Never
 * an undo step; the style and effects are saved with the plan's view
 * settings, the theme per browser.
 */
export function ViewMenu() {
  const displayStyle = usePlanStore((s) => s.displayStyle)
  const setDisplayStyle = usePlanStore((s) => s.setDisplayStyle)
  const setDisplayOption = usePlanStore((s) => s.setDisplayOption)
  const labelMode = usePlanStore((s) => s.labelMode)
  const setLabelMode = usePlanStore((s) => s.setLabelMode)
  const effects = useDisplayEffects()
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)

  return (
    <TopMenu label="View" testId="menu-view">
      <Menu.Label className="menu-label">Style</Menu.Label>
      <Menu.RadioGroup value={displayStyle} onValueChange={(v) => setDisplayStyle(v as DisplayStyle)} aria-label="Display style">
        {DISPLAY_STYLES.map((d, i) => (
          <Menu.RadioItem key={d.id} value={d.id} className="menu-item" data-testid={`style-${d.id}`} onSelect={stayOpen}>
            <MenuTick />
            {d.label}
            <MenuKeys>{i + 1}</MenuKeys>
          </Menu.RadioItem>
        ))}
      </Menu.RadioGroup>
      <Menu.Separator className="menu-rule" />
      <Menu.Label className="menu-label">Effects (picking a style resets them)</Menu.Label>
      {DISPLAY_TOGGLES.map((t) => (
        <Menu.CheckboxItem
          key={t.id}
          className="menu-item"
          checked={effects[t.id]}
          onCheckedChange={(on) => setDisplayOption(t.id, on)}
          onSelect={stayOpen}
          data-testid={`display-${t.id}`}
        >
          <MenuTick />
          <MenuText hint={t.hint}>{t.label}</MenuText>
        </Menu.CheckboxItem>
      ))}
      <Menu.Separator className="menu-rule" />
      <Menu.Label className="menu-label">Labels</Menu.Label>
      <Menu.RadioGroup value={labelMode} onValueChange={(v) => setLabelMode(v as LabelMode)} aria-label="Labels">
        {LABEL_MODES.map((m) => (
          <Menu.RadioItem key={m.id} value={m.id} className="menu-item" data-testid={`labels-${m.id}`} onSelect={stayOpen}>
            <MenuTick />
            {m.label}
          </Menu.RadioItem>
        ))}
      </Menu.RadioGroup>
      <Menu.Separator className="menu-rule" />
      <Menu.Label className="menu-label">Theme of the panels and bars</Menu.Label>
      <Menu.RadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemeChoice)} aria-label="Theme">
        {THEMES.map((t) => (
          <Menu.RadioItem key={t.id} value={t.id} className="menu-item" data-testid={`theme-${t.id}`} onSelect={stayOpen}>
            <MenuTick />
            {t.label}
          </Menu.RadioItem>
        ))}
      </Menu.RadioGroup>
    </TopMenu>
  )
}
