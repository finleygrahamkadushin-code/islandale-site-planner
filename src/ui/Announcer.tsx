import { useAnnounce } from './announce'

/**
 * The keyboard's one polite live region (R10.1), out of sight. No status
 * role: the toast is the page's one status, and tests find it by that role. It stays
 * mounted and only its text changes; a repeat of the same words (two nudges
 * to the same spot cannot happen, but "Placing stopped" twice can) toggles a
 * trailing no-break space so the change is still heard.
 */
export function Announcer() {
  const text = useAnnounce((s) => s.text)
  const n = useAnnounce((s) => s.n)
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="announcer">
      {text ? `${text}${n % 2 ? ' ' : ''}` : ''}
    </div>
  )
}
