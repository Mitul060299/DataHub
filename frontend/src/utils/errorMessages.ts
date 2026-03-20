// Humanised error messages for API/network/AI errors

const networkErrors: Record<string, string> = {
  "Network Error": "Unable to connect. Check your internet connection and try again.",
  "timeout": "Request timed out. Please try again in a moment.",
  "ECONNREFUSED": "Server is currently unreachable. Please try again shortly.",
};

const llmErrorPatterns: [RegExp, string][] = [
  [/taking longer than usual|complex request/i, "I'm taking a bit longer than usual — please try again in a moment."],
  [/rate limit|429/i, "Too many requests. Please wait a few seconds before sending another message."],
  [/context length|token limit/i, "Your question is too long for me to process. Try breaking it into smaller parts."],
  [/model not found|invalid model/i, "The AI service is temporarily unavailable. Our team has been notified."],
  [/invalid API key|authentication/i, "Authentication error with the AI service. Please contact support."],
  [/groq|openai|anthropic/i, "The AI service returned an unexpected error. Please try again."],
];

export function humaniseError(error: unknown): string {
  if (!error) return "An unexpected error occurred. Please try again.";

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : JSON.stringify(error);

  // Check network errors
  for (const [key, humanised] of Object.entries(networkErrors)) {
    if (message.includes(key)) return humanised;
  }

  // Check LLM-specific patterns
  for (const [pattern, humanised] of llmErrorPatterns) {
    if (pattern.test(message)) return humanised;
  }

  // HTTP status codes
  if (message.includes("401") || message.includes("403")) {
    return "Your session has expired. Please sign in again.";
  }
  if (message.includes("404")) {
    return "The requested resource was not found.";
  }
  if (message.includes("500") || message.includes("502") || message.includes("503")) {
    return "The server encountered an error. Please try again shortly.";
  }

  // Fallback: trim down overly long messages
  if (message.length > 120) {
    return "An unexpected error occurred. Please try again.";
  }

  return message;
}

export function isRetryableError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return (
    message.includes("Network Error") ||
    message.includes("timeout") ||
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    /taking longer than usual|complex request/i.test(message)
  );
}
