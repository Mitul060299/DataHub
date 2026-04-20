import { IconLayers, IconTable } from "./Icons";

interface ActivityBarProps {
  explorerOpen: boolean;
  pipelineOpen: boolean;
  onToggleExplorer: () => void;
  onTogglePipeline: () => void;
}

export function ActivityBar({ explorerOpen, pipelineOpen, onToggleExplorer, onTogglePipeline }: ActivityBarProps) {
  return (
    <aside style={{ width: "var(--lw)", borderRight: "1px solid var(--bd)", background: "var(--bg1)", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "10px 0" }}>
      <div style={{ display: "grid", gap: 4, justifyItems: "center" }}>
        <button data-tour="activity-explorer" title="Explorer" onClick={onToggleExplorer} style={iconButton(explorerOpen)}>
          <IconTable size={16} color={explorerOpen ? "var(--ac)" : undefined} />
        </button>
        <button data-tour="activity-pipeline" title="Pipeline" onClick={onTogglePipeline} style={iconButton(pipelineOpen)}>
          <IconLayers size={16} color={pipelineOpen ? "var(--ac)" : undefined} />
        </button>
      </div>
    </aside>
  );
}

const iconButton = (active: boolean): React.CSSProperties => ({
  width: 36,
  height: 36,
  borderRadius: 8,
  border: `1px solid ${active ? "rgba(91,106,240,0.25)" : "transparent"}`,
  background: active ? "rgba(91,106,240,0.1)" : "transparent",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  transition: "all 0.15s ease",
});
