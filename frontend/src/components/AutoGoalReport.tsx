/**
 * AutoGoalReport.tsx
 * Renders the final GoalReport summary card after an auto run completes.
 */
import type { GoalReport } from "../hooks/useAutoRunSession";

interface Props {
  report: GoalReport;
}

export function AutoGoalReport({ report }: Props) {
  const pct = report.total_rules > 0
    ? Math.round((report.rules_satisfied / report.total_rules) * 100)
    : 0;

  const color =
    pct === 100 ? "text-green-600 dark:text-green-400" :
    pct >= 80  ? "text-yellow-600 dark:text-yellow-400" :
    "text-red-600 dark:text-red-400";

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3 bg-white dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">Goal Report</span>
        <span className={`text-lg font-bold ${color}`}>{pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct === 100 ? "bg-green-500" : pct >= 80 ? "bg-yellow-500" : "bg-red-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-2">
          <div className="font-semibold text-green-700 dark:text-green-400 text-base">{report.rules_satisfied}</div>
          <div className="text-gray-500">Satisfied</div>
        </div>
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-2">
          <div className="font-semibold text-red-700 dark:text-red-400 text-base">{report.rules_failed}</div>
          <div className="text-gray-500">Failed</div>
        </div>
        <div className="rounded-lg bg-gray-50 dark:bg-gray-700/40 p-2">
          <div className="font-semibold text-gray-600 dark:text-gray-300 text-base">{report.rules_skipped}</div>
          <div className="text-gray-500">Skipped</div>
        </div>
      </div>

      <div className="text-xs text-gray-500 text-right">
        Completed in {report.duration_seconds.toFixed(1)}s
      </div>
    </div>
  );
}
