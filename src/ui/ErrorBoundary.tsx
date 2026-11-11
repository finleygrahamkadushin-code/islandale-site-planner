import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** Names the part of the app in the console log, e.g. "3D view". */
  readonly name: string
  /** What shows instead of the children after a throw; a function gets a reset that tries the children again. */
  readonly fallback: ReactNode | ((reset: () => void) => ReactNode)
  /** Told once per caught error, after it is logged. */
  readonly onError?: (error: unknown) => void
  readonly children: ReactNode
}

interface State {
  readonly failed: boolean
}

/**
 * Catches a render-time throw (or a lazy chunk that would not load) in
 * its children and shows the fallback instead, so one broken part leaves
 * the rest of the app working. React only offers this as a class.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`${this.props.name} failed:`, error, info.componentStack)
    this.props.onError?.(error)
  }

  private readonly reset = (): void => this.setState({ failed: false })

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    const { fallback } = this.props
    return typeof fallback === 'function' ? fallback(this.reset) : fallback
  }
}
