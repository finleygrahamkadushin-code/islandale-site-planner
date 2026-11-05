import type { ReactElement, ReactNode } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'

type Side = 'top' | 'right' | 'bottom' | 'left'

/**
 * The one shared tooltip (4C): a control's name and, where there is one, its
 * key, on hover and on keyboard focus. The child must take a ref (a native
 * element or a Radix part). Needs the `Tooltip.Provider` that `App` mounts.
 */
export function Tip({ label, keyHint, side = 'bottom', children }: { readonly label: ReactNode; readonly keyHint?: string; readonly side?: Side; readonly children: ReactElement }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tool-tip" side={side} sideOffset={6} collisionPadding={8}>
          {label}
          {keyHint && <kbd>{keyHint}</kbd>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

/** The provider every `Tip` needs, mounted once at the app's root. */
export function TipProvider({ children }: { readonly children: ReactNode }) {
  return <Tooltip.Provider delayDuration={300}>{children}</Tooltip.Provider>
}
