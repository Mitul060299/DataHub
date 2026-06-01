import { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { capture } from "../lib/posthog";

/** Persistent sign-in banner shown to unauthenticated (guest) visitors when
 * they browse the workspace in demo mode. Non-dismissible. */
export function WorkspaceGuestBanner() {
  const { signInWithProvider, signInWithPassword, resetPasswordEmail } = useAuth();
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicMode, setMagicMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  // Listen for pulse events dispatched by blocked actions (AI, upload, run)
  useEffect(() => {
    const handler = () => {
      setPulsing(true);
      bannerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setTimeout(() => setPulsing(false), 900);
    };
    window.addEventListener("datahub:guest-banner:pulse", handler);
    return () => window.removeEventListener("datahub:guest-banner:pulse", handler);
  }, []);

  const handleProvider = async (provider: "google" | "github") => {
    capture("guest_banner_oauth_clicked", { provider });
    setLoading(true);
    const { error: err } = await signInWithProvider(provider);
    setLoading(false);
    if (err) setError(err.message);
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError("Enter your email."); return; }
    if (!password.trim() && !magicMode) { setError("Enter your password."); return; }
    setError(null);
    setLoading(true);
    if (magicMode) {
      const { error: err } = await resetPasswordEmail(email.trim());
      setLoading(false);
      if (err) { setError(err.message); return; }
      setMagicSent(true);
    } else {
      const { error: err } = await signInWithPassword(email.trim(), password);
      setLoading(false);
      if (err) { setError(err.message); return; }
      capture("guest_banner_email_signin");
    }
  };

  const toggleEmail = () => {
    setEmailExpanded((v) => !v);
    setError(null);
    setMagicSent(false);
    setTimeout(() => emailRef.current?.focus(), 50);
  };

  return (
    <div
      ref={bannerRef}
      id="workspace-guest-banner"
      style={{
        flexShrink: 0,
        background: pulsing
          ? "linear-gradient(90deg, rgba(91,106,240,0.35) 0%, rgba(139,92,246,0.28) 100%)"
          : "linear-gradient(90deg, rgba(91,106,240,0.15) 0%, rgba(139,92,246,0.12) 100%)",
        borderBottom: pulsing
          ? "1px solid rgba(91,106,240,0.7)"
          : "1px solid rgba(91,106,240,0.3)",
        padding: emailExpanded ? "10px 16px 12px" : "0 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        transition: "background 0.35s ease, border-color 0.35s ease, padding 0.2s ease",
      }}
    >
      {/* Main row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 40 }}>
        <span
          style={{
            fontSize: 12,
            color: "#c7d2fe",
            flex: 1,
            lineHeight: 1.4,
          }}
        >
          <span style={{ fontWeight: 600 }}>You&apos;re exploring a live retail store demo — 12,575 transactions.</span>
          {" "}Sign in to upload your own data and use AI — free, no card needed.
        </span>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button
            className="btn"
            disabled={loading}
            onClick={() => handleProvider("google")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 30,
              padding: "0 12px",
              fontSize: 12,
              fontWeight: 600,
              background: "#fff",
              color: "#1a1a2e",
              border: "none",
              borderRadius: 6,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
            type="button"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <button
            className="btn"
            disabled={loading}
            onClick={() => handleProvider("github")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 30,
              padding: "0 12px",
              fontSize: 12,
              fontWeight: 600,
              background: "#24292f",
              color: "#fff",
              border: "1px solid #444",
              borderRadius: 6,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
            type="button"
          >
            <GitHubIcon />
            Continue with GitHub
          </button>

          <button
            type="button"
            onClick={toggleEmail}
            style={{
              background: "none",
              border: "none",
              color: emailExpanded ? "#a5b4fc" : "#7878a0",
              fontSize: 11,
              cursor: "pointer",
              padding: "4px 6px",
              borderRadius: 4,
              whiteSpace: "nowrap",
              textDecoration: "underline",
              textDecorationStyle: "dotted",
            }}
          >
            {emailExpanded ? "hide" : "or use email →"}
          </button>
        </div>
      </div>

      {/* Expandable email form */}
      {emailExpanded && (
        <form onSubmit={handleEmailSignIn} style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
          {magicSent ? (
            <span style={{ fontSize: 12, color: "#6ee7b7" }}>
              Check your email — we sent a sign-in link to <strong>{email}</strong>.
            </span>
          ) : (
            <>
              <input
                ref={emailRef}
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  height: 30,
                  padding: "0 10px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: "1px solid var(--bd2, #333)",
                  background: "var(--bg1, #111)",
                  color: "var(--tx1, #eee)",
                  width: 200,
                }}
              />
              {!magicMode && (
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    height: 30,
                    padding: "0 10px",
                    fontSize: 12,
                    borderRadius: 6,
                    border: "1px solid var(--bd2, #333)",
                    background: "var(--bg1, #111)",
                    color: "var(--tx1, #eee)",
                    width: 160,
                  }}
                />
              )}
              <button
                className="btn btn-primary"
                type="submit"
                disabled={loading}
                style={{ height: 30, padding: "0 14px", fontSize: 12 }}
              >
                {loading ? "..." : magicMode ? "Send link" : "Sign in"}
              </button>
              <button
                type="button"
                onClick={() => { setMagicMode((v) => !v); setError(null); }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#7878a0",
                  fontSize: 11,
                  cursor: "pointer",
                  padding: "4px 2px",
                  textDecoration: "underline",
                  textDecorationStyle: "dotted",
                  alignSelf: "center",
                }}
              >
                {magicMode ? "use password instead" : "forgot password?"}
              </button>
            </>
          )}
          {error && <span style={{ fontSize: 11, color: "#fca5a5", alignSelf: "center" }}>{error}</span>}
        </form>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}
