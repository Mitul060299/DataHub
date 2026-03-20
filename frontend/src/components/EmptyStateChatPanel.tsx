import { SuggestionChips } from "./SuggestionChips";

interface EmptyStateChatPanelProps {
  hasDataset: boolean;
  datasetName?: string;
  onSuggestionSelect: (suggestion: string) => void;
  onUploadClick: () => void;
}

export const EmptyStateChatPanel = ({
  hasDataset,
  datasetName,
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

  return (
    <div className="empty-chat-panel">
      <div className="empty-chat-panel__icon">✨</div>
      <h3 className="empty-chat-panel__title">Ask anything about your data</h3>
      <p className="empty-chat-panel__body">
        Try one of these questions or type your own below.
      </p>
      <SuggestionChips onSelect={onSuggestionSelect} datasetName={datasetName} />
    </div>
  );
};
