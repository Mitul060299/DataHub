import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AuthError, Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { clearAuthToken, setAuthToken } from "../utils/auth";
import { identify, reset } from "../lib/posthog";
import { setSentryUser, clearSentryUser } from "../lib/sentry";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isSuperuser: boolean;
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
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

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
        // Re-identify returning visitors on every page load so PostHog never
        // falls back to the anonymous distinct_id for an already-logged-in user.
        identifyFromSession(nextSession);
      } else {
        clearAuthToken();
      }
      setLoading(false);
    };

    loadSession();

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.access_token) {
        setAuthToken(nextSession.access_token);
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

  const user = session?.user ?? null;
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
        signInWithPassword,
        signUpWithPassword,
        signInWithProvider,
        signOut,
        resetPasswordEmail,
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
