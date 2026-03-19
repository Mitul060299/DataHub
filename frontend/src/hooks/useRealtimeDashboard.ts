import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { api } from "../api";

export interface DashboardRefreshState {
  /** Tile IDs currently being refreshed (show pulse indicator). */
  refreshingTileIds: Set<string>;
  /** ISO timestamp of the last successful refresh. */
  lastRefreshedAt: string | null;
  /** True if the last pipeline run failed. */
  refreshFailed: boolean;
  /** ISO timestamp of the last failed refresh attempt. */
  failedAt: string | null;
  /** Toast message to show (cleared after 4 s). */
  toastMessage: string | null;
  /** Manually trigger a run for the pipeline bound to this dashboard. */
  triggerManualRun: (pipelineId: string) => Promise<string | null>;
}

/**
 * Subscribe to Supabase Realtime broadcast events for a specific dashboard.
 *
 * On `refresh_complete`:
 *   - Marks tile IDs as refreshing (shows pulse badge, keeps old data visible).
 *   - Re-fetches tile data for those tiles via provided `onTilesRefresh`.
 *   - Clears refreshing state once done.
 *   - Sets `lastRefreshedAt` and shows toast.
 *
 * On `pipeline_failed`:
 *   - Sets `refreshFailed = true`, `failedAt = now`.
 *   - Old tile data remains visible — never blanked.
 */
export function useRealtimeDashboard(
  dashboardId: string | null | undefined,
  onTilesRefresh?: (tileIds: string[]) => Promise<void>,
): DashboardRefreshState {
  const [refreshingTileIds, setRefreshingTileIds] = useState<Set<string>>(new Set());
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [failedAt, setFailedAt] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(null), 4000);
  }, []);

  const triggerManualRun = useCallback(
    async (pipelineId: string): Promise<string | null> => {
      try {
        const resp = await api.post<{ run_id: string }>(
          `/api/pipelines/${pipelineId}/run`,
        );
        return resp.data?.run_id ?? null;
      } catch {
        return null;
      }
    },
    [],
  );

  useEffect(() => {
    if (!dashboardId) return;

    const channel = supabase.channel(`dashboard:${dashboardId}`);

    channel.on(
      "broadcast",
      { event: "refresh_complete" },
      async (msg: { payload?: { tile_ids?: string[]; timestamp?: string } }) => {
        const payload = msg.payload ?? {};
        const tileIds: string[] = payload.tile_ids ?? [];
        const ts = payload.timestamp ?? new Date().toISOString();

        if (tileIds.length > 0) {
          setRefreshingTileIds(new Set(tileIds));
        }
        setRefreshFailed(false);

        // Re-fetch fresh tile data in the background
        if (onTilesRefresh) {
          try {
            await onTilesRefresh(tileIds);
          } catch {
            // no-op — keep previous data
          }
        }

        setRefreshingTileIds(new Set());
        setLastRefreshedAt(ts);
        showToast("Dashboard data refreshed");
      },
    );

    channel.on(
      "broadcast",
      { event: "pipeline_failed" },
      (msg: { payload?: { timestamp?: string } }) => {
        const ts = msg.payload?.timestamp ?? new Date().toISOString();
        setRefreshFailed(true);
        setFailedAt(ts);
        showToast("Last refresh failed — previous data shown");
      },
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [dashboardId, onTilesRefresh, showToast]);

  return {
    refreshingTileIds,
    lastRefreshedAt,
    refreshFailed,
    failedAt,
    toastMessage,
    triggerManualRun,
  };
}
