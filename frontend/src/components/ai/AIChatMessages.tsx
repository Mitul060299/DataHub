import { useEffect, useRef } from "react";
import type { AIMessage, AIAction } from "./types";
import { AIChatMessage } from "./AIChatMessage";

type Props = {
  messages: AIMessage[];
  onAction: (action: AIAction) => void;
};

export function AIChatMessages({ messages, onAction }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  return (
    <div className="ai-chat-messages" ref={scrollRef}>
      {messages.map((message) => (
        <AIChatMessage key={message.id} message={message} onAction={onAction} />
      ))}
    </div>
  );
}
