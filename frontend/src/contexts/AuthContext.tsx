import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AuthError, Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { clearAuthToken, setAuthToken } from "../utils/auth";
import { capture, identify, reset, setUserType, markAsRealUser } from "../lib/posthog";
import { setSentryUser, clearSentryUser } from "../lib/sentry";

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
const ANON_TOKEN_KEY = "datahub_anon_token";
const ANON_USER_ID_KEY = "datahub_anon_user_id";
// Set transiently by claimAnonymous() so the auth-state listener knows the
// migration is in flight and must NOT wipe per-tenant localStorage (the
// pipeline / dataset state still belongs to the now-authed user).
const CLAIM_IN_FLIGHT_KEY = "datahub_claim_in_flight";

// Unscoped per-tenant keys written by anon (and legacy authed) sessions.
// When an anonymous visitor signs in to (or signs up into) a DIFFERENT real
// account WITHOUT going through claim, these keys would otherwise leak the
// demo's dataset / pipeline / chat / onboarding state into the real account's
// first page render. We scrub them on every anon -> authed transition that
// isn't an explicit claim.
const UNSCOPED_TENANT_KEYS = [
  "activeWorkspaceId",
  "activeDatasetId",
  "activeProjectId",
  "datahub_onboarding_dismissed",
  "datahub_workspace_first_visit_recorded",
];
const UNSCOPED_TENANT_PREFIXES = [
  "datahub_chat_session_",
  "datahub_steps_v2_",
  "datahub_live_artifact_",
];

function wipeUnscopedTenantState() {
  try {
    for (const k of UNSCOPED_TENANT_KEYS) {
      localStorage.removeItem(k);
    }
    sessionStorage.removeItem("datahub_welcome_home_shown");
    sessionStorage.removeItem("datahub_signup_intent");
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key && UNSCOPED_TENANT_PREFIXES.some((p) => key.startsWith(p))) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore quota / disabled storage errors
  }
  // Signal React contexts (e.g. WorkspaceContext) to discard per-user
  // in-memory state so stale projects/datasets can't bleed into the next session.
  try { window.dispatchEvent(new CustomEvent("datahub:auth:user-changed")); } catch { /* ignore */ }
}

// Synthetic session shape for anonymous users so the rest of the app can keep
// reading `session?.user?.id`/`user?.email` without branching everywhere.
type AnonSession = {
  isAnonymous: true;
  user: { id: string; email: string };
  access_token: string;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isSuperuser: boolean;
  isAuthenticated: boolean;     // true for either real or anonymous sessions
  isAnonymous: boolean;
  anonUserId: string | null;
  signInWithPassword: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUpWithPassword: (
    email: string,
    password: string,
    fullName?: string,
    role?: "analyst" | "engineer" | "manager" | "admin"
  ) => Promise<{ error: AuthError | null }>;
  signInWithProvider: (provider: "google" | "github") => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<{ error: AuthError | null }>;
  resetPasswordEmail: (email: string) => Promise<{ error: AuthError | null }>;
  /** After Supabase signup completes, migrate anon data to the real account. */
  claimAnonymous: (supabaseAccessToken: string, name?: string) => Promise<{ ok: boolean; migrated?: boolean }>;
  /** Force-create an anon account even if one already exists (used after sign-out). */
  ensureAnonymousSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [anonSession, setAnonSession] = useState<AnonSession | null>(null);
  const [loading, setLoading] = useState(true);

  // In-flight guard: concurrent callers (loadSession + onAuthStateChange both
  // fire on mount) share the same bootstrap promise instead of each minting a
  // separate anon account and hammering the rate limiter.
  const anonBootstrapRef = useRef<Promise<void> | null>(null);

  // Bootstrap (or restore) an anonymous account.  Idempotent: returns existing
  // anon session from localStorage if present (and not expired), otherwise mints one server-side.
  const ensureAnonymousSession = useCallback(async () => {
    const existingTok = localStorage.getItem(ANON_TOKEN_KEY);
    const existingId = localStorage.getItem(ANON_USER_ID_KEY);
    if (existingTok && existingId) {
      // Validate the token hasn't expired (or is within 7 days of expiry).
      // If it has, fall through to mint a fresh token.
      let tokenValid = true;
      try {
        const parts = existingTok.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
          const now = Math.floor(Date.now() / 1000);
          const sevenDays = 7 * 24 * 60 * 60;
          if (payload.exp && payload.exp < now + sevenDays) {
            tokenValid = false;
          }
        }
      } catch {
        // If we can't parse the token, assume it's invalid
        tokenValid = false;
      }
      if (tokenValid) {
        const synth: AnonSession = {
          isAnonymous: true,
          user: { id: existingId, email: existingId },
          access_token: existingTok,
        };
        setAnonSession(synth);
        setAuthToken(existingTok);
        // Restore PostHog identity for returning guest so events stay linked.
        identify(existingId, { is_anonymous: true });
        setUserType("anonymous");
        capture("anon_session_restored", { user_id: existingId });
        return;
      }
      // Token expired or near-expiry — clear it and mint a fresh one.
      localStorage.removeItem(ANON_TOKEN_KEY);
      localStorage.removeItem(ANON_USER_ID_KEY);
    }
    // If a bootstrap POST is already in-flight (e.g. loadSession and
    // onAuthStateChange fired concurrently), join that promise instead of
    // firing a duplicate request that would hit the rate limiter.
    if (anonBootstrapRef.current) {
      return anonBootstrapRef.current;
    }
    const doBootstrap = async () => {
      // Helper: POST /auth/anonymous with one automatic retry on transient failures.
      // On 429, waits for the Retry-After window then retries once.
      const postAnon = async (): Promise<{ access_token: string; user_id: string }> => {
        const res = await fetch(`${API_BASE}/auth/anonymous`, { method: "POST" });
        if (res.status === 429) {
          // Read Retry-After (seconds) from header; default to 10 s.
          const retryAfter = parseInt(res.headers.get("Retry-After") ?? "10", 10);
          const waitMs = Math.min((isNaN(retryAfter) ? 10 : retryAfter) * 1000, 30_000);
          await new Promise((r) => setTimeout(r, waitMs));
          const retry = await fetch(`${API_BASE}/auth/anonymous`, { method: "POST" });
          if (!retry.ok) throw new Error(`HTTP ${retry.status}`);
          return retry.json() as Promise<{ access_token: string; user_id: string }>;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ access_token: string; user_id: string }>;
      };
      try {
        const data = await postAnon();
        localStorage.setItem(ANON_TOKEN_KEY, data.access_token);
        localStorage.setItem(ANON_USER_ID_KEY, data.user_id);
        const synth: AnonSession = {
          isAnonymous: true,
          user: { id: data.user_id, email: data.user_id },
          access_token: data.access_token,
        };
        setAnonSession(synth);
        setAuthToken(data.access_token);
        identify(data.user_id, { is_anonymous: true });
        setUserType("anonymous");
        capture("anon_session_created", { user_id: data.user_id });
      } catch (firstErr) {
        console.warn("Failed to bootstrap anonymous session (attempt 1)", firstErr);
        // Retry once after a delay — handles cold-start backend latency.
        try {
          await new Promise((r) => setTimeout(r, 2000));
          const data2 = await postAnon();
            localStorage.setItem(ANON_TOKEN_KEY, data2.access_token);
            localStorage.setItem(ANON_USER_ID_KEY, data2.user_id);
            const synth2: AnonSession = {
              isAnonymous: true,
              user: { id: data2.user_id, email: data2.user_id },
              access_token: data2.access_token,
            };
            setAnonSession(synth2);
            setAuthToken(data2.access_token);
            identify(data2.user_id, { is_anonymous: true });
            setUserType("anonymous");
            capture("anon_session_created", { user_id: data2.user_id });
        } catch (retryErr) {
          console.warn("Failed to bootstrap anonymous session (attempt 2)", retryErr);
        }
      } finally {
        anonBootstrapRef.current = null;
      }
    };
    anonBootstrapRef.current = doBootstrap();
    return anonBootstrapRef.current;
  }, []);

  useEffect(() => {
    let mounted = true;

    const identifyFromSession = (s: Session | null) => {
      const u = s?.user;
      if (!u) return;
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      const email = u.email ?? (typeof meta.email === "string" ? meta.email : undefined);
      const name =
        (typeof meta.full_name === "string" && meta.full_name) ||
        (typeof meta.name === "string" && meta.name) ||
        undefined;
      const traits: Record<string, unknown> = {};
      if (email) {
        // Set both keys so PostHog's persons list shows the email regardless
        // of which property it inspects.
        traits.email = email;
        traits.$email = email;
      }
      if (name) {
        traits.name = name;
        traits.$name = name;
      }
      identify(u.id, {
        ...traits,
        $set_once: {
          signed_up_at: u.created_at,
          signed_up: true,
        },
      });
      markAsRealUser();
      setSentryUser(u.id, email);
    };

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error) {
        console.warn("Failed to load Supabase session.");
      }
      const nextSession = data.session ?? null;
      setSession(nextSession);
      if (nextSession?.access_token) {
        setAuthToken(nextSession.access_token);
        // Real session present — clear any leftover anon credentials.
        const hadAnon = !!localStorage.getItem(ANON_TOKEN_KEY);
        localStorage.removeItem(ANON_TOKEN_KEY);
        localStorage.removeItem(ANON_USER_ID_KEY);
        // If the previous tab state was an anonymous demo session and this is
        // NOT a claim-migration (which keeps the data), scrub leaked demo
        // pipeline / dataset / chat / onboarding state so it doesn't render
        // inside the now-authed account.
        const claimInFlight = sessionStorage.getItem(CLAIM_IN_FLIGHT_KEY) === "1";
        if (hadAnon && !claimInFlight) {
          wipeUnscopedTenantState();
        }
        sessionStorage.removeItem(CLAIM_IN_FLIGHT_KEY);
        setAnonSession(null);
        setUserType("registered");
        identifyFromSession(nextSession);
      } else {
        // No real session — bootstrap (or restore) an anonymous one so the
        // entire product is usable without sign-up.
        await ensureAnonymousSession();
      }
      setLoading(false);
    };

    loadSession();

    // Track whether we've ever observed a real (non-null) Supabase session.
    // onAuthStateChange fires with INITIAL_SESSION=null on mount; treating
    // that like a sign-out would race with loadSession's awaited bootstrap
    // and prematurely flip loading=false before the anon JWT arrives.
    let hadRealSession = false;

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.access_token) {
        hadRealSession = true;
        setAuthToken(nextSession.access_token);
        // Drop anon credentials once the user is on a real account.
        const hadAnon = !!localStorage.getItem(ANON_TOKEN_KEY);
        localStorage.removeItem(ANON_TOKEN_KEY);
        localStorage.removeItem(ANON_USER_ID_KEY);
        const claimInFlight = sessionStorage.getItem(CLAIM_IN_FLIGHT_KEY) === "1";
        if (hadAnon && !claimInFlight) {
          // Anon -> authed without an explicit claim migration: scrub demo
          // state so it can't leak into the real account.
          wipeUnscopedTenantState();
        }
        sessionStorage.removeItem(CLAIM_IN_FLIGHT_KEY);
        setAnonSession(null);
        setUserType("registered");
        identifyFromSession(nextSession);
        setLoading(false);
      } else if (hadRealSession) {
        // Real sign-out: clear creds and bootstrap a fresh anon session.
        clearAuthToken();
        reset();
        clearSentryUser();
        wipeUnscopedTenantState();
        hadRealSession = false;
        void ensureAnonymousSession();
        setLoading(false);
      }
      // Initial INITIAL_SESSION=null is a no-op here — loadSession() owns
      // the initial anonymous bootstrap and will flip loading=false when done.
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // Ref to the current anonymous session so the session-expired handler
  // (which closes over nothing) can check auth state without stale closure.
  const anonSessionRef = useRef<AnonSession | null>(null);
  useEffect(() => { anonSessionRef.current = anonSession; }, [anonSession]);

  // React to expired/invalid sessions surfaced by the axios interceptor.
  useEffect(() => {
    const handler = () => {
      // If the user is anonymous, clear the stale token and bootstrap a fresh
      // session — don't redirect to /login (they were never "signed in").
      if (anonSessionRef.current) {
        localStorage.removeItem(ANON_TOKEN_KEY);
        localStorage.removeItem(ANON_USER_ID_KEY);
        setAnonSession(null);
        void ensureAnonymousSession();
        return;
      }
      void supabase.auth.signOut().finally(() => {
        if (typeof window !== "undefined") {
          const path = window.location.pathname || "";
          const onAuthPage = ["/login", "/signup", "/reset", "/forgot"].some((p) => path.startsWith(p));
          if (!onAuthPage) {
            window.location.assign("/login?reason=session_expired");
          }
        }
      });
    };
    window.addEventListener("datahub:session-expired", handler);
    return () => window.removeEventListener("datahub:session-expired", handler);
  }, [ensureAnonymousSession]);

  const signInWithPassword = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUpWithPassword = async (
    email: string,
    password: string,
    fullName?: string,
    role?: "analyst" | "engineer" | "manager" | "admin"
  ) => {
    const metadata: Record<string, string> = {};
    if (fullName) {
      metadata.full_name = fullName;
    }
    if (role) {
      metadata.role = role;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: Object.keys(metadata).length ? { data: metadata } : undefined,
    });
    return { error };
  };

  const signInWithProvider = async (provider: "google" | "github") => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/login` },
    });
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const resetPasswordEmail = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    return { error };
  };

  // Migrate anon work to the new Supabase account.  Called from SignupPage
  // after Supabase auth completes.  Best-effort: we don't block sign-up if it
  // fails, but we log loudly.
  const claimAnonymous = useCallback(async (supabaseAccessToken: string, name?: string) => {
    const anonTok = localStorage.getItem(ANON_TOKEN_KEY);
    if (!anonTok) {
      return { ok: true, migrated: false };
    }
    // Tell the auth-state listener NOT to wipe per-tenant localStorage when
    // the supabase session lands — the backend is migrating the anon's rows
    // to the new account, so the cached pipeline/dataset state is still valid.
    try { sessionStorage.setItem(CLAIM_IN_FLIGHT_KEY, "1"); } catch { /* ignore */ }
    try {
      const res = await fetch(`${API_BASE}/auth/claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonTok}`,
        },
        body: JSON.stringify({ supabase_token: supabaseAccessToken, name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn("Anon claim failed", data);
        // Claim failed -> the listener should treat this like an unmigrated
        // anon->authed transition and wipe demo state on the next session.
        try { sessionStorage.removeItem(CLAIM_IN_FLIGHT_KEY); } catch { /* ignore */ }
        return { ok: false };
      }
      // Drop the anon token so future requests use the real Supabase JWT.
      localStorage.removeItem(ANON_TOKEN_KEY);
      localStorage.removeItem(ANON_USER_ID_KEY);
      setAnonSession(null);
      const migrated = !!(data as { migrated?: boolean }).migrated;
      setUserType("registered");
      capture("anon_claim_success", { migrated });
      return { ok: true, migrated };
    } catch (e) {
      console.warn("Anon claim error", e);
      try { sessionStorage.removeItem(CLAIM_IN_FLIGHT_KEY); } catch { /* ignore */ }
      capture("anon_claim_failed");
      return { ok: false };
    }
  }, []);

  const user = session?.user ?? null;
  const isAuthenticated = !!session || !!anonSession;
  const isAnonymous = !session && !!anonSession;
  const anonUserId = anonSession?.user.id ?? null;
  const isSuperuser = useMemo(() => {
    const role = user?.app_metadata?.role || user?.user_metadata?.role;
    return role === "superuser" || role === "admin";
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        isSuperuser,
        isAuthenticated,
        isAnonymous,
        anonUserId,
        signInWithPassword,
        signUpWithPassword,
        signInWithProvider,
        signOut,
        resetPasswordEmail,
        claimAnonymous,
        ensureAnonymousSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
