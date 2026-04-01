import { capture } from "../lib/posthog";

export interface ColSchema {
  name: string;
  type: string;
}

interface SuggestionChipsProps {
  onSelect: (suggestion: string) => void;
  datasetName?: string;
  columnSchema?: ColSchema[];
}

const DEFAULT_SUGGESTIONS = [
  "Show me a summary of this dataset",
  "What are the top 10 rows by value?",
  "Are there any missing values?",
  "Show me a bar chart of the main categories",
  "What is the total and average?",
  "Identify any outliers or anomalies",
];

const ACCOUNTING_SUGGESTIONS = [
  "Summarise total debits and credits by account",
  "Show me the journal entries for last month",
  "Are there any unbalanced entries?",
  "Which accounts have the most transactions?",
  "Show me a monthly trend of postings",
];

const SALES_SUGGESTIONS = [
  "Show total revenue by region",
  "Which product had the highest sales?",
  "Show me a monthly revenue trend",
  "What is the average deal size?",
  "Who are the top 5 salespeople?",
];

const EMPLOYEE_SUGGESTIONS = [
  "Show average salary by department",
  "How many employees are in each city?",
  "Who are the highest-paid employees?",
  "Show headcount by status",
  "What is the average tenure?",
];

const NUMERIC_TYPES = new Set([
  // SQL / DuckDB names
  "integer", "int", "bigint", "smallint", "tinyint", "hugeint",
  "float", "double", "numeric", "decimal", "real", "number",
  // pandas / pyarrow names stored in schema_json
  "int8", "int16", "int32", "int64", "uint8", "uint16", "uint32", "uint64",
  "float32", "float64",
]);
const DATE_TYPES = new Set([
  "date", "timestamp", "datetime", "time", "timestamptz", "timestamp with time zone",
]);

function getSuggestions(datasetName?: string, columnSchema?: ColSchema[]): string[] {
  // Schema-aware suggestions when column info is available
  if (columnSchema && columnSchema.length > 0) {
    const numeric = columnSchema.filter((c) => NUMERIC_TYPES.has(c.type.toLowerCase().split("(")[0]));
    const dates = columnSchema.filter((c) => DATE_TYPES.has(c.type.toLowerCase().split("(")[0]));
    const categories = columnSchema.filter((c) => !NUMERIC_TYPES.has(c.type.toLowerCase().split("(")[0]) && !DATE_TYPES.has(c.type.toLowerCase().split("(")[0]));

    const chips: string[] = [];

    if (dates.length > 0 && numeric.length > 0) {
      chips.push(`Show me ${numeric[0].name} trend over time by ${dates[0].name}`);
    }
    if (categories.length > 0 && numeric.length > 0) {
      chips.push(`Compare ${numeric[0].name} by ${categories[0].name}`);
    }
    if (numeric.length > 1) {
      chips.push(`What is the total and average ${numeric[0].name}?`);
    }
    chips.push("Are there any missing values or duplicates?");
    chips.push("Show me the top 10 rows by value");
    if (categories.length > 0) {
      chips.push(`Show a chart of ${numeric.length > 0 ? numeric[0].name : "counts"} by ${categories[0].name}`);
    } else {
      chips.push("Show me a summary of this dataset");
    }

    return chips.slice(0, 5);
  }

  // Fallback: name-based suggestions
  if (!datasetName) return DEFAULT_SUGGESTIONS;
  const name = datasetName.toLowerCase();
  if (name.includes("journal") || name.includes("account") || name.includes("gl")) {
    return ACCOUNTING_SUGGESTIONS;
  }
  if (name.includes("sale") || name.includes("revenue") || name.includes("deal")) {
    return SALES_SUGGESTIONS;
  }
  if (name.includes("employee") || name.includes("hr") || name.includes("staff")) {
    return EMPLOYEE_SUGGESTIONS;
  }
  return DEFAULT_SUGGESTIONS;
}

export const SuggestionChips = ({ onSelect, datasetName, columnSchema }: SuggestionChipsProps) => {
  const suggestions = getSuggestions(datasetName, columnSchema);

  return (
    <div className="suggestion-chips" role="list" aria-label="Suggested questions">
      {suggestions.map((s) => (
        <button
          key={s}
          className="suggestion-chip"
          onClick={() => {
            capture("suggestion_chip_clicked", { suggestion: s, dataset: datasetName });
            onSelect(s);
          }}
          role="listitem"
        >
          {s}
        </button>
      ))}
    </div>
  );
};
