import { Card, Descriptions, Typography } from "antd";
import { useEffect, useState } from "react";
import { fetchCacheStats } from "../api";
import { notify } from "../utils/notify";

interface CacheStats {
  profile_cache: { size: number; ttl_seconds: number; max_items: number };
  dataset_cache: {
    cached_datasets: number;
    max_cached: number;
    ttl_seconds: number;
    oldest_access: number | null;
    newest_access: number | null;
  };
}

export function CacheStatsPanel() {
  const [stats, setStats] = useState<CacheStats | null>(null);

  useEffect(() => {
    fetchCacheStats()
      .then(setStats)
      .catch((err: any) => {
        const detail = err?.response?.data?.detail || "Failed to load cache stats.";
        notify.error(detail);
      });
  }, []);

  return (
    <Card>
      <Descriptions size="small" bordered column={1}>
        <Descriptions.Item label="Profile cache size">
          {stats?.profile_cache.size ?? 0}
        </Descriptions.Item>
        <Descriptions.Item label="Profile cache TTL">
          {stats?.profile_cache.ttl_seconds ?? 0}s
        </Descriptions.Item>
        <Descriptions.Item label="Profile cache max items">
          {stats?.profile_cache.max_items ?? 0}
        </Descriptions.Item>
        <Descriptions.Item label="Dataset cache size">
          {stats?.dataset_cache.cached_datasets ?? 0}
        </Descriptions.Item>
        <Descriptions.Item label="Dataset cache TTL">
          {stats?.dataset_cache.ttl_seconds ?? 0}s
        </Descriptions.Item>
        <Descriptions.Item label="Dataset cache max">
          {stats?.dataset_cache.max_cached ?? 0}
        </Descriptions.Item>
      </Descriptions>
      {!stats && <Typography.Text type="secondary">No stats yet.</Typography.Text>}
    </Card>
  );
}
