import { forwardRef, useCallback, useRef, type ReactNode, type RefObject } from 'react'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown } from 'lucide-react'

/**
 * The top bar's File and View menus (R9.1), on Radix: arrow keys, Escape,
 * typeahead and focus back to the button come with it. The open menu has
 * `role="menu"`, so `keyOwner` keeps the plan's shortcuts away from it.
 */

interface TopMenuProps {
  readonly label: string
  readonly testId: string
  readonly icon?: ReactNode
  readonly triggerRef?: RefObject<HTMLButtonElement | null>
  /** Called when the menu has closed, before focus goes back to its button; preventDefault to place focus yourself. */
  readonly onCloseAutoFocus?: (e: Event) => void
  readonly children: ReactNode
}

export function TopMenu({ label, testId, icon, triggerRef, onCloseAutoFocus, children }: TopMenuProps) {
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button type="button" className="topbar-menu-button" data-testid={testId} ref={triggerRef}>
          {icon}
          {label}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="topbar-menu" align="start" sideOffset={6} collisionPadding={8} loop onCloseAutoFocus={onCloseAutoFocus}>
          {children}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

/** A key hint at the right of a menu row. */
export const MenuKeys = ({ children }: { readonly children: ReactNode }) => <kbd className="menu-keys">{children}</kbd>

/** The tick before a checked radio or checkbox row. */
export const MenuTick = () => (
  <span className="menu-tick" aria-hidden="true">
    <Menu.ItemIndicator>
      <Check size={14} />
    </Menu.ItemIndicator>
  </span>
)

/**
 * A row's name and, under it, what it does. Menu rows carry no tooltip: a
 * tooltip is a layer of its own, so Escape would close it before the menu,
 * and touch screens never show one.
 */
export const MenuText = ({ children, hint }: { readonly children: ReactNode; readonly hint?: ReactNode }) => (
  <span className="menu-text">
    <span>{children}</span>
    {hint && <span className="menu-hint">{hint}</span>}
  </span>
)

/** A plain row with an optional hint line. */
export const MenuItem = forwardRef<HTMLDivElement, Menu.DropdownMenuItemProps & { readonly hint?: ReactNode }>(function MenuItem({ className, hint, children, ...rest }, ref) {
  return (
    <Menu.Item ref={ref} className={`menu-item${className ? ` ${className}` : ''}`} {...rest}>
      <MenuText hint={hint}>{children}</MenuText>
    </Menu.Item>
  )
})

/**
 * Run a step only once the menu has closed and focus is back on its button:
 * a dialog opened that way hands focus back to the button when it closes,
 * not to a menu row that no longer exists.
 */
export function useAfterClose(trigger: RefObject<HTMLButtonElement | null>) {
  const pending = useRef<(() => void) | null>(null)
  const later = useCallback((step: () => void) => () => {
    pending.current = step
  }, [])
  const onCloseAutoFocus = useCallback(
    (e: Event) => {
      const step = pending.current
      pending.current = null
      if (!step) return
      e.preventDefault()
      trigger.current?.focus()
      step()
    },
    [trigger],
  )
  return { later, onCloseAutoFocus }
}
