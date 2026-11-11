import type { ReactNode } from 'react'

interface Action {
  readonly label: string
  readonly onClick: () => void
}

interface Props {
  /** Classes for the box it fills, e.g. "viewport" so it takes the 3D view's place. */
  readonly className: string
  readonly title: string
  readonly children: ReactNode
  readonly actions: readonly Action[]
}

/** The plain message an error boundary shows in place of a part that broke. */
export function CrashNote({ className, title, children, actions }: Props) {
  return (
    <div className={`${className} crash-wrap`}>
      <div className="crash-note" role="alert">
        <h2>{title}</h2>
        <p>{children}</p>
        <div className="crash-actions">
          {actions.map((a, i) => (
            <button key={a.label} type="button" className={i === 0 ? 'primary' : undefined} autoFocus={i === 0} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
