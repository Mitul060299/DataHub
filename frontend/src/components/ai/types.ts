export type AIContext = "import" | "clean" | "transform" | "model" | "dashboard" | "ml";

export type AIAction = {
  type: string;
  label?: string;
  payload?: Record<string, unknown>;
};

export type AIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: AIAction[];
};

export type DatasetSummary = {
  id: string;
  name: string;
  rows?: number;
  columns?: string[];
};

export type AIResponse = {
  message: string;
  actions?: AIAction[];
  suggestions?: string[];
  autoExecute?: boolean;
};
