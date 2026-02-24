import type { AIAction, AIContext, AIResponse, DatasetSummary } from "../types";
import { createChatSession, streamChatSessionMessage } from "../../../api";

const aiSessionCache = new Map<string, string>();

const buildImportResponse = (message: string): AIResponse => {
  const lower = message.toLowerCase();
  if (lower.includes("csv") || lower.includes("upload")) {
    return {
      message: "Great! Please upload your file and I'll analyze the schema.",
      status: "info",
      actions: [
        { type: "show_upload_ui", label: "Upload File" },
        { type: "start_import", label: "Start Import" },
      ],
    };
  }
  if (lower.includes("database") || lower.includes("postgres")) {
    return {
      message: "I can connect to your database. Want me to open the connector form?",
      status: "info",
      actions: [
        { type: "connect_database", label: "Database" },
        { type: "connect_api", label: "API" },
      ],
    };
  }
  return {
    message: "I can help import data from files, databases, or APIs. Which source should we use?",
    status: "info",
    actions: [
      { type: "show_upload_ui", label: "Upload File" },
      { type: "connect_database", label: "Database" },
      { type: "connect_api", label: "API" },
    ],
  };
};

const buildCleanResponse = (): AIResponse => ({
  message: "I found missing values, duplicates, and formatting issues. Want me to apply fixes?",
  status: "info",
  actions: [
    { type: "apply_all", label: "Apply All" },
    { type: "show_examples", label: "Show Examples" },
  ],
});

const buildTransformResponse = (): AIResponse => ({
  message: "I can build a transformation pipeline. What should we do first?",
  status: "info",
  actions: [
    { type: "add_join", label: "Join Data" },
    { type: "add_filter", label: "Filter Rows" },
    { type: "add_calc", label: "New Column" },
  ],
});

const buildModelResponse = (): AIResponse => ({
  message: "I can detect relationships and refine your schema. Want me to scan for links?",
  status: "info",
  actions: [
    { type: "detect_relationships", label: "Detect Relationships" },
    { type: "auto_layout", label: "Auto Layout" },
  ],
});

const buildDashboardResponse = (): AIResponse => ({
  message: "I can assemble a dashboard with KPIs and charts. Which widget should I add?",
  status: "info",
  actions: [
    { type: "add_kpi", label: "Add KPI" },
    { type: "add_chart", label: "Add Chart" },
    { type: "add_filter", label: "Add Filter" },
  ],
});

const buildMlResponse = (): AIResponse => ({
  message: "I can recommend a model or start training. How would you like to proceed?",
  status: "info",
  actions: [
    { type: "suggest_model", label: "Recommend Model" },
    { type: "start_training", label: "Start Training" },
  ],
});

const buildNoDatasetResponse = (context: AIContext): AIResponse => ({
  message: `Please select or import a dataset before using ${context} actions.`,
  status: "confirmation",
  actions: [
    { type: "load_dataset_context", label: "Select Dataset" },
    { type: "show_upload_ui", label: "Import Dataset" },
  ],
});

export function useAIStream(context: AIContext) {
  const getSessionKey = (datasetId: string) => `${context}:${datasetId}`;

  const ensureSession = async (datasetId: string, initialRequest?: string) => {
    const key = getSessionKey(datasetId);
    const cached = aiSessionCache.get(key);
    if (cached) return cached;
    const response = await createChatSession(datasetId, initialRequest);
    const createdId = response?.data?.id;
    if (!createdId) {
      throw new Error("Failed to create chat session");
    }
    aiSessionCache.set(key, createdId);
    return createdId;
  };

  const getServiceBackedResponse = async (message: string, dataset: DatasetSummary): Promise<AIResponse> => {
    const sessionId = await ensureSession(dataset.id, message);
    const events = await streamChatSessionMessage(sessionId, message);

    const confirmationEvent = events.find((event) => event.type === "confirmation_needed");
    if (confirmationEvent) {
      const retryActions = Array.isArray(confirmationEvent.data?.retry_actions)
        ? confirmationEvent.data?.retry_actions.slice(0, 3)
        : [];
      return {
        message: confirmationEvent.content || "Confirmation needed",
        status: "confirmation",
        actions: retryActions.map((label) => ({
          type: "retry_suggestion",
          label: String(label),
        })),
      };
    }

    const errorEvent = events.find((event) => event.type === "error");
    if (errorEvent) {
      return {
        message: errorEvent.content || "The request failed. Please adjust and retry.",
        status: "error",
        actions: [
          { type: "retry_suggestion", label: "Retry with a smaller scoped request" },
          { type: "retry_suggestion", label: "Load or select another dataset" },
        ],
      };
    }

    const replies = events.filter((event) => event.type === "message").map((event) => event.content);
    if (replies.length > 0) {
      return {
        message: replies.join("\n"),
        status: "info",
      };
    }

    const doneEvent = events.find((event) => event.type === "done");
    if (doneEvent) {
      return {
        message: doneEvent.content || "Request completed.",
        status: "success",
      };
    }

    return {
      message: "Request processed.",
      status: "success",
    };
  };

  const getResponse = async (_message: string, _dataset?: DatasetSummary, action?: AIAction): Promise<AIResponse> => {
    if (action) {
      return {
        message: `Executing: ${action.label ?? action.type}.`,
        actions: [action],
        autoExecute: true,
      };
    }

    if (_dataset?.id) {
      try {
        return await getServiceBackedResponse(_message, _dataset);
      } catch {
      }
    } else {
      return buildNoDatasetResponse(context);
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
