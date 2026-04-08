import { IconLayers, IconTable } from "./Icons";

interface ActivityBarProps {
  explorerOpen: boolean;
  pipelineOpen: boolean;
  onToggleExplorer: () => void;
  onTogglePipeline: () => void;
}

export function ActivityBar({ explorerOpen, pipelineOpen, onToggleExplorer, onTogglePipeline }: ActivityBarProps) {
  return (
    <aside style={{ width: "var(--lw)", borderRight: "1px solid var(--bd)", background: "var(--bg1)", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "8px 0" }}>
      <div style={{ display: "grid", gap: 6, justifyItems: "center" }}>
        <button title="Explorer" onClick={onToggleExplorer} style={iconButton(explorerOpen)}>
          <IconTable size={15} color={explorerOpen ? "var(--ac)" : undefined} />
        </button>
        <button title="Pipeline" onClick={onTogglePipeline} style={iconButton(pipelineOpen)}>
          <IconLayers size={15} color={pipelineOpen ? "var(--ac)" : undefined} />
        </button>
      </div>
    </aside>
  );
}

const iconButton = (active: boolean): React.CSSProperties => ({
  width: 34,
  height: 34,
  borderRadius: "var(--r6)",
  border: `1px solid ${active ? "var(--acg)" : "var(--bd)"}`,
  background: active ? "var(--acl)" : "transparent",
  display: "grid",
  placeItems: "center",
});
