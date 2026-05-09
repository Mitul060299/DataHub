import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSEO } from "../hooks/useSEO";
import { capture } from "../lib/posthog";

export function SignupPage() {
  const { signUpWithPassword, signInWithProvider, session, claimAnonymous } = useAuth();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  useSEO({
    title: "Sign Up – Start Analyzing Data with AI | datahub.org.in",
    description:
      "Create your free datahub.org.in account. No credit card required. Connect your data sources and start building AI-powered SQL pipelines in minutes.",
    canonical: "https://datahub.org.in/signup",
  });

  const navigate = useNavigate();

  useEffect(() => {
    capture("signup_viewed");
  }, []);

  useEffect(() => {
    if (session) {
      // If we just upgraded from an anonymous session, migrate that data over
      // to the new account before sending the user into the workspace.
      void claimAnonymous(session.access_token, name || undefined).finally(() => {
        navigate("/workspace", { replace: true });
      });
    }
  }, [session, navigate, claimAnonymous, name]);

  // Lightweight password strength heuristic — purely visual; the real
  // policy (>=8 chars) is enforced server-side by Supabase.
  const passwordScore = (() => {
    let s = 0;
    if (password.length >= 8) s += 1;
    if (password.length >= 12) s += 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s += 1;
    if (/\d/.test(password)) s += 1;
    if (/[^A-Za-z0-9]/.test(password)) s += 1;
    return Math.min(s, 4);
  })();
  const strengthLabel = ["Too short", "Weak", "Fair", "Good", "Strong"][passwordScore];
  const strengthColor = ["#ef4444", "#f97316", "#eab308", "#3b82f6", "#22c55e"][passwordScore];

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    if (!termsAccepted) {
      setErrorMessage("Please accept the Terms of Service and Privacy Policy to continue.");
      setLoading(false);
      return;
    }
    // Pass $set so PostHog links this anonymous session to the user's email
    // immediately — even if they abandon before confirming their account.
    capture("signup_form_submitted", { method: "email", $set: { email, $email: email, name, $name: name } });
    const { error } = await signUpWithPassword(email, password, name);
    setLoading(false);
    if (error) {
      capture("signup_error", { method: "email", message: error.message });
      setErrorMessage(error.message);
      return;
    }
    capture("signup_success", { method: "email" });
    setSuccessMessage("Check your email to confirm your account.");
  };

  const handleProvider = async (provider: "google" | "github") => {
    if (!termsAccepted) {
      setErrorMessage("Please accept the Terms of Service and Privacy Policy to continue.");
      return;
    }
    capture("signup_oauth_clicked", { provider });
    setLoading(true);
    const { error } = await signInWithProvider(provider);
    setLoading(false);
    if (error) {
      capture("signup_error", { method: provider, message: error.message });
      setErrorMessage(error.message);
    }
  };

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">Create your datahub.org.in account</h1>
        <p className="auth-sub">1 month free on all paid plans — no credit card needed to get started.</p>
        <ul className="auth-trust">
          <li>✓ 15-day free trial on any paid plan</li>
          <li>✓ No credit card</li>
          <li>✓ 2-minute setup</li>
        </ul>
        {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
        {successMessage ? <p className="auth-success">{successMessage}</p> : null}

        {/* OAuth first — one-click signup converts ~20–30% better than forms. */}
        <div className="auth-actions">
          <button className="btn" disabled={loading} type="button" onClick={() => void handleProvider("google")}>Continue with Google</button>
          <button className="btn" disabled={loading} type="button" onClick={() => void handleProvider("github")}>Continue with GitHub</button>
        </div>

        <div className="auth-divider"><span>or sign up with email</span></div>

        <div className="auth-group">
          <label className="auth-label" htmlFor="name">Full name</label>
          <input id="name" className="auth-input" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex Rivera" required />
        </div>
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
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              minLength={8}
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
          {password.length > 0 ? (
            <div className="auth-strength">
              <div className="auth-strength-bar">
                <div
                  className="auth-strength-fill"
                  style={{ width: `${(passwordScore / 4) * 100}%`, background: strengthColor }}
                />
              </div>
              <span className="auth-strength-label" style={{ color: strengthColor }}>{strengthLabel}</span>
            </div>
          ) : (
            <span style={{ fontSize: 11, color: "var(--tx2)", marginTop: 4, display: "block" }}>Minimum 8 characters</span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, margin: "12px 0" }}>
          <input
            id="terms"
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            style={{ marginTop: 2, accentColor: "#5B6AF0", width: 15, height: 15, flexShrink: 0, cursor: "pointer" }}
          />
          <label htmlFor="terms" style={{ fontSize: 12, color: "var(--tx1)", lineHeight: 1.5, cursor: "pointer" }}>
            I agree to datahub.org.in&apos;s{" "}
            <a href="/terms" target="_blank" rel="noreferrer" style={{ color: "#5B6AF0", textDecoration: "underline" }} onClick={(e) => e.stopPropagation()}>
              Terms of Service
            </a>
            {" "}and{" "}
            <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: "#5B6AF0", textDecoration: "underline" }} onClick={(e) => e.stopPropagation()}>
              Privacy Policy
            </a>
          </label>
        </div>

        <div className="auth-actions">
          <button
            className="btn btn-primary"
            disabled={loading || !termsAccepted || !email.trim() || password.length < 8}
            type="submit"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </div>

        <div className="auth-row" style={{ marginTop: 12 }}>
          <span style={{ color: "var(--tx1)" }}>Already have an account?</span>
          <Link className="auth-link" to="/login">Sign in</Link>
        </div>
      </form>
    </div>
  );
}
