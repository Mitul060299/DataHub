import posthog from "posthog-js";

const key = import.meta.env.VITE_POSTHOG_API_KEY as string | undefined;

if (key) {
  posthog.init(key, {
    api_host: "https://app.posthog.com",
    capture_pageview: false, // tracked manually on route change for SPA
    autocapture: true,        // clicks/inputs/forms — needed for funnels & heatmaps
    persistence: "localStorage",
    disable_session_recording: false, // session replay enabled
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-private]",
    },
  });
}

export const capture = (event: string, props?: Record<string, unknown>): void => {
  try {
    if (key) posthog.capture(event, props);
  } catch {
    // never throw
  }
};

export const capturePageview = (path?: string): void => {
  try {
    if (key) posthog.capture("$pageview", path ? { $current_url: window.location.origin + path } : undefined);
  } catch {
    // never throw
  }
};

export const identify = (userId: string, traits?: Record<string, unknown>): void => {
  try {
    if (key) posthog.identify(userId, traits);
  } catch {
    // never throw
  }
};

export const reset = (): void => {
  try {
    if (key) posthog.reset();
  } catch {
    // never throw
  }
};

export default posthog;
