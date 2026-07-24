import { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react'

type Props = { children: ReactNode; fallback?: ReactNode }
type State = { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  handleGoHome = () => {
    this.setState({ hasError: false, error: null })
    window.location.hash = '#/home'
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="nr-error-state" role="alert" aria-live="assertive">
          <AlertTriangle size={48} />
          <h2>Something went wrong</h2>
          <p>An unexpected error occurred. Your data has not been lost.</p>
          {this.state.error && (
            <details style={{ marginTop: 12, fontSize: 11, color: 'var(--nr-text-muted)' }}>
              <summary>Error details</summary>
              <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8, textAlign: 'left' }}>
                {this.state.error.message}
              </pre>
            </details>
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button className="nr-btn nr-btn-primary" onClick={this.handleRetry}>
              <RefreshCcw size={15} /> Try again
            </button>
            <button className="nr-btn nr-btn-secondary" onClick={this.handleGoHome}>
              <Home size={15} /> Go to homepage
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
