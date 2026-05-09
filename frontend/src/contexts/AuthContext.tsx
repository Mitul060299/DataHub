import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AuthError, Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { clearAuthToken, setAuthToken } from "../utils/auth";
import { capture, identify, reset, setUserType } from "../lib/posthog";
import { setSentryUser, clearSentryUser } from "../lib/sentry";

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
const ANON_TOKEN_KEY = "datahub_anon_token";
const ANON_USER_ID_KEY = "datahub_anon_user_id";

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

  // Bootstrap (or restore) an anonymous account.  Idempotent: returns existing
  // anon session from localStorage if present, otherwise mints one server-side.
  const ensureAnonymousSession = useCallback(async () => {
    const existingTok = localStorage.getItem(ANON_TOKEN_KEY);
    const existingId = localStorage.getItem(ANON_USER_ID_KEY);
    if (existingTok && existingId) {
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
    try {
      const res = await fetch(`${API_BASE}/auth/anonymous`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { access_token: string; user_id: string };
      localStorage.setItem(ANON_TOKEN_KEY, data.access_token);
      localStorage.setItem(ANON_USER_ID_KEY, data.user_id);
      const synth: AnonSession = {
        isAnonymous: true,
        user: { id: data.user_id, email: data.user_id },
        access_token: data.access_token,
      };
      setAnonSession(synth);
      setAuthToken(data.access_token);
      // Identify new guest in PostHog so all subsequent events are linked.
      identify(data.user_id, { is_anonymous: true });
      setUserType("anonymous");
      capture("anon_session_created", { user_id: data.user_id });
    } catch (e) {
      console.warn("Failed to bootstrap anonymous session", e);
    }
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
      identify(u.id, traits);
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
        localStorage.removeItem(ANON_TOKEN_KEY);
        localStorage.removeItem(ANON_USER_ID_KEY);
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

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.access_token) {
        setAuthToken(nextSession.access_token);
        // Drop anon credentials once the user is on a real account.
        localStorage.removeItem(ANON_TOKEN_KEY);
        localStorage.removeItem(ANON_USER_ID_KEY);
        setAnonSession(null);
        identifyFromSession(nextSession);
      } else {
        clearAuthToken();
        reset();
        clearSentryUser();
        // Scrub per-user state from localStorage so a subsequent user on a shared
        // computer doesn't inherit the previous tenant's workspace/dataset context.
        try {
          const keysToClear = [
            "activeWorkspaceId",
            "activeDatasetId",
            "activeProjectId",
            "datahub_onboarding_dismissed",
          ];
          for (const k of keysToClear) {
            localStorage.removeItem(k);
          }
          // Per-dataset chat sessions: enumerate and drop any datahub_chat_session_*
          for (let i = localStorage.length - 1; i >= 0; i -= 1) {
            const key = localStorage.key(i);
            if (key && key.startsWith("datahub_chat_session_")) {
              localStorage.removeItem(key);
            }
          }
        } catch {
          // ignore quota / disabled storage errors
        }
        // Sign-out completed — fall back to a brand new anon session so the
        // visitor isn't kicked out of the app entirely.
        void ensureAnonymousSession();
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // React to expired/invalid sessions surfaced by the axios interceptor.
  useEffect(() => {
    const handler = () => {
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
  }, []);

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
