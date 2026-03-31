import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function SignupPage() {
  const { signUpWithPassword, signInWithProvider, session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"analyst" | "engineer" | "manager" | "admin">("analyst");
  const [termsAccepted, setTermsAccepted] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    if (session) {
      navigate("/workspace", { replace: true });
    }
  }, [session, navigate]);

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
    const { error } = await signUpWithPassword(email, password, name, role);
    setLoading(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setSuccessMessage("Check your email to confirm your account.");
  };

  const handleProvider = async (provider: "google" | "github") => {
    setLoading(true);
    const { error } = await signInWithProvider(provider);
    setLoading(false);
    if (error) setErrorMessage(error.message);
  };

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">Create your DataHub account</h1>
        <p className="auth-sub">Start importing, transforming, and scheduling data workflows.</p>
        {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
        {successMessage ? <p className="auth-success">{successMessage}</p> : null}

        <div className="auth-group">
          <label className="auth-label" htmlFor="name">Full name</label>
          <input id="name" className="auth-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex Rivera" required />
        </div>
        <div className="auth-group">
          <label className="auth-label" htmlFor="email">Email</label>
          <input id="email" className="auth-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required />
        </div>
        <div className="auth-group">
          <label className="auth-label" htmlFor="password">Password</label>
          <input id="password" className="auth-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required />
        </div>
        <div className="auth-group">
          <label className="auth-label" htmlFor="role">Primary role</label>
          <select id="role" className="auth-select" value={role} onChange={(event) => setRole(event.target.value as "analyst" | "engineer" | "manager" | "admin") }>
            <option value="analyst">Analyst</option>
            <option value="engineer">Engineer</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
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
            I agree to DataHub&apos;s{" "}
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
          <button className="btn btn-primary" disabled={loading || !termsAccepted} type="submit">{loading ? "Creating account..." : "Create account"}</button>
          <button className="btn" disabled={loading} type="button" onClick={() => void handleProvider("google")}>Continue with Google</button>
          <button className="btn" disabled={loading} type="button" onClick={() => void handleProvider("github")}>Continue with GitHub</button>
        </div>

        <div className="auth-row" style={{ marginTop: 12 }}>
          <span style={{ color: "var(--tx1)" }}>Already have an account?</span>
          <Link className="auth-link" to="/login">Sign in</Link>
        </div>
      </form>
    </div>
  );
}
