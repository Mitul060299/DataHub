import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
  errorStack: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, componentStack: null, errorStack: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // Stale chunk: a new deploy removed the old hashed asset the cached
    // index.html is still referencing.  Reload once to pick up the new build.
    const isChunkError =
      /failed to fetch dynamically imported module/i.test(error.message) ||
      /importing a module script failed/i.test(error.message) ||
      /error loading dynamically imported module/i.test(error.message) ||
      error.name === "ChunkLoadError";
    if (isChunkError && !sessionStorage.getItem("datahub_chunk_reload")) {
      sessionStorage.setItem("datahub_chunk_reload", "1");
      window.location.reload();
    }
    return { error, componentStack: null, errorStack: error.stack ?? null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
    console.error("[ErrorBoundary] JS stack:", error.stack);
    this.setState({ componentStack: info.componentStack ?? null, errorStack: error.stack ?? null });
  }

  render() {
    if (this.state.error) {
      // If it's a stale-chunk error, show a minimal "reloading" screen while
      // the page reload (triggered in getDerivedStateFromError) is in-flight.
      const isChunkError =
        /failed to fetch dynamically imported module/i.test(this.state.error.message) ||
        /importing a module script failed/i.test(this.state.error.message) ||
        /error loading dynamically imported module/i.test(this.state.error.message) ||
        this.state.error.name === "ChunkLoadError";
      if (isChunkError) {
        return (
          <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "#0d0d12" }}>
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "eb-spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              <style>{`@keyframes eb-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
              <p style={{ color: "#a0a0b0", fontSize: 13, margin: 0 }}>New version available — reloading…</p>
              <button
                className="btn"
                style={{ fontSize: 12, marginTop: 4 }}
                onClick={() => window.location.reload()}
              >
                Reload now
              </button>
            </div>
          </div>
        );
      }

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
          {this.state.errorStack && (
            <details style={{ maxWidth: 600, textAlign: "left" }}>
              <summary style={{ fontSize: 11, color: "var(--tx2, #8888a0)", cursor: "pointer" }}>JS stack trace</summary>
              <pre style={{ fontSize: 10, color: "var(--tx2, #8888a0)", whiteSpace: "pre-wrap", marginTop: 4, maxHeight: 200, overflowY: "auto", userSelect: "all" }}>
                {this.state.errorStack}
              </pre>
            </details>
          )}
          <button
            className="btn"
            style={{ marginTop: 4 }}
            onClick={() => this.setState({ error: null, componentStack: null, errorStack: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
