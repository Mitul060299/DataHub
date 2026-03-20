import { capture } from "../lib/posthog";

interface SuggestionChipsProps {
  onSelect: (suggestion: string) => void;
  datasetName?: string;
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

function getSuggestions(datasetName?: string): string[] {
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

export const SuggestionChips = ({ onSelect, datasetName }: SuggestionChipsProps) => {
  const suggestions = getSuggestions(datasetName);

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
