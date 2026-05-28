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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useSEO({
    title: "Sign Up – Get Your AI Agent for Data Work | DataHub",
    description:
      "Create your free DataHub account. No credit card required. Get an AI agent for one-off data tasks and a visual pipeline builder for the work you do every week.",
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
      void claimAnonymous(session.access_token).finally(() => {
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
    capture("signup_form_submitted", { method: "email", $set: { email, $email: email } });
    const { error } = await signUpWithPassword(email, password);
    setLoading(false);
    if (error) {
      capture("signup_error", { method: "email", message: error.message });
      setErrorMessage(error.message);
      return;
    }
    // Store the signup method so identifyFromSession fires signup_success
    // under the real user distinct_id once the session is established.
    localStorage.setItem("datahub_signup_pending", "email");
    setSuccessMessage("Check your email to confirm your account.");
  };

  const handleProvider = async (provider: "google" | "github") => {
    capture("signup_oauth_clicked", { provider });
    // Flag so identifyFromSession fires signup_success after the OAuth redirect.
    localStorage.setItem("datahub_signup_pending", provider);
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
        <h1 className="auth-title">Get your AI agent for data work</h1>
        <p className="auth-sub">Free plan included. 15-day trial on all paid plans — no credit card needed.</p>
        <ul className="auth-trust">
          <li>✓ 15-day free trial on any paid plan</li>
          <li>✓ No credit card</li>
          <li>✓ 2-minute setup</li>
        </ul>
        {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
        {successMessage ? <p className="auth-success">{successMessage}</p> : null}

        {/* OAuth first — one-click signup converts ~20–30% better than forms. */}
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
        <p style={{ fontSize: 12, color: "var(--tx2)", textAlign: "center", margin: "8px 0 0" }}>
          By signing up, you agree to our{" "}
          <a href="/terms" target="_blank" rel="noreferrer" style={{ color: "#5B6AF0" }}>Terms</a>
          {" "}and{" "}
          <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: "#5B6AF0" }}>Privacy Policy</a>
        </p>

        <div className="auth-divider"><span>or sign up with email</span></div>

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

        <div className="auth-actions">
          <button
            className="btn btn-primary"
            disabled={loading || !email.trim() || password.length < 8}
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
