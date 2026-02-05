import { Button, Card, Input, Space, Typography } from "antd";
import { useState } from "react";
import { importInlineCsv } from "../api";

interface Props {
  onImported: (datasetId: string) => void;
}

export function InlineImportPanel({ onImported }: Props) {
  const [csvText, setCsvText] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const handleImport = async () => {
    if (!csvText.trim()) return;
    const result = await importInlineCsv(csvText);
    setStatus(`Imported dataset ${result.dataset_id} (${result.row_count} rows)`);
    onImported(result.dataset_id);
    setCsvText("");
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Typography.Text>Paste CSV text to import</Typography.Text>
        <Input.TextArea
          rows={6}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
        />
        <Button type="primary" onClick={handleImport}>
          Import
        </Button>
        {status && <Typography.Text type="secondary">{status}</Typography.Text>}
      </Space>
    </Card>
  );
}
