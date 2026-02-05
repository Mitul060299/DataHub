import { useState } from "react";
import type { AIAction, AIContext, AIResponse, DatasetSummary } from "../types";
import { useAIStream } from "./useAIStream";

export function useAIChat(context: AIContext) {
  const [isLoading, setIsLoading] = useState(false);
  const { sendMessage } = useAIStream(context);

  const request = async (
    message: string,
    dataset?: DatasetSummary,
    action?: AIAction
  ): Promise<AIResponse> => {
    setIsLoading(true);
    const response = await sendMessage(message, dataset, action);
    setIsLoading(false);
    return response;
  };

  return { sendMessage: request, isLoading };
}
