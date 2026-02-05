import { Card, Table, Typography, Space, Input, Select, Button } from "antd";
import { useEffect, useState } from "react";
import { fetchDatasetPage } from "../api";
import { DatasetPage } from "../types";

interface Props {
  datasetId: string | null;
  onColumns: (columns: string[]) => void;
}

export function DatasetPreviewPanel({ datasetId, onColumns }: Props) {
  const [page, setPage] = useState<DatasetPage | null>(null);
  const [loading, setLoading] = useState(false);
  const pageSize = 20;
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterCol, setFilterCol] = useState<string | undefined>(undefined);
  const [filterOp, setFilterOp] = useState<string | undefined>(undefined);
  const [filterVal, setFilterVal] = useState<string>("");

  const loadPage = async (offset: number) => {
    if (!datasetId) return;
    setLoading(true);
    const data = await fetchDatasetPage(datasetId, offset, pageSize, {
      sort_by: sortBy,
      sort_dir: sortDir,
      filter_col: filterCol,
      filter_op: filterOp,
      filter_val: filterVal
    });
    setPage(data);
    onColumns(data.columns);
    setLoading(false);
  };

  useEffect(() => {
    if (datasetId) {
      loadPage(0);
    }
  }, [datasetId]);

  if (!datasetId) {
    return (
      <Card>
        <Typography.Paragraph>Select a dataset to preview.</Typography.Paragraph>
      </Card>
    );
  }

  const columns = page?.columns.map((col) => ({
    title: col,
    dataIndex: col,
    key: col
  }));

  return (
    <Card>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          placeholder="Sort column"
          value={sortBy}
          onChange={(val) => setSortBy(val)}
          style={{ minWidth: 140 }}
          options={page?.columns.map((col) => ({ label: col, value: col }))}
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
          options={page?.columns.map((col) => ({ label: col, value: col }))}
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
        <Button onClick={() => loadPage(0)}>Apply</Button>
      </Space>
      <Table
        loading={loading}
        dataSource={page?.rows.map((row, index) => ({ key: index, ...row }))}
        columns={columns}
        pagination={
          page
            ? {
                pageSize,
                current: Math.floor(page.offset / pageSize) + 1,
                total: page.total_rows,
                onChange: (p) => loadPage((p - 1) * pageSize)
              }
            : false
        }
        scroll={{ x: true }}
      />
    </Card>
  );
}
