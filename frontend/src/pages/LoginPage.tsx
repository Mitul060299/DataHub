import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

type LocationState = {
  from?: { pathname?: string };
};

export function LoginPage() {
  const { signInWithPassword, signInWithProvider, session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const destination = state?.from?.pathname ?? "/workspace";

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
