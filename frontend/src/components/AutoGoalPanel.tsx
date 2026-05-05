/**
 * AutoGoalPanel.tsx
 * Full Auto Mode panel — goal input, run feed, interrupt card, goal report.
 * Drop-in replacement for the Manual chat panel when mode === "auto".
 */
import { useState } from "react";
import { useAutoRunSession } from "../hooks/useAutoRunSession";
import { AutoRunFeed } from "./AutoRunFeed";
import { AutoInterruptCard } from "./AutoInterruptCard";
import { AutoGoalReport } from "./AutoGoalReport";

interface Props {
  datasetId: string;
  projectId: string;
  sessionId?: string;
}

export function AutoGoalPanel({ datasetId, projectId, sessionId }: Props) {
  const { state, start, resume, cancel, approvePlan, reset } = useAutoRunSession();
  const [goal, setGoal] = useState("");
  const [dryRun, setDryRun] = useState(false);

  const isIdle = state.status === "idle";
  const isRunning = state.status === "running";
  const isInterrupted = state.status === "interrupted";
  const isComplete = state.status === "complete";
  const isError = state.status === "error";

  const handleStart = () => {
    if (!goal.trim()) return;
    // Backend rejects empty dataset_id; surface a clear UX error rather
    // than firing a doomed POST.
    if (!datasetId || !datasetId.trim()) {
      // eslint-disable-next-line no-alert
      window.alert("Please select a dataset before starting Auto Mode.");
      return;
    }
    start({ datasetId, projectId, sessionId, goal: goal.trim(), dryRun });
  };

  const handleInterruptAnswer = (answer: string) => {
    if (!state.runId) return;
    resume(state.runId, answer);
  };

  return (
    <div className="flex flex-col h-full gap-3 px-3 pt-3 pb-4">
      {/* Goal input */}
      {isIdle && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 leading-relaxed">
            Describe your data goal or business rules. The agent will parse them into testable rules,
            generate a pipeline plan, and execute it autonomously.
          </p>
          <textarea
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-400"
            rows={6}
            placeholder="e.g. Remove duplicate orders by order_id (keep latest), ensure no null values in customer_email, standardise country codes to ISO alpha-2…"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="rounded"
              />
              Dry run (sample 5 000 rows)
            </label>
            <button
              onClick={handleStart}
              disabled={!goal.trim()}
              className="text-sm font-medium rounded-xl px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white transition-colors"
            >
              Run Auto Mode
            </button>
          </div>
        </div>
      )}

      {/* Active run: feed */}
      {(isRunning || isInterrupted || isComplete || isError) && (
        <div className="space-y-3 flex-1 overflow-y-auto">
          {state.goalSummary && (
            <div className="text-xs text-gray-500 italic">"{state.goalSummary}"</div>
          )}

          <AutoRunFeed
            status={state.status}
            planSteps={state.planSteps}
            planApproved={state.planApproved}
            driftAmber={state.driftAmber}
            driftRed={state.driftRed}
            events={state.events}
            onApprovePlan={approvePlan}
          />

          {isInterrupted && state.interruptQuestion && (
            <AutoInterruptCard
              question={state.interruptQuestion}
              onAnswer={handleInterruptAnswer}
            />
          )}

          {isComplete && state.goalReport && (
            <AutoGoalReport report={state.goalReport} />
          )}

          {isError && state.error && (
            <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-900/20 p-3 text-xs text-red-700 dark:text-red-400">
              {state.error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {isRunning && (
              <button
                onClick={cancel}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            )}
            {(isComplete || isError) && (
              <button
                onClick={reset}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                New Goal
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
