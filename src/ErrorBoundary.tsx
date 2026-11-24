import { Component, type ReactNode } from "react";

/**
 * Shows the error instead of a blank page. The document is autosaved, so
 * reloading usually gets you back to where you were.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash">
        <h1>Something went wrong</h1>
        <p>Your document is saved in this browser. Reloading usually fixes it.</p>
        <pre>{error.stack ?? error.message}</pre>
        <button className="btn btn-primary" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
