import { useEffect, useMemo, useState } from "react";
import { Divider, Space, Typography } from "antd";
import type { AIAction, AIContext, AIMessage, DatasetSummary } from "./types";
import { AIChatHeader } from "./AIChatHeader";
import { AIChatMessages } from "./AIChatMessages";
import { AIChatInput } from "./AIChatInput";
import { useAIChat } from "./hooks/useAIChat";
import { useAIContext } from "./hooks/useAIContext";

const { Text } = Typography;

type Props = {
  context: AIContext;
  currentDataset?: DatasetSummary;
  onAction: (action: AIAction) => void;
  suggestions?: string[];
};

export function AIChat({ context, currentDataset, onAction, suggestions }: Props) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState("");
  const [compact, setCompact] = useState(false);
  const { sendMessage, isLoading } = useAIChat(context);
  const { suggestions: contextSuggestions, quickActions, welcomeMessage } = useAIContext(
    context,
    currentDataset
  );

  const resolvedSuggestions = useMemo(
    () => suggestions ?? contextSuggestions,
    [suggestions, contextSuggestions]
  );

  const continuityKey = useMemo(
    () => `ai-chat-continuity:${context}:${currentDataset?.id ?? "global"}`,
    [context, currentDataset?.id]
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem(continuityKey);
      if (saved) {
        const parsed = JSON.parse(saved) as AIMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      }
    } catch {
    }
    setMessages([welcomeMessage]);
  }, [welcomeMessage, continuityKey]);

  useEffect(() => {
    if (messages.length === 0) return;
    try {
      const capped = messages.slice(-50);
      localStorage.setItem(continuityKey, JSON.stringify(capped));
    } catch {
    }
  }, [messages, continuityKey]);

  const appendMessage = (message: AIMessage) => {
    setMessages((prev) => [...prev, message]);
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const userMessage: AIMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    appendMessage(userMessage);
    setInput("");
    const response = await sendMessage(trimmed, currentDataset);
    const aiMessage: AIMessage = {
      id: `ai-${Date.now()}`,
      role: "assistant",
      content: response.message,
      actions: response.actions,
      status: response.status,
    };
    appendMessage(aiMessage);
  };

  const handleQuickAction = async (action: AIAction) => {
    const userMessage: AIMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: action.label ?? action.type,
    };
    appendMessage(userMessage);
    const response = await sendMessage(action.label ?? action.type, currentDataset, action);
    const aiMessage: AIMessage = {
      id: `ai-${Date.now()}`,
      role: "assistant",
      content: response.message,
      actions: response.actions,
      status: response.status,
    };
    appendMessage(aiMessage);
    if (response.autoExecute && response.actions) {
      response.actions.forEach((next) => onAction(next));
    }
  };

  const handleAction = (action: AIAction) => {
    if (action.type === "retry_suggestion") {
      setInput(action.label ?? "");
      return;
    }
    if (action.type === "load_dataset_context") {
      setInput("Load a dataset and retry this request.");
      return;
    }
    onAction(action);
  };

  return (
    <div className={`ai-chat-container ${compact ? "ai-chat-compact" : ""}`}>
      <AIChatHeader
        context={context}
        dataset={currentDataset}
        onToggleCompact={() => setCompact((prev) => !prev)}
      />
      <div className="ai-chat-quick-actions">
        <Text className="ai-chat-section-title">Quick actions</Text>
        <Space wrap>
          {quickActions.map((action) => (
            <button
              key={action.type}
              className="ai-quick-chip"
              onClick={() => handleQuickAction(action)}
            >
              {action.label ?? action.type}
            </button>
          ))}
        </Space>
      </div>
      <AIChatMessages messages={messages} onAction={handleAction} />
      <Divider style={{ margin: "12px 0" }} />
      <div className="ai-chat-suggestions">
        <Text className="ai-chat-section-title">Suggested prompts</Text>
        <div className="ai-suggestion-list">
          {resolvedSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              className="ai-suggestion"
              onClick={() => setInput(suggestion)}
            >
              • {suggestion}
            </button>
          ))}
        </div>
      </div>
      <AIChatInput
        value={input}
        onChange={setInput}
        onSend={handleSend}
        disabled={isLoading}
        placeholder={`Ask me anything about ${context}...`}
      />
    </div>
  );
}

export type { AIAction, AIContext, DatasetSummary } from "./types";
