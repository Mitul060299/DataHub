/**
 * AutoInterruptCard.tsx
 * Renders a pending interrupt question and collects the user's answer.
 */
import { useState } from "react";
import type { InterruptQuestion } from "../hooks/useAutoRunSession";

interface Props {
  question: InterruptQuestion;
  onAnswer: (answer: string) => void;
}

export function AutoInterruptCard({ question, onAnswer }: Props) {
  const [selected, setSelected] = useState<string>("");
  const [freeform, setFreeform] = useState("");

  const handleSubmit = () => {
    const answer = selected || freeform.trim();
    if (!answer) return;
    onAnswer(answer);
  };

  return (
    <div className="border border-yellow-400 rounded-xl p-4 bg-yellow-50 dark:bg-yellow-900/20 space-y-3">
      <div className="flex items-start gap-2">
        <span className="text-yellow-500 text-lg">⚠</span>
        <p className="font-medium text-sm text-yellow-800 dark:text-yellow-200 leading-snug">
          {question.question}
        </p>
      </div>

      {question.sample_rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-yellow-200 dark:border-yellow-700">
          <table className="text-xs w-full">
            <thead>
              <tr className="bg-yellow-100 dark:bg-yellow-800/40">
                {Object.keys(question.sample_rows[0]).slice(0, 5).map((col) => (
                  <th key={col} className="px-2 py-1 text-left font-medium">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {question.sample_rows.slice(0, 5).map((row, i) => (
                <tr key={i} className="border-t border-yellow-100 dark:border-yellow-700/40">
                  {Object.keys(row).slice(0, 5).map((col) => (
                    <td key={col} className="px-2 py-1">{String(row[col] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-1.5">
        {question.options.map((opt) => (
          <button
            key={opt.option_id}
            onClick={() => { setSelected(opt.label); setFreeform(""); }}
            className={`w-full text-left text-sm rounded-lg border px-3 py-2 transition-colors ${
              selected === opt.label
                ? "border-yellow-500 bg-yellow-100 dark:bg-yellow-800/40"
                : "border-gray-200 dark:border-gray-700 hover:border-yellow-400"
            }`}
          >
            <span className="font-medium">{opt.label}</span>
            {opt.implication && (
              <span className="text-gray-500 dark:text-gray-400 ml-2 text-xs">— {opt.implication}</span>
            )}
          </button>
        ))}

        {question.allow_freeform && (
          <textarea
            className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 p-2 resize-none bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-yellow-400"
            rows={2}
            placeholder="Or type your own answer…"
            value={freeform}
            onChange={(e) => { setFreeform(e.target.value); setSelected(""); }}
          />
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!selected && !freeform.trim()}
        className="w-full text-sm font-medium rounded-lg px-3 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:opacity-40 text-white transition-colors"
      >
        Submit Answer
      </button>
    </div>
  );
}
