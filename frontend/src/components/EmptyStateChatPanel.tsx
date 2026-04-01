import { SuggestionChips, type ColSchema } from "./SuggestionChips";

interface EmptyStateChatPanelProps {
  hasDataset: boolean;
  datasetName?: string;
  columnSchema?: ColSchema[];
  onSuggestionSelect: (suggestion: string) => void;
  onUploadClick: () => void;
}

export const EmptyStateChatPanel = ({
  hasDataset,
  datasetName,
  columnSchema,
  onSuggestionSelect,
  onUploadClick,
}: EmptyStateChatPanelProps) => {
  if (!hasDataset) {
    return (
      <div className="empty-chat-panel">
        <div className="empty-chat-panel__icon">📊</div>
        <h3 className="empty-chat-panel__title">No dataset selected</h3>
        <p className="empty-chat-panel__body">
          Upload a CSV or Excel file to start analysing your data with AI.
        </p>
        <button className="empty-chat-panel__cta" onClick={onUploadClick}>
          Upload a file
        </button>
      </div>
    );
  }

  const NUMERIC_TYPES = new Set(["integer", "int", "bigint", "float", "double", "numeric", "decimal", "real", "number"]);
  const DATE_TYPES = new Set(["date", "timestamp", "datetime", "time"]);
  const numericCols = columnSchema?.filter((c) => NUMERIC_TYPES.has(c.type.toLowerCase().split("(")[0])) ?? [];
  const dateCols = columnSchema?.filter((c) => DATE_TYPES.has(c.type.toLowerCase().split("(")[0])) ?? [];
  const categoryCols = columnSchema?.filter((c) => !NUMERIC_TYPES.has(c.type.toLowerCase().split("(")[0]) && !DATE_TYPES.has(c.type.toLowerCase().split("(")[0])) ?? [];
  const hasSchema = columnSchema && columnSchema.length > 0;

  return (
    <div className="empty-chat-panel">
      <div className="empty-chat-panel__icon">✨</div>
      <h3 className="empty-chat-panel__title">Ask anything about your data</h3>
      {hasSchema ? (
        <div style={{ fontSize: 11, color: "#71717a", marginBottom: 6, lineHeight: 1.6 }}>
          {numericCols.length > 0 && <div>📊 {numericCols.length} numeric: {numericCols.slice(0, 3).map((c) => c.name).join(", ")}{numericCols.length > 3 ? "…" : ""}</div>}
          {dateCols.length > 0 && <div>📅 {dateCols.length} date: {dateCols.slice(0, 2).map((c) => c.name).join(", ")}</div>}
          {categoryCols.length > 0 && <div>🏷️ {categoryCols.length} category: {categoryCols.slice(0, 3).map((c) => c.name).join(", ")}{categoryCols.length > 3 ? "…" : ""}</div>}
        </div>
      ) : (
        <p className="empty-chat-panel__body">Try one of these questions or type your own below.</p>
      )}
      <SuggestionChips onSelect={onSuggestionSelect} datasetName={datasetName} columnSchema={columnSchema} />
    </div>
  );
};
