import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSEO } from "../hooks/useSEO";

type LocationState = {
  from?: { pathname?: string };
};

export function LoginPage() {
  const { signInWithPassword, signInWithProvider, resetPasswordEmail, session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useSEO({
    title: "Log In – DataHub",
    description: "Sign in to your DataHub account to access your data pipelines, workspaces, and dashboards.",
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
    if (session) {
      navigate(destination, { replace: true });
    }
  }, [session, destination, navigate]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    const { error } = await signInWithPassword(email, password);
    setLoading(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    navigate(destination, { replace: true });
  };

  const handleProvider = async (provider: "google" | "github") => {
    setLoading(true);
    const { error } = await signInWithProvider(provider);
    setLoading(false);
    if (error) setErrorMessage(error.message);
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
              <input id="reset-email" className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
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
        <p className="auth-sub">Sign in to continue your workspace session.</p>
        {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}

        <div className="auth-group">
          <label className="auth-label" htmlFor="email">Email</label>
          <input id="email" className="auth-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required />
        </div>
        <div className="auth-group">
          <label className="auth-label" htmlFor="password">Password</label>
          <input id="password" className="auth-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" required />
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
          <button className="btn" disabled={loading} type="button" onClick={() => void handleProvider("google")}>Continue with Google</button>
          <button className="btn" disabled={loading} type="button" onClick={() => void handleProvider("github")}>Continue with GitHub</button>
        </div>

        <div className="auth-row" style={{ marginTop: 12 }}>
          <span style={{ color: "var(--tx1)" }}>New to DataHub?</span>
          <Link className="auth-link" to="/signup">Create account</Link>
        </div>
      </form>
    </div>
  );
}
