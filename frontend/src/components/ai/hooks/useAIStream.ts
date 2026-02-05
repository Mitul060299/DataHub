import type { AIAction, AIContext, AIResponse, DatasetSummary } from "../types";

const buildImportResponse = (message: string): AIResponse => {
  const lower = message.toLowerCase();
  if (lower.includes("csv") || lower.includes("upload")) {
    return {
      message: "Great! Please upload your file and I'll analyze the schema.",
      actions: [
        { type: "show_upload_ui", label: "Upload File" },
        { type: "start_import", label: "Start Import" },
      ],
    };
  }
  if (lower.includes("database") || lower.includes("postgres")) {
    return {
      message: "I can connect to your database. Want me to open the connector form?",
      actions: [
        { type: "connect_database", label: "Database" },
        { type: "connect_api", label: "API" },
      ],
    };
  }
  return {
    message: "I can help import data from files, databases, or APIs. Which source should we use?",
    actions: [
      { type: "show_upload_ui", label: "Upload File" },
      { type: "connect_database", label: "Database" },
      { type: "connect_api", label: "API" },
    ],
  };
};

const buildCleanResponse = (): AIResponse => ({
  message: "I found missing values, duplicates, and formatting issues. Want me to apply fixes?",
  actions: [
    { type: "apply_all", label: "Apply All" },
    { type: "show_examples", label: "Show Examples" },
  ],
});

const buildTransformResponse = (): AIResponse => ({
  message: "I can build a transformation pipeline. What should we do first?",
  actions: [
    { type: "add_join", label: "Join Data" },
    { type: "add_filter", label: "Filter Rows" },
    { type: "add_calc", label: "New Column" },
  ],
});

const buildModelResponse = (): AIResponse => ({
  message: "I can detect relationships and refine your schema. Want me to scan for links?",
  actions: [
    { type: "detect_relationships", label: "Detect Relationships" },
    { type: "auto_layout", label: "Auto Layout" },
  ],
});

const buildDashboardResponse = (): AIResponse => ({
  message: "I can assemble a dashboard with KPIs and charts. Which widget should I add?",
  actions: [
    { type: "add_kpi", label: "Add KPI" },
    { type: "add_chart", label: "Add Chart" },
    { type: "add_filter", label: "Add Filter" },
  ],
});

const buildMlResponse = (): AIResponse => ({
  message: "I can recommend a model or start training. How would you like to proceed?",
  actions: [
    { type: "suggest_model", label: "Recommend Model" },
    { type: "start_training", label: "Start Training" },
  ],
});

export function useAIStream(context: AIContext) {
  const getResponse = async (_message: string, _dataset?: DatasetSummary, action?: AIAction): Promise<AIResponse> => {
    if (action) {
      return {
        message: `Executing: ${action.label ?? action.type}.`,
        actions: [action],
        autoExecute: true,
      };
    }
    switch (context) {
      case "import":
        return buildImportResponse(_message);
      case "clean":
        return buildCleanResponse();
      case "transform":
        return buildTransformResponse();
      case "model":
        return buildModelResponse();
      case "dashboard":
        return buildDashboardResponse();
      case "ml":
        return buildMlResponse();
      default:
        return { message: "How can I help you?" };
    }
  };

  const sendMessage = async (message: string, dataset?: DatasetSummary, action?: AIAction) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return getResponse(message, dataset, action);
  };

  return { sendMessage };
}
