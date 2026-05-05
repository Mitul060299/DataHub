/**
 * AutoRunFeed.tsx
 * Live feed of auto run events + step list.
 */
import type { AutoRunEvent, AutoRunStep } from "../hooks/useAutoRunSession";

interface Props {
  status: string;
  planSteps: AutoRunStep[];
  planApproved: boolean;
  driftAmber: number;
  driftRed: number;
  events: AutoRunEvent[];
  onApprovePlan: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  running: "Running",
  interrupted: "Waiting for your input",
  complete: "Complete",
  error: "Error",
  idle: "Ready",
};

export function AutoRunFeed({ status, planSteps, planApproved, driftAmber, driftRed, events, onApprovePlan }: Props) {
  const lastEvents = events.slice(-10);

  return (
    <div className="space-y-3">
      {/* Status badge */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
            status === "complete"    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
            status === "error"      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
            status === "interrupted"? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
            "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
          }`}
        >
          {status === "running" && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          )}
          {STATUS_LABELS[status] ?? status}
        </span>

        {(driftAmber > 0 || driftRed > 0) && (
          <span className="text-xs text-gray-500">
            Drift: {driftAmber > 0 && <span className="text-yellow-600">{driftAmber} amber</span>}
            {driftAmber > 0 && driftRed > 0 && " · "}
            {driftRed > 0 && <span className="text-red-600">{driftRed} red</span>}
          </span>
        )}
      </div>

      {/* Plan review */}
      {planSteps.length > 0 && !planApproved && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 p-3 space-y-2">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
            Review Plan ({planSteps.length} steps)
          </p>
          <ol className="space-y-1.5">
            {planSteps.map((step) => (
              <li key={step.step_number} className="text-xs flex gap-2">
                <span className="text-gray-400 font-mono w-4 shrink-0">{step.step_number}.</span>
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-200">{step.operation}</span>
                  <span className="text-gray-500 ml-1">— {step.description}</span>
                </div>
              </li>
            ))}
          </ol>
          <button
            onClick={onApprovePlan}
            className="w-full mt-1 text-xs font-medium rounded-lg px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            Approve & Execute
          </button>
        </div>
      )}

      {/* Event log */}
      {lastEvents.length > 0 && (
        <div className="rounded-lg border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 text-xs">
          {lastEvents.map((ev, i) => (
            <div key={i} className="px-3 py-1.5 flex gap-2 items-start">
              <span className="text-gray-400 font-mono shrink-0">{ev.type.replace("auto.", "")}</span>
              {ev.data.goal_summary && (
                <span className="text-gray-600 dark:text-gray-300 truncate">{ev.data.goal_summary as string}</span>
              )}
              {ev.data.passed !== undefined && (
                <span className={ev.data.passed ? "text-green-600" : "text-red-600"}>
                  {ev.data.passed ? "✓" : "✗"} rule {ev.data.rule_id as string}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
