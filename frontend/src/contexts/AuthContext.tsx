import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AuthError, Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { clearAuthToken, setAuthToken } from "../utils/auth";
import { identify, reset } from "../lib/posthog";

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
        if (nextSession.user) {
          identify(nextSession.user.id, { email: nextSession.user.email });
        }
      } else {
        clearAuthToken();
        reset();
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
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
