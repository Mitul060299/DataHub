import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error, componentStack: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            minHeight: 200,
            gap: 12,
            padding: 24,
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: 28 }}>⚠</span>
          <p style={{ fontSize: 15, color: "var(--tx0, #e8e8f0)", fontWeight: 600, margin: 0 }}>
            Something went wrong
          </p>
          <p style={{ fontSize: 13, color: "var(--tx2, #8888a0)", margin: 0, maxWidth: 400, lineHeight: 1.6 }}>
            {this.state.error.message}
          </p>
          {this.state.componentStack && (
            <details style={{ maxWidth: 600, textAlign: "left" }}>
              <summary style={{ fontSize: 11, color: "var(--tx2, #8888a0)", cursor: "pointer" }}>Component trace</summary>
              <pre style={{ fontSize: 10, color: "var(--tx2, #8888a0)", whiteSpace: "pre-wrap", marginTop: 4, maxHeight: 200, overflowY: "auto" }}>
                {this.state.componentStack}
              </pre>
            </details>
          )}
          <button
            className="btn"
            style={{ marginTop: 4 }}
            onClick={() => this.setState({ error: null, componentStack: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
