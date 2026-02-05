import { useEffect, useState } from "react";
import { listDatasets } from "../api";
import { DatasetMeta } from "../types";

export function useDatasets() {
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);

  const refresh = async () => {
    const data = await listDatasets();
    setDatasets(data);
  };

  useEffect(() => {
    refresh();
  }, []);

  return { datasets, refresh };
}
