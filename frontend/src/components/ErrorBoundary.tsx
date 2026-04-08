import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
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
          <button
            className="btn"
            style={{ marginTop: 4 }}
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
