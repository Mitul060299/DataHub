import { useMemo, useState } from "react";
import { usePipelineContext } from "../contexts/PipelineContext";
import { useWorkspaceContext, type Dataset } from "../contexts/WorkspaceContext";
import { useChatSession, type AgentEvent, type ConversationMessage, type PlanStep, type TransformationPayload } from "../hooks/useChatSession";
import { usePipeline } from "../hooks/usePipeline";
import { IconRefresh, IconZap } from "./Icons";
import PlanCard from "./PlanCard";
import { StepCard } from "./StepCard";

type Message = ConversationMessage & {
  id: string;
  transformation?: TransformationPayload;
  stepStatus?: "pending" | "applying" | "applied" | "discarded";
  plan?: PlanStep[];
  planPending?: boolean;
  planApproved?: boolean;
  planRejected?: boolean;
};

interface AIPanelProps {
  dataset: Dataset | null;
  workspaceId: string;
  projectId: string;
  onStepApplied: () => void;
}

export function AIPanel({ dataset, workspaceId, projectId, onStepApplied }: AIPanelProps) {
  const { addStep, steps } = usePipelineContext();
  const { setActiveDataset } = useWorkspaceContext();
  const { executeTransformation } = usePipeline();
  const { sendMessage, sending, resetSession } = useChatSession();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  const history = useMemo<ConversationMessage[]>(() => messages.map(({ role, content }) => ({ role, content })), [messages]);

  const handleAgentEvent = (event: AgentEvent) => {
    switch (event.type) {
      case "agent.plan": {
        const plan = (event.plan as PlanStep[] | undefined) || [];
        setMessages((previous) => [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "Here's my plan:",
            plan,
            planPending: true,
          },
        ]);
        break;
      }
      case "agent.done": {
        const responseText = typeof event.response === "string" ? event.response : "Done.";
        setMessages((previous) => [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: responseText,
          },
        ]);
        break;
      }
      case "agent.error": {
        const errorText = typeof event.error === "string" ? event.error : "Unknown error";
        setMessages((previous) => [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Error: ${errorText}`,
          },
        ]);
        break;
      }
      default:
        break;
    }
  };

  const handleSend = async (text?: string, approvePlan?: boolean) => {
    if (!dataset) return;
    const content = (text || input).trim();
    if (!content && !approvePlan) return;

    if (content) {
      setMessages((previous) => [
        ...previous,
        { id: crypto.randomUUID(), role: "user", content },
      ]);
    }
    setInput("");

    try {
      await sendMessage({
        message: content,
        dataset_id: dataset.id,
        workspace_id: workspaceId,
        project_id: projectId,
        conversation_history: [...history, ...(content ? [{ role: "user" as const, content }] : [])],
        pipeline_steps: steps.map((step) => ({
          operation: step.operation,
          description: step.description,
          sql: step.sql,
          rows_affected: step.affectedRows,
        })),
        plan_approved: approvePlan ?? false,
        onEvent: handleAgentEvent,
      });
    } catch (error: unknown) {
      const maybeError = error as { response?: { data?: { detail?: string } }; message?: string };
      const rawMessage = maybeError.response?.data?.detail ?? maybeError.message ?? "Chat request failed.";
      const message = rawMessage.toLowerCase().includes("network error")
        ? "Network Error: Backend API is unreachable. Ensure /api routes are configured (Vercel rewrite or Vite proxy) and backend is reachable on Render."
        : rawMessage;
      setMessages((previous) => [
        ...previous,
        { id: crypto.randomUUID(), role: "assistant", content: `Error: ${message}` },
      ]);
    }
  };

  const approvePlan = () => {
    setMessages((previous) => previous.map((message) => (
      message.planPending
        ? { ...message, planPending: false, planApproved: true }
        : message
    )));
    void handleSend("", true);
  };

  const rejectPlan = () => {
    setMessages((previous) => previous.map((message) => (
      message.planPending
        ? { ...message, planPending: false, planRejected: true }
        : message
    )));
  };

  const applyStep = async (messageId: string, transformation: TransformationPayload) => {
    if (!dataset || !transformation.sql) return;
    setMessages((current) => current.map((msg) => (msg.id === messageId ? { ...msg, stepStatus: "applying" } : msg)));
    try {
      const response = await executeTransformation({
        dataset_id: dataset.id,
        sql: transformation.sql,
        operation: transformation.operation,
        description: transformation.description,
        affectedRows: transformation.affectedRows,
      });
      const outputDataset = response.result?.outputDataset;
      if (outputDataset?.id) {
        setActiveDataset({
          id: outputDataset.id,
          name: outputDataset.name,
          rows: outputDataset.rowCount,
        });
      }
      addStep({
        id: crypto.randomUUID(),
        stepNumber: Date.now(),
        operation: transformation.operation,
        description: transformation.description,
        sql: transformation.sql,
        affectedRows: transformation.affectedRows,
        appliedAt: new Date(),
        inputDataset: {
          id: dataset.id,
          name: dataset.name,
          rows: dataset.rows,
        },
        outputDataset: outputDataset
          ? {
              id: outputDataset.id,
              name: outputDataset.name,
              rowCount: outputDataset.rowCount,
              parentId: outputDataset.parentId,
            }
          : undefined,
      });
      setMessages((current) => current.map((msg) => (msg.id === messageId ? { ...msg, stepStatus: "applied" } : msg)));
      onStepApplied();
    } catch (error: unknown) {
      const maybeError = error as { response?: { data?: { detail?: string } }; message?: string };
      const detail = maybeError.response?.data?.detail ?? maybeError.message ?? "Transformation failed.";
      setMessages((current) => current.map((msg) => (
        msg.id === messageId
          ? { ...msg, stepStatus: "pending", content: `${msg.content}\n\nApply failed: ${detail}` }
          : msg
      )));
    }
  };

  const discardStep = (messageId: string) => {
    setMessages((current) => current.map((msg) => (msg.id === messageId ? { ...msg, stepStatus: "discarded" } : msg)));
  };

  return (
    <aside style={{ width: "var(--rw)", minWidth: "var(--rw)", borderLeft: "1px solid var(--bd)", background: "var(--bg1)", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <header style={{ height: 40, borderBottom: "1px solid var(--bd)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span className="badge-dot pulse" style={{ background: "var(--gr)" }} />
          <IconZap size={14} />
          AI Agent
        </span>
        <button className="btn" style={{ width: 28, padding: 0 }} onClick={() => { setMessages([]); resetSession(); }}>
          <IconRefresh size={14} />
        </button>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 10, display: "grid", gap: 10, alignContent: "start" }}>
        {!dataset ? (
          <div style={{ color: "var(--tx1)", display: "grid", gap: 8 }}>
            <p>No dataset loaded. Try:</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="btn" style={{ height: 24 }}>Remove duplicates</span>
              <span className="btn" style={{ height: 24 }}>Fill nulls</span>
              <span className="btn" style={{ height: 24 }}>Normalize dates</span>
            </div>
          </div>
        ) : null}

        {messages.map((message) => (
          <div key={message.id} style={{ justifySelf: message.role === "user" ? "end" : "start", maxWidth: "90%" }}>
            <div style={{ border: "1px solid var(--bd2)", background: message.role === "user" ? "var(--acg)" : "var(--bg2)", borderRadius: "var(--r8)", padding: 8 }}>
              <p>{message.content}</p>
              {message.transformation ? (
                <StepCard
                  operation={message.transformation.operation}
                  sql={message.transformation.sql}
                  description={message.transformation.description}
                  affectedRows={message.transformation.affectedRows}
                  status={message.stepStatus ?? "pending"}
                  onApply={() => void applyStep(message.id, message.transformation!)}
                  onDiscard={() => discardStep(message.id)}
                />
              ) : null}
              {message.plan ? (
                <PlanCard
                  steps={message.plan}
                  pending={Boolean(message.planPending)}
                  approved={message.planApproved}
                  rejected={message.planRejected}
                  onApprove={approvePlan}
                  onReject={rejectPlan}
                />
              ) : null}
            </div>
          </div>
        ))}
        {sending ? (
          <div style={{ display: "inline-flex", gap: 4, alignItems: "center", color: "var(--tx1)" }}>
            <span>Thinking</span>
            <span className="dot-bounce" />
            <span className="dot-bounce" style={{ animationDelay: "0.14s" }} />
            <span className="dot-bounce" style={{ animationDelay: "0.28s" }} />
            <style>{`.dot-bounce{width:6px;height:6px;border-radius:99px;background:var(--tx1);display:inline-block;animation:dotBounce 0.8s infinite ease-in-out;}@keyframes dotBounce{0%,80%,100%{transform:translateY(0);opacity:.5}40%{transform:translateY(-4px);opacity:1}}`}</style>
          </div>
        ) : null}
      </div>

      <div style={{ borderTop: "1px solid var(--bd)", padding: 10 }}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask the AI agent..."
          rows={2}
          style={{ width: "100%", resize: "none", border: "1px solid var(--bd2)", borderRadius: "var(--r8)", background: "var(--bg2)", padding: 8 }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSend();
            }
          }}
        />
      </div>
    </aside>
  );
}
