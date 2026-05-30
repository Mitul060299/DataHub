import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useRealtimePipelineRun } from "../hooks/useRealtimePipelineRun";

// ── Write-back destination types (mirrors SendToDestinationModal's DESTINATIONS) ──
const WB_CONNECTOR_OPTIONS = [
  { id: "postgresql", label: "PostgreSQL" },
  { id: "mysql", label: "MySQL" },
  { id: "mssql", label: "SQL Server" },
  { id: "snowflake", label: "Snowflake" },
  { id: "bigquery", label: "BigQuery" },
  { id: "redshift", label: "Redshift" },
  { id: "s3", label: "Amazon S3" },
  { id: "gcs", label: "Google Cloud Storage" },
  { id: "azure_blob", label: "Azure Blob Storage" },
];

interface WriteBackConfig {
  connector_type: string;
  credential_id?: string | null;
  table_name: string;
  mode: "append" | "replace";
}

interface ScheduleConfig {
  id?: string;
  cron_expression: string;
  timezone: string;
  is_active: boolean;
  auto_refresh_on_upload: boolean;
  write_back_config?: WriteBackConfig | null;
  next_run_at?: string | null;
  last_run_at?: string | null;
}

interface SavedCredential {
  id: string;
  connector_type: string;
  label: string;
}

interface RunRecord {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  triggered_by: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  output_snapshot_url: string | null;
}

interface Props {
  pipelineId: string;
}

const PRESETS = [
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Daily 9 AM", cron: "0 9 * * *" },
  { label: "Weekly Mon", cron: "0 9 * * 1" },
  { label: "Monthly 1st", cron: "0 9 1 * *" },
];

const TIMEZONES = [
  "Asia/Kolkata",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
];

/** Very simple human-readable cron description */
function describeCron(expr: string): string {
  try {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return "Custom schedule";
    const [min, hour, dom, , dow] = parts;
    if (min === "0" && hour !== "*" && dom === "*" && dow === "*")
      return `Daily at ${String(hour).padStart(2, "0")}:00`;
    if (min === "0" && hour !== "*" && dom === "*" && dow !== "*")
      return `Weekly on day ${dow} at ${String(hour).padStart(2, "0")}:00`;
    if (min === "0" && hour !== "*" && dom !== "*")
      return `Monthly on day ${dom} at ${String(hour).padStart(2, "0")}:00`;
    if (min === "0" && hour === "*") return "Every hour";
    if (min !== "*" && hour === "*") return `Every hour at :${min}`;
    return "Custom schedule";
  } catch {
    return "Custom schedule";
  }
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function statusColor(status: string) {
  if (status === "completed") return "#4ade80";
  if (status === "failed") return "#f87171";
  if (status === "running") return "#60a5fa";
  return "#a0a0b0";
}

const cardStyle: React.CSSProperties = {
  background: "var(--bg2, #1a1a2e)",
  border: "1px solid var(--bd2, #2a2a3e)",
  borderRadius: 8,
  padding: "20px",
  marginBottom: 16,
};

export function PipelineScheduleTab({ pipelineId }: Props) {
  const [schedule, setSchedule] = useState<ScheduleConfig>({
    cron_expression: "0 9 * * *",
    timezone: "Asia/Kolkata",
    is_active: true,
    auto_refresh_on_upload: false,
    write_back_config: null,
  });
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Write-back state
  const [wbEnabled, setWbEnabled] = useState(false);
  const [wbConnectorType, setWbConnectorType] = useState("postgresql");
  const [wbCredentialId, setWbCredentialId] = useState<string>("");
  const [wbTableName, setWbTableName] = useState("");
  const [wbMode, setWbMode] = useState<"append" | "replace">("append");
  const [savedCreds, setSavedCreds] = useState<SavedCredential[]>([]);

  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

  const { runStatus, isRunning, triggerRun } = useRealtimePipelineRun(pipelineId);

  // Load schedule
  useEffect(() => {
    api.get<ScheduleConfig | null>(`/pipelines/${pipelineId}/schedule`)
      .then((res) => {
        if (res.data) {
          setSchedule(res.data);
          const wb = res.data.write_back_config;
          if (wb) {
            setWbEnabled(true);
            setWbConnectorType(wb.connector_type || "postgresql");
            setWbCredentialId(wb.credential_id || "");
            setWbTableName(wb.table_name || "");
            setWbMode(wb.mode || "append");
          }
        }
        setScheduleLoaded(true);
      })
      .catch(() => setScheduleLoaded(true));
  }, [pipelineId]);

  // Load saved credentials when write-back connector changes
  useEffect(() => {
    if (!wbEnabled) return;
    api.get<SavedCredential[]>("/connectors/credentials")
      .then((res) => setSavedCreds(res.data || []))
      .catch(() => setSavedCreds([]));
  }, [wbEnabled, wbConnectorType]);

  // Load run history
  const loadRuns = useCallback(() => {
    setRunsLoading(true);
    api.get<RunRecord[]>(`/pipelines/${pipelineId}/runs?limit=20`)
      .then((res) => setRuns(res.data))
      .catch(() => {})
      .finally(() => setRunsLoading(false));
  }, [pipelineId]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  // Reload run history when a run completes or fails via Realtime
  useEffect(() => {
    if (runStatus?.status === "completed" || runStatus?.status === "failed") {
      loadRuns();
    }
  }, [runStatus?.status, loadRuns]);

  const saveSchedule = async () => {
    setSavingSchedule(true);
    setSaveMsg(null);
    try {
      const payload: ScheduleConfig = {
        ...schedule,
        write_back_config: wbEnabled && wbConnectorType && wbTableName.trim()
          ? {
              connector_type: wbConnectorType,
              credential_id: wbCredentialId || null,
              table_name: wbTableName.trim(),
              mode: wbMode,
            }
          : null,
      };
      await api.post(`/pipelines/${pipelineId}/schedule`, payload);
      setSaveMsg("Schedule saved.");
    } catch {
      setSaveMsg("Failed to save schedule.");
    } finally {
      setSavingSchedule(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };



  const description = describeCron(schedule.cron_expression);

  return (
    <div style={{ padding: "20px 0" }}>
      {/* Run Now */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Manual Run</h3>
            <p style={{ fontSize: 12, color: "var(--tx1)" }}>Trigger the pipeline immediately with the latest data.</p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => triggerRun()}
            disabled={isRunning}
            style={{ minWidth: 96 }}
          >
            {isRunning ? "Running…" : "Run Now"}
          </button>
        </div>
        {runStatus && (
          <div style={{
            marginTop: 12,
            padding: "8px 12px",
            borderRadius: 6,
            background: "var(--bg3, #252540)",
            fontSize: 12,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: statusColor(runStatus.status),
              display: "inline-block",
              flexShrink: 0,
            }} />
            <span style={{ color: statusColor(runStatus.status), fontWeight: 600, textTransform: "capitalize" }}>
              {runStatus.status}
            </span>
            {runStatus.error_message && (
              <span style={{ color: "#f87171" }}> — {runStatus.error_message}</span>
            )}
            {runStatus.status === "running" && (
              <span style={{ color: "var(--tx1)", marginLeft: "auto" }}>Live • Realtime</span>
            )}
          </div>
        )}
      </div>

      {/* Schedule Config */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Automatic Schedule</h3>

        {/* Presets */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--tx1)", marginBottom: 6 }}>Presets</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PRESETS.map((p) => (
              <button
                key={p.cron}
                className="btn"
                style={{
                  fontSize: 12,
                  background: schedule.cron_expression === p.cron ? "var(--accent, #6366f1)" : undefined,
                  color: schedule.cron_expression === p.cron ? "#fff" : undefined,
                }}
                onClick={() => setSchedule((s) => ({ ...s, cron_expression: p.cron }))}
              >
                {p.label}
              </button>
            ))}
            <button
              className="btn"
              style={{ fontSize: 12 }}
              onClick={() => setSchedule((s) => ({ ...s, cron_expression: "" }))}
            >
              Custom
            </button>
          </div>
        </div>

        {/* Cron input */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--tx1)", marginBottom: 4 }}>
              Cron Expression
            </label>
            <input
              className="input"
              value={schedule.cron_expression}
              onChange={(e) => setSchedule((s) => ({ ...s, cron_expression: e.target.value }))}
              placeholder="0 9 * * *"
              style={{ width: "100%", fontFamily: "monospace" }}
            />
            {schedule.cron_expression && (
              <p style={{ fontSize: 11, color: "#60a5fa", marginTop: 4 }}>{description}</p>
            )}
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--tx1)", marginBottom: 4 }}>Timezone</label>
            <select
              className="input"
              value={schedule.timezone}
              onChange={(e) => setSchedule((s) => ({ ...s, timezone: e.target.value }))}
              style={{ width: "100%" }}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Toggles */}
        <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={schedule.is_active}
              onChange={(e) => setSchedule((s) => ({ ...s, is_active: e.target.checked }))}
            />
            Enable schedule
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={schedule.auto_refresh_on_upload}
              onChange={(e) => setSchedule((s) => ({ ...s, auto_refresh_on_upload: e.target.checked }))}
            />
            Auto-refresh on file upload
          </label>
        </div>

        {scheduleLoaded && schedule.next_run_at && (
          <p style={{ fontSize: 12, color: "var(--tx1)", marginBottom: 12 }}>
            Next run: <strong>{formatDate(schedule.next_run_at)}</strong>
            {schedule.last_run_at && (
              <> &nbsp;·&nbsp; Last run: <strong>{formatDate(schedule.last_run_at)}</strong></>
            )}
          </p>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-primary" onClick={saveSchedule} disabled={savingSchedule || !schedule.cron_expression.trim()}>
            {savingSchedule ? "Saving…" : "Save Schedule"}
          </button>
          {saveMsg && <span style={{ fontSize: 12, color: saveMsg.startsWith("Failed") ? "#f87171" : "#4ade80" }}>{saveMsg}</span>}
        </div>
      </div>

      {/* Write-back destination */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>Auto Write-back</h3>
            <p style={{ fontSize: 12, color: "var(--tx1)" }}>After each run, push the output table directly to a database or cloud storage.</p>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>
            <input type="checkbox" checked={wbEnabled} onChange={(e) => setWbEnabled(e.target.checked)} />
            Enable
          </label>
        </div>

        {wbEnabled && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Connector type */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--tx1)", marginBottom: 4 }}>Destination</label>
                <select
                  className="input"
                  value={wbConnectorType}
                  onChange={(e) => { setWbConnectorType(e.target.value); setWbCredentialId(""); }}
                  style={{ width: "100%" }}
                >
                  {WB_CONNECTOR_OPTIONS.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--tx1)", marginBottom: 4 }}>
                  {["s3", "gcs", "azure_blob"].includes(wbConnectorType) ? "File path" : "Table name"}
                  <span style={{ color: "#e06060", marginLeft: 2 }}>*</span>
                </label>
                <input
                  className="input"
                  value={wbTableName}
                  onChange={(e) => setWbTableName(e.target.value)}
                  placeholder={["s3", "gcs", "azure_blob"].includes(wbConnectorType) ? "output/data.parquet" : "cleaned_output"}
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            {/* Saved credential picker */}
            {savedCreds.filter((c) => c.connector_type === wbConnectorType).length > 0 && (
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--tx1)", marginBottom: 4 }}>Saved credential</label>
                <select
                  className="input"
                  value={wbCredentialId}
                  onChange={(e) => setWbCredentialId(e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="">— none (will use inline config) —</option>
                  {savedCreds
                    .filter((c) => c.connector_type === wbConnectorType)
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                </select>
              </div>
            )}

            {/* Write mode (SQL only) */}
            {!["s3", "gcs", "azure_blob"].includes(wbConnectorType) && (
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--tx1)", marginBottom: 4 }}>Write mode</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["append", "replace"] as const).map((m) => (
                    <button
                      key={m}
                      className="btn"
                      onClick={() => setWbMode(m)}
                      style={{
                        flex: 1,
                        background: wbMode === m ? "rgba(91,106,240,0.12)" : undefined,
                        border: wbMode === m ? "1px solid rgba(91,106,240,0.4)" : undefined,
                        color: wbMode === m ? "var(--ac)" : undefined,
                        fontSize: 12,
                        textTransform: "capitalize",
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!wbCredentialId && (
              <p style={{ fontSize: 11, color: "var(--tx2)", margin: 0 }}>
                No saved credential selected — make sure to save a credential via the &quot;Send to Destination&quot; export first, then select it here.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Run History */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>Run History</h3>
          <button className="btn" style={{ fontSize: 12 }} onClick={loadRuns} disabled={runsLoading}>
            {runsLoading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {runs.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--tx1)", textAlign: "center", padding: "20px 0" }}>
            No runs yet.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--bd2)", color: "var(--tx1)" }}>
                <th style={{ padding: "6px 8px", textAlign: "left" }}>Status</th>
                <th style={{ padding: "6px 8px", textAlign: "left" }}>Triggered by</th>
                <th style={{ padding: "6px 8px", textAlign: "left" }}>Started</th>
                <th style={{ padding: "6px 8px", textAlign: "left" }}>Finished</th>
                <th style={{ padding: "6px 8px", textAlign: "left" }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} style={{ borderBottom: "1px solid var(--bd2, #2a2a3e)" }}>
                  <td style={{ padding: "6px 8px" }}>
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      color: statusColor(run.status),
                      fontWeight: 600,
                      textTransform: "capitalize",
                    }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor(run.status), display: "inline-block" }} />
                      {run.status}
                    </span>
                  </td>
                  <td style={{ padding: "6px 8px", color: "var(--tx1)" }}>{run.triggered_by}</td>
                  <td style={{ padding: "6px 8px", color: "var(--tx1)" }}>{formatDate(run.started_at)}</td>
                  <td style={{ padding: "6px 8px", color: "var(--tx1)" }}>{formatDate(run.finished_at)}</td>
                  <td style={{ padding: "6px 8px", color: run.error_message ? "#f87171" : "var(--tx1)" }}>
                    {run.error_message
                      ? run.error_message.slice(0, 80)
                      : run.output_snapshot_url
                      ? "Snapshot saved"
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
