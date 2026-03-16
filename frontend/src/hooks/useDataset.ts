import { useCallback, useEffect, useRef, useState } from "react";
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
  // generation counter prevents a stale concurrent load from overwriting
  // a newer load (e.g. refetch() called with old id races against useEffect
  // triggered by a new datasetId)
  const genRef = useRef(0);

  const load = useCallback(async () => {
    if (!datasetId) {
      setData(null);
      return;
    }
    const gen = ++genRef.current;
    setLoading(true);
    setError(null);
    try {
      const [response, calculatedColumns] = await Promise.all([
        fetchDatasetPage(datasetId, 0, 100),
        listCalculatedColumns(datasetId),
      ]);
      if (gen !== genRef.current) return; // superseded by a newer load
      setData({
        columns: response.columns ?? [],
        rows: response.rows ?? [],
        totalRows: response.total_rows ?? 0,
        calculatedColumns,
      });
    } catch (err) {
      if (gen !== genRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load dataset preview");
      setData(null);
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [datasetId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { loading, error, data, refetch: load };
}
