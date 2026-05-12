/**
 * Activation milestone tracker.
 *
 * Wraps both:
 *   1. PostHog client-side capture (fast, survives no-auth flows)
 *   2. Backend POST /users/me/milestones/{name} (adblocker-proof, persists to DB)
 *
 * Every funnel step fires through here so the PostHog funnel and the DB
 * cohorts stay consistent.
 *
 * Usage
 * -----
 *   import { recordMilestone } from "../lib/activation";
 *   recordMilestone("dataset_loaded", { source: "sample" });
 */

import { capture } from "./posthog";
import { api } from "../api";

export type Milestone =
  | "workspace_first_visit"
  | "dataset_loaded"
  | "ai_prompt_submitted"
  | "aha_first_ai_answer"
  | "pipeline_step_approved"
  | "result_exported";

/**
 * Records an activation milestone.
 *
 * - Fires a PostHog event immediately (synchronous, best-effort).
 * - Sends a background request to the backend (idempotent; does not block
 *   the calling code if it fails).
 *
 * The backend endpoint returns { first_time: boolean } but the return value
 * is intentionally ignored by callers — the milestone should be treated as
 * already recorded from the first call and the component should not rely on
 * the server response for UI state.
 */
export function recordMilestone(
  milestone: Milestone,
  props?: Record<string, unknown>,
): void {
  // 1. PostHog (client-side, immediate)
  capture(milestone, props);

  // 2. Backend (async, fire-and-forget, adblocker-proof)
  api
    .post(`/users/me/milestones/${milestone}`)
    .catch(() => {
      // Silently swallow — the PostHog event is the fallback
    });
}
