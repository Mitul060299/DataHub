import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const env = (import.meta.env.MODE as string) || "development";

if (dsn) {
  Sentry.init({
    dsn,
    environment: env,
    tracesSampleRate: env === "production" ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,       // no automatic session replay (PostHog handles UX replay)
    replaysOnErrorSampleRate: 1.0,     // record only when an error occurs
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
    ],
    // Strip noisy / expected errors
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "Non-Error promise rejection captured",
      "NetworkError when attempting to fetch resource",
    ],
  });
}

export const captureError = (err: unknown, ctx?: Record<string, unknown>): void => {
  try {
    if (!dsn) return;
    Sentry.captureException(err, ctx ? { extra: ctx } : undefined);
  } catch {
    // never throw
  }
};

export const setSentryUser = (id: string, email?: string): void => {
  try {
    if (!dsn) return;
    Sentry.setUser({ id, email });
  } catch {
    // never throw
  }
};

export const clearSentryUser = (): void => {
  try {
    if (!dsn) return;
    Sentry.setUser(null);
  } catch {
    // never throw
  }
};

export default Sentry;
