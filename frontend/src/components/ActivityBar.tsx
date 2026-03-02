import { IconSearch, IconSettings, IconTable } from "./Icons";

interface ActivityBarProps {
  explorerOpen: boolean;
  onToggleExplorer: () => void;
  onSearch: () => void;
}

export function ActivityBar({ explorerOpen, onToggleExplorer, onSearch }: ActivityBarProps) {
  return (
    <aside style={{ width: "var(--lw)", borderRight: "1px solid var(--bd)", background: "var(--bg1)", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "8px 0" }}>
      <div style={{ display: "grid", gap: 6, justifyItems: "center" }}>
        <button title="Explorer" onClick={onToggleExplorer} style={iconButton(explorerOpen)}>
          <IconTable size={15} color={explorerOpen ? "var(--ac)" : undefined} />
        </button>
        <button title="Search" onClick={onSearch} style={iconButton(false)}>
          <IconSearch size={15} />
        </button>
      </div>
      <div style={{ display: "grid", justifyItems: "center" }}>
        <button title="Settings" style={iconButton(false)}>
          <IconSettings size={15} />
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
