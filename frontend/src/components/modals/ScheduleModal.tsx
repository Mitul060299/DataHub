import { useState } from "react";

interface ScheduleModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: { label: string; cron: string; autoRefreshOnUpload: boolean }) => void;
}

export function ScheduleModal({ open, onClose, onConfirm }: ScheduleModalProps) {
  const [mode, setMode] = useState<"hourly" | "daily" | "weekly" | "custom">("daily");
  const [time, setTime] = useState("09:00");
  const [day, setDay] = useState("1");
  const [cron, setCron] = useState("0 9 * * *");
  const [autoRefreshOnUpload, setAutoRefreshOnUpload] = useState(false);

  if (!open) return null;

  const buildCron = () => {
    if (mode === "hourly") return { label: "Hourly", cron: "0 * * * *" };
    if (mode === "daily") {
      const [hour, minute] = time.split(":");
      return { label: `Daily ${time}`, cron: `${Number(minute)} ${Number(hour)} * * *` };
    }
    if (mode === "weekly") {
      const [hour, minute] = time.split(":");
      return { label: `Weekly day ${day} ${time}`, cron: `${Number(minute)} ${Number(hour)} * * ${day}` };
    }
    return { label: "Custom", cron };
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        <h3 style={{ marginBottom: 10 }}>Schedule Pipeline</h3>
        <div style={{ display: "grid", gap: 8 }}>
          <label><input type="radio" checked={mode === "hourly"} onChange={() => setMode("hourly")} /> Hourly</label>
          <label><input type="radio" checked={mode === "daily"} onChange={() => setMode("daily")} /> Daily</label>
          <label><input type="radio" checked={mode === "weekly"} onChange={() => setMode("weekly")} /> Weekly</label>
          <label><input type="radio" checked={mode === "custom"} onChange={() => setMode("custom")} /> Custom cron</label>

          {(mode === "daily" || mode === "weekly") ? (
            <input className="auth-input" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          ) : null}
          {mode === "weekly" ? (
            <select className="auth-select" value={day} onChange={(event) => setDay(event.target.value)}>
              <option value="0">Sunday</option>
              <option value="1">Monday</option>
              <option value="2">Tuesday</option>
              <option value="3">Wednesday</option>
              <option value="4">Thursday</option>
              <option value="5">Friday</option>
              <option value="6">Saturday</option>
            </select>
          ) : null}
          {mode === "custom" ? (
            <input className="auth-input mono" placeholder="0 9 * * *" value={cron} onChange={(event) => setCron(event.target.value)} />
          ) : null}

          {/* Re-run on upload trigger */}
          <div style={{ borderTop: "1px solid var(--bd)", paddingTop: 8, display: "grid", gap: 4 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={autoRefreshOnUpload}
                onChange={(e) => setAutoRefreshOnUpload(e.target.checked)}
              />
              <span style={{ fontSize: 13 }}>Auto re-run when a new file is uploaded</span>
            </label>
            {autoRefreshOnUpload ? (
              <p style={{ margin: 0, fontSize: 11, color: "var(--tx2)", paddingLeft: 22 }}>
                The pipeline will also run automatically whenever a new dataset is uploaded to the project, keeping downstream dashboards fresh without manual intervention.
              </p>
            ) : null}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              const built = buildCron();
              onConfirm({ ...built, autoRefreshOnUpload });
              onClose();
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#00000080",
  display: "grid",
  placeItems: "center",
  zIndex: 40,
};

const modal: React.CSSProperties = {
  width: "min(480px, 92vw)",
  background: "var(--bg1)",
  border: "1px solid var(--bd2)",
  borderRadius: "var(--r12)",
  padding: 14,
};

