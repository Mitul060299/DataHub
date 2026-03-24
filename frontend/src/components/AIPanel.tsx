import { useMemo, useState } from "react";
import { usePipelineContext } from "../contexts/PipelineContext";
import { useWorkspaceContext, type Dataset } from "../contexts/WorkspaceContext";
import { useChatSession, type AgentEvent, type ConversationMessage, type PlanStep, type TransformationPayload } from "../hooks/useChatSession";
import { usePipeline } from "../hooks/usePipeline";
import { IconRefresh, IconZap } from "./Icons";
import PlanCard from "./PlanCard";
import { StepCard } from "./StepCard";
import { EChartsRenderer } from "./EChartsRenderer";
import { PinToDashboardModal } from "./PinToDashboardModal";
import { ErrorBubble } from "./ErrorBubble";
import { EmptyStateChatPanel } from "./EmptyStateChatPanel";
import { capture } from "../lib/posthog";
import { humaniseError, isRetryableError } from "../utils/errorMessages";

interface TileCreatedData {
  id: string;
  dashboard_id: string;
  title: string;
  chart_type: string;
  echarts_config: Record<string, unknown> | null;
  source_table?: string;
  saveable?: boolean;
}

type Message = ConversationMessage & {
  id: string;
  transformation?: TransformationPayload;
  stepStatus?: "pending" | "applying" | "applied" | "discarded";
  plan?: PlanStep[];
  planPending?: boolean;
  planApproved?: boolean;
  planRejected?: boolean;
  tileCreated?: TileCreatedData;
};

interface AIPanelProps {
  dataset: Dataset | null;
  workspaceId: string;
  projectId: string;
  onStepApplied: () => void;
  onDatasetMutated?: () => void;
}

export function AIPanel({ dataset, workspaceId, projectId, onStepApplied, onDatasetMutated }: AIPanelProps) {
  const { addStep, steps } = usePipelineContext();
  const { setActiveDataset } = useWorkspaceContext();
  const { executeTransformation } = usePipeline();
  const { sendMessage, sending, resetSession } = useChatSession();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pinModal, setPinModal] = useState<TileCreatedData | null>(null);

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
            planApproved: false,
          },
        ]);
        break;
      }
      case "agent.done": {
        const responseText = typeof event.response === "string" ? event.response : "Done.";

        const runId = typeof event.run_id === "string" ? event.run_id : null;
        const runSteps = Array.isArray(event.run_steps)
          ? (event.run_steps as Array<Record<string, unknown>>)
          : [];
        const pipelineSteps = Array.isArray(event.pipeline_steps)
          ? (event.pipeline_steps as Array<Record<string, unknown>>)
          : [];
        const completedSteps = runSteps.length > 0
          ? runSteps
          : runId
            ? pipelineSteps.filter((step) => {
                const agentRunId = step.agent_run_id;
                const stepRunId = step.run_id;
                return (
                  (typeof agentRunId === "string" && agentRunId === runId)
                  || (typeof stepRunId === "string" && stepRunId === runId)
                );
              })
            : [];

        const sortedCompletedSteps = [...completedSteps].sort((a, b) => {
          const left = Number(a.step_number ?? 0);
          const right = Number(b.step_number ?? 0);
          return (Number.isFinite(left) ? left : 0) - (Number.isFinite(right) ? right : 0);
        });
        const lastCompletedStep = sortedCompletedSteps.length
          ? sortedCompletedSteps[sortedCompletedSteps.length - 1]
          : null;

        const finalOutputDatasetIdFromEvent = typeof event.output_dataset_id === "string" ? event.output_dataset_id : "";
        const finalOutputDatasetIdFromSteps = lastCompletedStep && typeof lastCompletedStep.output_dataset_id === "string"
          ? lastCompletedStep.output_dataset_id
          : "";
        const finalOutputDatasetId = finalOutputDatasetIdFromEvent || finalOutputDatasetIdFromSteps;

        const maxStepNumber = sortedCompletedSteps.reduce((max, step) => {
          const stepNum = Number(step.step_number ?? 0);
          return Number.isFinite(stepNum) ? Math.max(max, stepNum) : max;
        }, 0);

        for (const stepRecord of sortedCompletedSteps) {
          const operation = String(stepRecord.operation ?? "transform");
          const description = String(stepRecord.description ?? "Execute transformation step");
          const sql = typeof stepRecord.sql === "string" ? stepRecord.sql : undefined;
          const stepNumber = Number(stepRecord.step_number ?? Date.now());
          const rawRows = stepRecord.rows_affected;
          const numericRows = typeof rawRows === "number"
            ? rawRows
            : Number.isFinite(Number(rawRows))
              ? Number(rawRows)
              : undefined;
          const affectedRows = numericRows !== undefined ? String(numericRows) : undefined;

          const inputDatasetId = typeof stepRecord.input_dataset_id === "string"
            ? stepRecord.input_dataset_id
            : dataset?.id;
          const outputDatasetId = typeof stepRecord.output_dataset_id === "string"
            ? stepRecord.output_dataset_id
            : undefined;
          const isFinalStep = maxStepNumber > 0 ? stepNumber === maxStepNumber : true;
          const effectiveOutputDatasetId = (
            isFinalStep && finalOutputDatasetId
              ? finalOutputDatasetId
              : outputDatasetId
          );
          const hasDerivedOutput = Boolean(
            effectiveOutputDatasetId
            && effectiveOutputDatasetId !== inputDatasetId
            && effectiveOutputDatasetId !== dataset?.id
          );

          // Truncate long AI-generated descriptions so pipeline step labels
          // and artifact names stay short and readable (max 40 chars).
          const shortDescription = description.length > 40
            ? `${description.slice(0, 38)}\u2026`
            : description;
          // Build a concise artifact output name: "<operation>: <short desc>"
          const opLabel = operation.replace(/_/g, " ");
          const rawArtifactName = `${opLabel}: ${shortDescription}`;
          const shortArtifactName = rawArtifactName.length > 40
            ? `${rawArtifactName.slice(0, 38)}\u2026`
            : rawArtifactName;
          addStep({
            id: crypto.randomUUID(),
            stepNumber,
            operation,
            description: shortDescription,
            sql,
            affectedRows,
            appliedAt: new Date(),
            inputDataset: dataset
              ? {
                  id: inputDatasetId || dataset.id,
                  name: dataset.name,
                  rows: dataset.rows,
                }
              : undefined,
            outputDataset: hasDerivedOutput && isFinalStep
              ? {
                  id: effectiveOutputDatasetId!,
                  name: shortArtifactName,
                  rowCount: numericRows ?? 0,
                  parentId: inputDatasetId ?? null,
                }
              : undefined,
          });
        }

        if (sortedCompletedSteps.length > 0) {
          onStepApplied();
        }

        if (finalOutputDatasetId) {
          if (dataset?.id !== finalOutputDatasetId) {
            const finalStep = sortedCompletedSteps.find((step) => Number(step.step_number ?? 0) === maxStepNumber) ?? lastCompletedStep;
            const finalRowsRaw = finalStep?.rows_affected;
            const finalRows = typeof finalRowsRaw === "number"
              ? finalRowsRaw
              : Number.isFinite(Number(finalRowsRaw))
                ? Number(finalRowsRaw)
                : 0;
            const rawName = finalStep?.description ? String(finalStep.description) : "AI Output";
            const shortName = rawName.length > 40 ? `${rawName.slice(0, 38)}\u2026` : rawName;
            setActiveDataset({
              id: finalOutputDatasetId,
              name: shortName,
              rows: finalRows,
            });
          }
          onDatasetMutated?.();
        }

        // Extract tile_created with echarts_config from run_steps
        let tileCreatedData: TileCreatedData | undefined;
        for (const step of sortedCompletedSteps) {
          const tc = step.tile_created as Record<string, unknown> | undefined;
          if (tc && tc.echarts_config && tc.saveable) {
            tileCreatedData = {
              id: String(tc.id ?? ""),
              dashboard_id: String(tc.dashboard_id ?? ""),
              title: String(tc.title ?? "Chart"),
              chart_type: String(tc.chart_type ?? "bar"),
              echarts_config: tc.echarts_config as Record<string, unknown>,
              source_table: tc.source_table ? String(tc.source_table) : undefined,
              saveable: true,
            };
          }
        }

        setMessages((previous) => [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: responseText,
            tileCreated: tileCreatedData,
          },
        ]);
        break;
      }
      case "agent.error": {
        // Use the raw backend message for agent.error events — they are already
        // concise server-side strings. Only fall through humaniseError for
        // network-layer errors (handled in the catch block below).
        const errorText = typeof event.error === "string" && event.error.trim()
          ? event.error.trim()
          : "The AI agent encountered an unexpected error. Please try again.";
        capture("ai_error", { error_type: "agent.error", message: errorText.slice(0, 200) });
        setMessages((previous) => [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: errorText,
          },
        ]);
        break;
      }
      case "column_added": {
        onDatasetMutated?.();
        break;
      }
      case "tile_created": {
        window.dispatchEvent(new CustomEvent("datahub:dashboard:refresh"));
        break;
      }
      default:
        break;
    }
  };

  const handleSend = async (text?: string, approvePlan?: boolean, pendingPlan?: PlanStep[]) => {
    if (!dataset) return;
    const content = (text || input).trim();
    if (!content && !approvePlan) return;

    if (content && !approvePlan) {
      setMessages((previous) => [
        ...previous,
        { id: crypto.randomUUID(), role: "user", content },
      ]);
      capture("ai_message_sent", { dataset_id: dataset.id, workspace_id: workspaceId });
    }
    setInput("");

    try {
      await sendMessage({
        message: content,
        dataset_id: dataset.id,
        workspace_id: workspaceId,
        project_id: projectId,
        conversation_history: [...history, ...(content && !approvePlan ? [{ role: "user" as const, content }] : [])],
        pipeline_steps: steps.map((step) => ({
          operation: step.operation,
          description: step.description,
          sql: step.sql,
          rows_affected: step.affectedRows,
        })),
        plan_approved: approvePlan ?? false,
        pending_plan: pendingPlan,
        onEvent: handleAgentEvent,
      });
    } catch (error: unknown) {
      const humanised = humaniseError(error);
      capture("ai_error", { error_type: "send_failed", retryable: isRetryableError(error) });
      setMessages((previous) => [
        ...previous,
        { id: crypto.randomUUID(), role: "assistant", content: `Error: ${humanised}` },
      ]);
    }
  };

  const approvePlan = () => {
    const latestUserPrompt = [...messages]
      .reverse()
      .find((message) => message.role === "user")
      ?.content
      ?.trim() || "";

    // Collect the pending plan steps from the plan message so the backend can
    // execute them without relying on in-process MemorySaver checkpoints.
    const pendingPlanSteps = messages
      .filter((m) => m.planPending && Array.isArray(m.plan))
      .flatMap((m) => m.plan ?? []);

    setMessages((previous) => previous.map((message) => (
      message.planPending
        ? { ...message, planPending: false, planApproved: true }
        : message
    )));
    void handleSend(latestUserPrompt, true, pendingPlanSteps);
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
          <EmptyStateChatPanel
            hasDataset={false}
            onSuggestionSelect={(s) => { setInput(s); }}
            onUploadClick={() => {}}
          />
        ) : messages.length === 0 ? (
          <EmptyStateChatPanel
            hasDataset
            datasetName={dataset.name}
            onSuggestionSelect={(s) => { setInput(s); void handleSend(s); }}
            onUploadClick={() => {}}
          />
        ) : null}

        {messages.map((message) => (
          <div key={message.id} style={{ justifySelf: message.role === "user" ? "end" : "start", maxWidth: "90%" }}>
            {message.role === "assistant" && message.content.startsWith("Error:") ? (
              <ErrorBubble
                message={message.content.replace(/^Error:\s*/, "")}
                onRetry={isRetryableError(message.content) ? () => {
                  const last = [...messages].reverse().find((m) => m.role === "user");
                  if (last) void handleSend(last.content);
                } : undefined}
              />
            ) : (
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
              {message.tileCreated?.echarts_config ? (
                <div style={{ marginTop: 8 }}>
                  <EChartsRenderer
                    config={message.tileCreated.echarts_config}
                    height={280}
                  />
                  <button
                    onClick={() => setPinModal(message.tileCreated!)}
                    style={{
                      marginTop: 6,
                      background: "#5B6AF0",
                      border: "none",
                      borderRadius: 6,
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "4px 12px",
                      cursor: "pointer",
                    }}
                  >
                    📌 Pin to Dashboard
                  </button>
                </div>
              ) : null}
            </div>
            )}
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
      {pinModal && (
        <PinToDashboardModal
          tileCreated={pinModal}
          workspaceId={workspaceId}
          onClose={() => setPinModal(null)}
        />
      )}
    </aside>
  );
}
