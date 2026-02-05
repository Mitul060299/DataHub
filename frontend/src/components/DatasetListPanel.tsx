import { Button, Card, List, Space, Typography, Select, Input, Tag } from "antd";
import { useEffect, useState } from "react";
import { DatasetMeta } from "../types";
import { deleteDataset, exportDatasetCsv, listDatasets, fetchDatasetLineage } from "../api";

interface Props {
  onSelect: (datasetId: string) => void;
}

export function DatasetListPanel({ onSelect }: Props) {
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterCol, setFilterCol] = useState<string | undefined>(undefined);
  const [filterOp, setFilterOp] = useState<string | undefined>(undefined);
  const [filterVal, setFilterVal] = useState<string>("");
  const [lineage, setLineage] = useState<DatasetMeta[] | null>(null);
  const [lineageDatasetId, setLineageDatasetId] = useState<string | null>(null);

  const refresh = async () => {
    const data = await listDatasets();
    setDatasets(data);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleExport = async (datasetId: string) => {
    const blob = await exportDatasetCsv(datasetId, {
      sort_by: sortBy,
      sort_dir: sortDir,
      filter_col: filterCol,
      filter_op: filterOp,
      filter_val: filterVal
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${datasetId}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDelete = async (datasetId: string) => {
    await deleteDataset(datasetId);
    await refresh();
  };

  const handleLineage = async (datasetId: string) => {
    const data = await fetchDatasetLineage(datasetId);
    setLineage(data);
    setLineageDatasetId(datasetId);
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space wrap>
          <Select
            placeholder="Sort column"
            value={sortBy}
            onChange={(val) => setSortBy(val)}
            style={{ minWidth: 140 }}
            options={datasets[0]?.columns.map((col) => ({ label: col, value: col }))}
          />
          <Select
            placeholder="Sort dir"
            value={sortDir}
            onChange={(val) => setSortDir(val)}
            style={{ minWidth: 120 }}
            options={[
              { label: "Ascending", value: "asc" },
              { label: "Descending", value: "desc" }
            ]}
          />
          <Select
            placeholder="Filter column"
            value={filterCol}
            onChange={(val) => setFilterCol(val)}
            style={{ minWidth: 160 }}
            options={datasets[0]?.columns.map((col) => ({ label: col, value: col }))}
          />
          <Select
            placeholder="Filter op"
            value={filterOp}
            onChange={(val) => setFilterOp(val)}
            style={{ minWidth: 140 }}
            options={[
              { label: "Contains", value: "contains" },
              { label: "Equals", value: "eq" },
              { label: ">", value: "gt" },
              { label: "<", value: "lt" }
            ]}
          />
          <Input
            placeholder="Filter value"
            value={filterVal}
            onChange={(e) => setFilterVal(e.target.value)}
            style={{ minWidth: 160 }}
          />
        </Space>
        <Button onClick={refresh}>Refresh</Button>
        {lineage && lineageDatasetId && (
          <Card size="small" title={`Lineage for ${lineageDatasetId}`}>
            <Space wrap>
              {lineage.map((item, index) => (
                <Space key={item.dataset_id} size={4} align="center">
                  <Tag color={index === 0 ? "blue" : "default"}>{item.dataset_id}</Tag>
                  {index < lineage.length - 1 && <Typography.Text>←</Typography.Text>}
                </Space>
              ))}
            </Space>
          </Card>
        )}
        <List
          dataSource={datasets}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button key="select" type="link" onClick={() => onSelect(item.dataset_id)}>
                  Preview
                </Button>,
                <Button key="lineage" onClick={() => handleLineage(item.dataset_id)}>
                  Lineage
                </Button>,
                <Button key="export" onClick={() => handleExport(item.dataset_id)}>
                  Export
                </Button>,
                <Button key="delete" danger onClick={() => handleDelete(item.dataset_id)}>
                  Delete
                </Button>
              ]}
            >
              <Typography.Text>
                {item.dataset_id} ({item.row_count} rows)
              </Typography.Text>
            </List.Item>
          )}
        />
      </Space>
    </Card>
  );
}
