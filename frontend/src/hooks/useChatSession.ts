import { useState } from "react";
import { api } from "../api";

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type TransformationPayload = {
  operation: string;
  sql?: string;
  description: string;
  affectedRows?: string;
};

export type ChatResponsePayload = {
  session_id: string;
  response: string;
  needsConfirmation?: boolean;
  transformation?: TransformationPayload;
};

export function useChatSession() {
  const [sessionId, setSessionId] = useState<string>("default");
  const [sending, setSending] = useState(false);

  const sendMessage = async (payload: {
    message: string;
    dataset_id: string;
    workspace_id: string;
    project_id: string;
    conversation_history: ConversationMessage[];
  }) => {
    setSending(true);
    try {
      const response = await api.post<ChatResponsePayload>(`/chat-sessions/${sessionId}/message`, payload);
      if (response.data.session_id) {
        setSessionId(response.data.session_id);
      }
      return response.data;
    } finally {
      setSending(false);
    }
  };

  const resetSession = () => {
    setSessionId("default");
  };

  return { sessionId, sending, sendMessage, resetSession };
}
