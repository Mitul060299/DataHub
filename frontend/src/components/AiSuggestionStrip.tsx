/**
 * AiSuggestionStrip
 *
 * A horizontally-scrollable row of suggestion chips shown above the AI chat
 * input on every dataset.  Clicking a chip pre-fills (and optionally
 * auto-sends) the prompt.
 *
 * Props
 * -----
 *   columns        — column descriptors from /datasets/:id/schema (optional)
 *   onSelect       — called with the full prompt string when a chip is clicked
 *   alreadyUsed    — when true the strip is hidden (user has already chatted)
 */

import type { ColSchema } from "./SuggestionChips";
import { generateSuggestions, DEFAULT_SUGGESTIONS } from "../lib/promptSuggestions";

interface AiSuggestionStripProps {
  columns?: ColSchema[];
  onSelect: (prompt: string) => void;
  alreadyUsed?: boolean;
}

export function AiSuggestionStrip({ columns, onSelect, alreadyUsed = false }: AiSuggestionStripProps) {
  if (alreadyUsed) return null;

  const suggestions =
    columns && columns.length > 0
      ? generateSuggestions(columns, 3)
      : DEFAULT_SUGGESTIONS;

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        padding: "8px 12px 4px",
        overflowX: "auto",
        flexShrink: 0,
        scrollbarWidth: "none",
      }}
      aria-label="AI prompt suggestions"
    >
      <span
        style={{
          fontSize: 11,
          color: "var(--tx2, #888)",
          whiteSpace: "nowrap",
          alignSelf: "center",
          marginRight: 4,
        }}
      >
        Try:
      </span>
      {suggestions.map((s) => (
        <button
          key={s.prompt}
          onClick={() => onSelect(s.prompt)}
          style={{
            flexShrink: 0,
            padding: "4px 10px",
            borderRadius: 20,
            border: "1px solid var(--bd1, #2a2a3a)",
            background: "var(--bg2, #14141e)",
            color: "var(--tx1, #c8c8d8)",
            fontSize: 12,
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "background 0.15s, border-color 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--bg3, #1e1e2a)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--acl, #5B6AF0)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--bg2, #14141e)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--bd1, #2a2a3a)";
          }}
          title={s.prompt}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
