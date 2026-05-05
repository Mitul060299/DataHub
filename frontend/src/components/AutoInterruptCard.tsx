/**
 * AutoInterruptCard.tsx
 * Renders a pending interrupt question and collects the user's answer.
 * Uses inline styles consistent with the app's CSS-variable dark theme.
 */
import { useState } from "react";
import type { InterruptQuestion } from "../hooks/useAutoRunSession";

interface Props {
  question: InterruptQuestion;
  onAnswer: (answer: string) => void;
}

export function AutoInterruptCard({ question, onAnswer }: Props) {
  const [selected, setSelected] = useState<string>("");
  const [freeform, setFreeform] = useState("");

  const handleSubmit = () => {
    const answer = selected || freeform.trim();
    if (!answer) return;
    onAnswer(answer);
  };

  const canSubmit = !!selected || !!freeform.trim();

  return (
    <div style={{
      border: "1px solid rgba(234,179,8,0.4)",
      borderRadius: 12,
      background: "rgba(234,179,8,0.06)",
      padding: "12px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      {/* Header */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>⚠</span>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "#f59e0b", lineHeight: 1.45 }}>
          {question.question}
        </p>
      </div>

      {/* Sample rows */}
      {question.sample_rows.length > 0 && (
        <div style={{
          overflowX: "auto",
          borderRadius: 7,
          border: "1px solid rgba(234,179,8,0.25)",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ background: "rgba(234,179,8,0.1)" }}>
                {Object.keys(question.sample_rows[0]).slice(0, 5).map((col) => (
                  <th key={col} style={{
                    padding: "4px 8px",
                    textAlign: "left",
                    fontWeight: 600,
                    color: "var(--tx1)",
                    whiteSpace: "nowrap",
                    borderBottom: "1px solid rgba(234,179,8,0.2)",
                  }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {question.sample_rows.slice(0, 5).map((row, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--bd)" }}>
                  {Object.keys(row).slice(0, 5).map((col) => (
                    <td key={col} style={{
                      padding: "4px 8px",
                      color: "var(--tx1)",
                      whiteSpace: "nowrap",
                    }}>
                      {String(row[col] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Option buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {question.options.map((opt) => {
          const isSelected = selected === opt.label;
          return (
            <button
              key={opt.option_id}
              onClick={() => { setSelected(opt.label); setFreeform(""); }}
              style={{
                width: "100%",
                textAlign: "left",
                fontSize: 12,
                borderRadius: 7,
                border: isSelected
                  ? "1px solid #f59e0b"
                  : "1px solid var(--bd2)",
                background: isSelected
                  ? "rgba(234,179,8,0.12)"
                  : "transparent",
                color: "var(--tx0)",
                padding: "7px 10px",
                cursor: "pointer",
                transition: "border-color 0.12s, background 0.12s",
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.currentTarget.style.borderColor = "#f59e0b";
              }}
              onMouseLeave={(e) => {
                if (!isSelected) e.currentTarget.style.borderColor = "var(--bd2)";
              }}
            >
              <span style={{ fontWeight: 600 }}>{opt.label}</span>
              {opt.implication && (
                <span style={{ color: "var(--tx2)", marginLeft: 6, fontSize: 11 }}>
                  — {opt.implication}
                </span>
              )}
            </button>
          );
        })}

        {question.allow_freeform && (
          <textarea
            rows={2}
            placeholder="Or type your own answer…"
            value={freeform}
            onChange={(e) => { setFreeform(e.target.value); setSelected(""); }}
            style={{
              resize: "none",
              border: "1px solid var(--bd2)",
              borderRadius: 7,
              background: "var(--bg3)",
              color: "var(--tx0)",
              fontSize: 12,
              padding: "7px 10px",
              width: "100%",
              boxSizing: "border-box",
              fontFamily: "inherit",
              outline: "none",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "#f59e0b"; }}
            onBlur={(e)  => { e.currentTarget.style.borderColor = "var(--bd2)"; }}
          />
        )}
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        style={{
          background: canSubmit ? "#f59e0b" : "var(--bg4)",
          color: canSubmit ? "#fff" : "var(--tx2)",
          border: "none",
          borderRadius: 7,
          padding: "7px 0",
          fontSize: 12,
          fontWeight: 600,
          cursor: canSubmit ? "pointer" : "not-allowed",
          width: "100%",
          transition: "background 0.15s",
        }}
      >
        Submit Answer
      </button>
    </div>
  );
}

