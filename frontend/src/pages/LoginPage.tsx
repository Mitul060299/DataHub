import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSEO } from "../hooks/useSEO";
import { capture } from "../lib/posthog";

type LocationState = {
  from?: { pathname?: string };
};

export function LoginPage() {
  const { signInWithPassword, signInWithProvider, resetPasswordEmail, session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useSEO({
    title: "Log In – DataHub | AI Agent for Data Work",
    description: "Sign in to your DataHub account to access your AI agent, visual pipelines, workspaces, and dashboards.",
    canonical: "https://datahub.org.in/login",
    noIndex: true,
  });

  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  // Guard against open redirect: only allow relative paths within the app
  const rawDest = state?.from?.pathname ?? "/workspace";
  const destination = typeof rawDest === "string" && /^\/[^/]/.test(rawDest) ? rawDest : "/workspace";

  useEffect(() => {
    capture("login_viewed");
  }, []);

  useEffect(() => {
    if (session) {
      navigate(destination, { replace: true });
    }
  }, [session, destination, navigate]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    capture("login_submitted", { method: "email" });
    const { error } = await signInWithPassword(email, password);
    setLoading(false);
    if (error) {
      capture("login_error", { method: "email", message: error.message });
      setErrorMessage(error.message);
      return;
    }
    capture("login_success", { method: "email" });
    navigate(destination, { replace: true });
  };

  const handleProvider = async (provider: "google" | "github") => {
    capture("login_oauth_clicked", { provider });
    setLoading(true);
    const { error } = await signInWithProvider(provider);
    setLoading(false);
    if (error) {
      capture("login_error", { method: provider, message: error.message });
      setErrorMessage(error.message);
    }
  };

  const handleResetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) { setErrorMessage("Enter your email address."); return; }
    setLoading(true);
    setErrorMessage(null);
    const { error } = await resetPasswordEmail(email.trim());
    setLoading(false);
    if (error) { setErrorMessage(error.message); return; }
    setResetSent(true);
  };

  if (forgotMode) {
    return (
      <div className="auth-shell">
        {resetSent ? (
          <div className="auth-card">
            <h1 className="auth-title">Check your email</h1>
            <p className="auth-sub">We sent a password reset link to <strong>{email}</strong>. Check your inbox (and spam folder).</p>
            <div className="auth-actions">
              <button className="btn btn-primary" type="button" onClick={() => { setForgotMode(false); setResetSent(false); }}>Back to sign in</button>
            </div>
          </div>
        ) : (
          <form className="auth-card" onSubmit={handleResetPassword}>
            <h1 className="auth-title">Reset your password</h1>
            <p className="auth-sub">Enter your email and we&apos;ll send you a reset link.</p>
            {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
            <div className="auth-group">
              <label className="auth-label" htmlFor="reset-email">Email</label>
              <input id="reset-email" className="auth-input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
            </div>
            <div className="auth-actions">
              <button className="btn btn-primary" disabled={loading} type="submit">{loading ? "Sending…" : "Send reset link"}</button>
            </div>
            <div className="auth-row" style={{ marginTop: 12 }}>
              <button type="button" className="auth-link" style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => { setForgotMode(false); setErrorMessage(null); }}>← Back to sign in</button>
            </div>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">Welcome back to DataHub</h1>
        <p className="auth-sub">Sign in free — no credit card required.</p>
        {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}

        {/* OAuth first — one-click signin is faster and reduces password-reset traffic. */}
        <div className="auth-actions">
          <button
            className="btn btn-primary"
            disabled={loading}
            type="button"
            onClick={() => void handleProvider("google")}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
          <button
            className="btn"
            disabled={loading}
            type="button"
            onClick={() => void handleProvider("github")}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" style={{ flexShrink: 0 }}>
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            Continue with GitHub
          </button>
        </div>

        <div className="auth-divider"><span>or sign in with email</span></div>

        <div className="auth-group">
          <label className="auth-label" htmlFor="email">Email</label>
          <input id="email" className="auth-input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required />
        </div>
        <div className="auth-group">
          <label className="auth-label" htmlFor="password">Password</label>
          <div className="auth-password-wrap">
            <input
              id="password"
              className="auth-input"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your password"
              required
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => { setForgotMode(true); setErrorMessage(null); }}
            style={{ background: "none", border: "none", color: "var(--ac, #5B6AF0)", fontSize: 12, cursor: "pointer", textAlign: "right", padding: "4px 0 0", alignSelf: "flex-end" }}
          >
            Forgot password?
          </button>
        </div>

        <div className="auth-actions">
          <button className="btn btn-primary" disabled={loading} type="submit">{loading ? "Signing in..." : "Sign in"}</button>
        </div>

        <div className="auth-row" style={{ marginTop: 12 }}>
          <span style={{ color: "var(--tx1)" }}>New to datahub.org.in?</span>
          <Link className="auth-link" to="/signup">Create account</Link>
        </div>
      </form>
    </div>
  );
}
