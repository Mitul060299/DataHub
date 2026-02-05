import type { AIContext, DatasetSummary, AIMessage, AIAction } from "../types";

const CONTEXT_SUGGESTIONS: Record<AIContext, string[]> = {
  import: [
    "Import a CSV file",
    "Connect to PostgreSQL database",
    "Import from Google Sheets",
    "Schedule daily import from Stripe",
  ],
  clean: [
    "Remove all duplicates",
    "Fill missing values",
    "Fix date formats",
    "Remove outliers",
    "Standardize column names",
  ],
  transform: [
    "Join sales and customer data",
    "Pivot by category and month",
    "Filter rows where revenue > 1000",
    "Create a calculated column",
  ],
  model: [
    "Detect relationships automatically",
    "Create a relationship between sales and customers",
    "Suggest a schema for my data",
    "Generate documentation",
  ],
  dashboard: [
    "Create a sales dashboard",
    "Add a revenue trend chart",
    "Show top 10 products",
    "Add a KPI for total revenue",
  ],
  ml: [
    "Predict next month's sales",
    "Find customer segments",
    "Detect anomalies in my data",
    "Recommend a model for my use case",
  ],
};

const CONTEXT_QUICK_ACTIONS: Record<AIContext, AIAction[]> = {
  import: [
    { type: "show_upload_ui", label: "Upload File" },
    { type: "connect_database", label: "Database" },
    { type: "connect_api", label: "API" },
  ],
  clean: [
    { type: "apply_all", label: "Apply All Fixes" },
    { type: "show_examples", label: "Show Examples" },
    { type: "undo_last", label: "Undo" },
  ],
  transform: [
    { type: "add_join", label: "Join Datasets" },
    { type: "add_filter", label: "Add Filter" },
    { type: "add_calc", label: "New Column" },
  ],
  model: [
    { type: "detect_relationships", label: "Detect Relationships" },
    { type: "auto_layout", label: "Auto Layout" },
    { type: "export_erd", label: "Export ERD" },
  ],
  dashboard: [
    { type: "add_chart", label: "Add Chart" },
    { type: "add_kpi", label: "Add KPI" },
    { type: "add_filter", label: "Add Filter" },
  ],
  ml: [
    { type: "start_training", label: "Start Training" },
    { type: "suggest_model", label: "Suggest Model" },
    { type: "switch_dataset", label: "Change Dataset" },
  ],
};

export function useAIContext(context: AIContext, dataset?: DatasetSummary) {
  const suggestions = CONTEXT_SUGGESTIONS[context] || [];
  const quickActions = CONTEXT_QUICK_ACTIONS[context] || [];
  const welcomeMessage: AIMessage = {
    id: `welcome-${context}`,
    role: "assistant",
    content: dataset
      ? `Hi! I'm your AI assistant for ${context}. I can help with ${dataset.name}.`
      : `Hi! I'm your AI assistant for ${context}. Tell me what you'd like to do.`,
    actions: quickActions.slice(0, 3),
  };

  return { suggestions, quickActions, welcomeMessage };
}
