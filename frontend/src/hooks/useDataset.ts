import { useCallback, useEffect, useState } from "react";
import { fetchDatasetPage, listCalculatedColumns } from "../api";
import type { CalculatedColumn } from "../types";

export type DatasetPreviewResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  calculatedColumns: CalculatedColumn[];
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
      const [response, calculatedColumns] = await Promise.all([
        fetchDatasetPage(datasetId, 0, 100),
        listCalculatedColumns(datasetId),
      ]);
      setData({
        columns: response.columns ?? [],
        rows: response.rows ?? [],
        totalRows: response.total_rows ?? 0,
        calculatedColumns,
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
