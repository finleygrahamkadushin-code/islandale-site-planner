import { X } from 'lucide-react'
import { usePlanStore } from '../store/planStore'
import { LIBRARY, LIBRARY_GROUPS, type LibraryItem } from './library'
import { TAB_LIBRARY_GROUPS, useTaskTab } from '../layout/tabs'
import { focusPlanView } from '../scene/planView'
import { startPlacingAtView } from './keyboardPlace'

/** The data-testid each item keeps: path pieces keep their 5C ids (place-walk, …) so the path tests still find them. */
const testIdOf = (item: LibraryItem): string => (item.pathKind ? `place-${item.pathKind}` : `library-${item.id}`)

/**
 * The object library beside the tool strip (old planner LIB): every item
 * by group with its swatch and size. Picking one starts placing it (a ghost
 * follows the pointer; click the ground; R / Q / E turn it; Esc stops);
 * picking the armed item again stops. Picked with the keyboard, the ghost
 * starts in view and the arrows and Enter place it (R10.1).
 */
export function LibraryPanel({ onClose }: { readonly onClose: () => void }) {
  const armed = usePlanStore((s) => s.placing?.item ?? null)
  const setTool = usePlanStore((s) => s.setTool)
  // only the current tab's groups (Site: site, trees, paths; Build: buildings, paths)
  const groups = TAB_LIBRARY_GROUPS[useTaskTab((s) => s.tab)]
  /** A pointer pick waits for the ground; a keyboard pick (no click count) starts the ghost in view and hands focus to the view, where the arrows and Enter place it (R10.1). */
  const pick = (item: LibraryItem, byKeyboard: boolean) => {
    if (armed === item.id) return setTool('select')
    if (!byKeyboard) return setTool('place', item.id)
    startPlacingAtView(item.id)
    focusPlanView()
  }
  return (
    <section className="panel library" aria-label="Object library" data-testid="library">
      <header className="row">
        <h2 className="library-title">Place</h2>
        <button type="button" className="tool-close" aria-label="Close the library" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      {LIBRARY_GROUPS.filter((g) => groups.includes(g.id)).map((g) => (
        <div key={g.id} className="library-group" role="group" aria-label={g.label}>
          <h3>{g.label}</h3>
          {LIBRARY.filter((i) => i.group === g.id).map((item) => (
            <button key={item.id} type="button" className={`library-item${armed === item.id ? ' on' : ''}`} aria-pressed={armed === item.id} data-testid={testIdOf(item)} onClick={(e) => pick(item, e.detail === 0)}>
              <i className="swatch" style={{ background: String(item.params.color) }} aria-hidden="true" />
              <span>
                {item.name}
                <small>{item.hint}</small>
              </span>
            </button>
          ))}
        </div>
      ))}
      <p className="muted small">Click the ground to place it · R turns 90°, Q / E turn 5° · Esc stops. Path pieces snap to doors, decks and other pieces within 3 ft.</p>
    </section>
  )
}
