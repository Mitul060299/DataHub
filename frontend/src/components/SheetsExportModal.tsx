/**
 * SheetsExportModal — sync a dataset to a Google Sheet.
 *
 * Usage: the parent renders this when the user picks "Sync to Google Sheets"
 * from the CanvasPanel export dropdown.  The modal shows:
 *  - Spreadsheet URL input (remembered in localStorage per dataset)
 *  - Sheet name input
 *  - Replace / Append mode toggle
 *  - Service-account email hint (user must share the Sheet with this address)
 *  - Success state with a "Connect Looker Studio" hint
 */
import { useState, useEffect } from "react";
import { exportDatasetToSheets, getSheetsExportConfig } from "../api";

interface Props {
  datasetId: string;
  datasetName?: string;
  /** SA email shown in the "share with" hint. Pulled from env/config if available. */
  serviceAccountEmail?: string;
  onClose: () => void;
}

const LS_KEY = (id: string) => `sheets_export_url_${id}`;

export function SheetsExportModal({ datasetId, datasetName, serviceAccountEmail, onClose }: Props) {
  const [url, setUrl] = useState(() => localStorage.getItem(LS_KEY(datasetId)) ?? "");
  const [sheetName, setSheetName] = useState("Sheet1");
  const [mode, setMode] = useState<"replace" | "append">("replace");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ rows_written: number; spreadsheet_url: string; sheet_name: string } | null>(null);
  const [saEmail, setSaEmail] = useState<string>(serviceAccountEmail ?? "");

  // Fetch SA email from backend config on first open (prop takes priority)
  useEffect(() => {
    if (!serviceAccountEmail) {
      getSheetsExportConfig()
        .then((cfg) => { if (cfg.service_account_email) setSaEmail(cfg.service_account_email); })
        .catch(() => { /* non-fatal */ });
    }
  }, [serviceAccountEmail]);

  // Persist URL per dataset
  useEffect(() => {
    if (url) localStorage.setItem(LS_KEY(datasetId), url);
  }, [url, datasetId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setError("Please enter a Google Sheets URL");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await exportDatasetToSheets(datasetId, {
        spreadsheet_url: url.trim(),
        sheet_name: sheetName.trim() || "Sheet1",
        mode,
      });
      setResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sync failed. Check the spreadsheet URL and try again.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#16181f",
        border: "1px solid #2a2d3a",
        borderRadius: 12,
        padding: "28px 32px",
        width: "100%",
        maxWidth: 480,
        boxShadow: "0 16px 64px rgba(0,0,0,0.6)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#e8e8f0" }}>
              Sync to Google Sheets
            </h2>
            {datasetName && (
              <p style={{ margin: "3px 0 0", fontSize: 12, color: "#6668a0" }}>{datasetName}</p>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#6668a0", fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {result ? (
          /* ── Success state ── */
          <div>
            <div style={{
              background: "#0d2818",
              border: "1px solid #1a5c34",
              borderRadius: 8,
              padding: "14px 16px",
              marginBottom: 16,
            }}>
              <p style={{ margin: 0, fontSize: 14, color: "#34d399", fontWeight: 600 }}>
                ✓ {result.rows_written.toLocaleString()} rows synced to &ldquo;{result.sheet_name}&rdquo;
              </p>
            </div>

            <div style={{
              background: "#111320",
              border: "1px solid #2a2d3a",
              borderRadius: 8,
              padding: "12px 14px",
              marginBottom: 20,
            }}>
              <p style={{ margin: "0 0 4px", fontSize: 12, color: "#9898b0", fontWeight: 600 }}>
                💡 Tip — connect Looker Studio
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "#6668a0", lineHeight: 1.5 }}>
                Open{" "}
                <a
                  href="https://lookerstudio.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#5b6af0" }}
                >
                  Looker Studio
                </a>
                , create a new report, and connect it to your Google Sheet to build live dashboards from your data.
              </p>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <a
                href={result.spreadsheet_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: 1,
                  display: "block",
                  textAlign: "center",
                  padding: "9px 0",
                  borderRadius: 8,
                  background: "#34A853",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 13,
                  textDecoration: "none",
                }}
              >
                Open Sheet
              </a>
              <button
                onClick={onClose}
                style={{ flex: 1, padding: "9px 0", borderRadius: 8, background: "#23263a", border: "none", color: "#9898b0", cursor: "pointer", fontSize: 13 }}
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          /* ── Form state ── */
          <form onSubmit={(e) => void handleSubmit(e)}>
            {saEmail && (
              <div style={{
                background: "#111320",
                border: "1px solid #2a2d3a",
                borderRadius: 8,
                padding: "10px 14px",
                marginBottom: 18,
              }}>
                <p style={{ margin: 0, fontSize: 12, color: "#9898b0" }}>
                  Share your Google Sheet with{" "}
                  <strong style={{ color: "#e8e8f0", wordBreak: "break-all" }}>{saEmail}</strong>
                  {" "}(Editor access required).
                </p>
              </div>
            )}

            <label style={{ display: "block", marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: "#9898b0", fontWeight: 600, display: "block", marginBottom: 5 }}>Spreadsheet URL</span>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                required
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  background: "#0e1018",
                  border: "1px solid #2a2d3a",
                  borderRadius: 6,
                  color: "#e8e8f0",
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </label>

            <label style={{ display: "block", marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: "#9898b0", fontWeight: 600, display: "block", marginBottom: 5 }}>Sheet / Tab name</span>
              <input
                type="text"
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                placeholder="Sheet1"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  background: "#0e1018",
                  border: "1px solid #2a2d3a",
                  borderRadius: 6,
                  color: "#e8e8f0",
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </label>

            <div style={{ marginBottom: 20 }}>
              <span style={{ fontSize: 12, color: "#9898b0", fontWeight: 600, display: "block", marginBottom: 8 }}>Write mode</span>
              <div style={{ display: "flex", gap: 8 }}>
                {(["replace", "append"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    style={{
                      flex: 1,
                      padding: "8px 0",
                      border: `1px solid ${mode === m ? "#5b6af0" : "#2a2d3a"}`,
                      borderRadius: 6,
                      background: mode === m ? "#1c1f35" : "#0e1018",
                      color: mode === m ? "#e8e8f0" : "#6668a0",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: mode === m ? 600 : 400,
                    }}
                  >
                    {m === "replace" ? "Replace" : "Append"}
                  </button>
                ))}
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 11, color: "#44445a" }}>
                {mode === "replace" ? "Clears the sheet and writes fresh data." : "Adds rows below existing content."}
              </p>
            </div>

            {error && (
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "#f87171" }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: "100%",
                padding: "10px 0",
                borderRadius: 8,
                background: isLoading ? "#23263a" : "#34A853",
                border: "none",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                cursor: isLoading ? "not-allowed" : "pointer",
              }}
            >
              {isLoading ? "Syncing…" : "Sync to Google Sheets"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
