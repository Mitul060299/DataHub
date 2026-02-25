import { useCallback, useEffect, useState } from "react";
import { fetchDatasetPage } from "../api";

export type DatasetPreviewResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
};

export function useDataset(datasetId?: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DatasetPreviewResult | null>(null);

  const load = useCallback(async () => {
    if (!datasetId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetchDatasetPage(datasetId, 0, 100);
      setData({
        columns: response.columns ?? [],
        rows: response.rows ?? [],
        totalRows: response.total_rows ?? 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dataset preview");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [datasetId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { loading, error, data, refetch: load };
}
