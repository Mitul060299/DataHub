/**
 * Schema-driven prompt suggestion heuristics.
 *
 * Takes a list of column descriptors and returns up to `count` natural-language
 * prompts tailored to the dataset.  Zero LLM calls -- pure heuristics so there
 * is no latency cost on dataset load.
 *
 * Rules (applied in priority order):
 *   1. If a numeric column exists  ->  "Show top 10 rows by {col}"
 *   2. If a date/datetime column   ->  "Show trend of {numericCol} over time"
 *   3. If a string column exists   ->  "Group by {strCol} and count rows"
 *   4. Always                      ->  "Find and remove duplicate rows"
 *   5. Always                      ->  "Show a summary of this dataset"
 */

import type { ColSchema } from "../components/SuggestionChips";

export type { ColSchema };

export interface PromptSuggestion {
  label: string;
  prompt: string;
}

const NUMERIC_TYPES = new Set(["int64", "int32", "int16", "int8", "float64", "float32", "number", "integer", "numeric", "bigint", "double"]);
const DATE_TYPES = new Set(["datetime64[ns]", "datetime", "date", "timestamp", "timestamptz"]);
const STRING_TYPES = new Set(["object", "string", "text", "varchar", "category"]);

function isNumeric(t: string) { return NUMERIC_TYPES.has(t.toLowerCase()); }
function isDate(t: string) { return DATE_TYPES.has(t.toLowerCase()); }
function isString(t: string) { return STRING_TYPES.has(t.toLowerCase()); }

function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function generateSuggestions(
  columns: ColSchema[],
  count = 3,
): PromptSuggestion[] {
  const suggestions: PromptSuggestion[] = [];

  const numericCols = columns.filter((c) => isNumeric(c.type));
  const dateCols = columns.filter((c) => isDate(c.type));
  const stringCols = columns.filter((c) => isString(c.type));

  // 1. Top-N by numeric col
  if (numericCols.length > 0) {
    const col = numericCols[0];
    suggestions.push({
      label: `Top 10 by ${titleCase(col.name)}`,
      prompt: `Show top 10 rows sorted by ${col.name} descending`,
    });
  }

  // 2. Trend over time
  if (dateCols.length > 0 && numericCols.length > 0) {
    const dateCol = dateCols[0];
    const numCol = numericCols[0];
    suggestions.push({
      label: `Trend of ${titleCase(numCol.name)} over time`,
      prompt: `Group by ${dateCol.name} (monthly) and sum ${numCol.name}, then show as a line chart`,
    });
  }

  // 3. Group by string
  if (stringCols.length > 0 && suggestions.length < count) {
    const col = stringCols[0];
    suggestions.push({
      label: `Group by ${titleCase(col.name)}`,
      prompt: `Group by ${col.name} and count rows, sorted by count descending`,
    });
  }

  // 4. Duplicates check (always useful)
  if (suggestions.length < count) {
    suggestions.push({
      label: "Find duplicate rows",
      prompt: "Find all duplicate rows and show how many there are",
    });
  }

  // 5. Summary (always useful as last resort)
  if (suggestions.length < count) {
    suggestions.push({
      label: "Summarise this dataset",
      prompt: "Give me a summary of this dataset: row count, column types, missing values and key statistics",
    });
  }

  return suggestions.slice(0, count);
}

/**
 * Fallback suggestions when no column schema is available yet.
 */
export const DEFAULT_SUGGESTIONS: PromptSuggestion[] = [
  { label: "Summarise this dataset", prompt: "Give me a summary of this dataset: row count, column types, missing values and key statistics" },
  { label: "Find duplicate rows", prompt: "Find all duplicate rows and show how many there are" },
  { label: "Show top 10 rows", prompt: "Show the top 10 rows sorted by the most relevant numeric column" },
];