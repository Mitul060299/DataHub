import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { capture } from "../lib/posthog";

interface OnboardingProgressProps {
  hasUploadedFirstFile: boolean;
  hasCompletedOnboarding: boolean;
  hasAskedFirstQuestion?: boolean;
  firstAiAnswerAt?: string | null;
  hasPipelineStep?: boolean;
  hasExported?: boolean;
  /** When true: non-dismissible, shows persistent "Sign up free" CTA, and
   *  celebrates each step completion inline. */
  isAnonymous?: boolean;
  /** undefined = non-dismissible (anon). Provide a callback for signed-in users. */
  onDismiss?: () => void;
  onStartTour?: () => void;
}

const STEPS = [
  {
    id: "upload",
    label: "Load data",
    hint: "↑ Data panel → Import CSV (or Ctrl+I)",
    anonHint: "Your sample CSV is loaded above ↑ — click on it to select it",
    celebrate: "🎉 Data loaded!",
  },
  {
    id: "question",
    label: "Ask the AI",
    hint: 'AI panel (right) → type e.g. "Show top 10 by spend"',
    anonHint: 'Type in the AI panel on the right →  e.g. "Show top 10 by spend"',
    celebrate: "🤖 Question sent!",
  },
  {
    id: "aha",
    label: "Get your first AI answer",
    hint: "The AI writes SQL and shows a live preview",
    anonHint: "The AI is writing SQL for you — review the result below",
    celebrate: "✨ First AI insight!",
  },
  {
    id: "pipeline",
    label: "Approve a transform",
    hint: "Pipeline tab → Approve a pending step",
    anonHint: 'Click "Approve" on the AI suggestion to save it to your pipeline',
    celebrate: "✅ Pipeline step saved!",
  },
  {
    id: "export",
    label: "Export your result",
    hint: "↑ icon → CSV, Excel or Google Sheets",
    anonHint: 'Click the ↑ Export icon to download your result as CSV or Excel',
    celebrate: "📥 Result exported!",
  },
];

export const OnboardingProgress = ({
  hasUploadedFirstFile,
  hasCompletedOnboarding,
  hasAskedFirstQuestion,
  firstAiAnswerAt,
  hasPipelineStep,
  hasExported,
  isAnonymous = false,
  onDismiss,
  onStartTour,
}: OnboardingProgressProps) => {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const prevDoneRef = useRef<boolean[]>([]);

  const stepDone = [
    hasUploadedFirstFile,
    hasAskedFirstQuestion ?? false,
    !!firstAiAnswerAt,
    hasPipelineStep ?? false,
    hasExported ?? false,
  ];

  const completedCount = stepDone.filter(Boolean).length;
  const pct = Math.round((completedCount / STEPS.length) * 100);

  // Detect newly completed steps and flash a brief "celebrate" animation.
  const [celebratingIdx, setCelebratingIdx] = useState<number | null>(null);
  useEffect(() => {
    const prev = prevDoneRef.current;
    if (prev.length === 0) {
      prevDoneRef.current = [...stepDone];
      return;
    }
    for (let i = 0; i < stepDone.length; i++) {
      if (!prev[i] && stepDone[i]) {
        setCelebratingIdx(i);
        setCollapsed(false); // pop open when a step is completed
        const t = setTimeout(() => setCelebratingIdx(null), 1800);
        prevDoneRef.current = [...stepDone];
        return () => clearTimeout(t);
      }
    }
    prevDoneRef.current = [...stepDone];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepDone.join(",")]);

  if (hasCompletedOnboarding && !isAnonymous) return null;

  // For signed-in users who finished onboarding, hide entirely.
  if (hasCompletedOnboarding && !isAnonymous) return null;

  const allDone = completedCount === STEPS.length;

  return (
    <>
      <style>{`
        @keyframes dh-step-pop {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.18); }
          70%  { transform: scale(0.95); }
          100% { transform: scale(1); }
        }
        .dh-op-step-celebrating .onboarding-progress__step-icon {
          animation: dh-step-pop 0.55s ease;
          color: #6ee7b7;
        }
      `}</style>
      <div
        className="onboarding-progress"
        role="complementary"
        aria-label={isAnonymous ? "Demo progress" : "Getting started"}
        style={isAnonymous ? { border: "1px solid rgba(99,102,241,0.4)", boxShadow: "0 4px 24px rgba(99,102,241,0.15)" } : undefined}
      >
        <div className="onboarding-progress__header">
          <span className="onboarding-progress__title" style={isAnonymous ? { color: "#c7d2fe" } : undefined}>
            {isAnonymous ? `Demo progress — ${completedCount}/${STEPS.length}` : "Getting started"}
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            {isAnonymous ? (
              // Anon: offer collapse (−/+) but no full dismiss
              <button
                className="onboarding-progress__dismiss"
                onClick={() => setCollapsed((c) => !c)}
                aria-label={collapsed ? "Expand" : "Collapse"}
                title={collapsed ? "Expand" : "Collapse"}
              >
                {collapsed ? "+" : "−"}
              </button>
            ) : (
              onDismiss && (
                <button
                  className="onboarding-progress__dismiss"
                  onClick={onDismiss}
                  aria-label="Dismiss onboarding"
                >
                  ×
                </button>
              )
            )}
          </div>
        </div>

        <div className="onboarding-progress__bar-track">
          <div
            className="onboarding-progress__bar-fill"
            style={{
              width: `${pct}%`,
              background: isAnonymous
                ? "linear-gradient(90deg,#6366f1,#8b5cf6)"
                : undefined,
              transition: "width 0.5s ease",
            }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>

        {!collapsed && (
          <>
            <ul className="onboarding-progress__steps">
              {STEPS.map((step, idx) => {
                const done = stepDone[idx];
                const celebrating = celebratingIdx === idx;
                return (
                  <li
                    key={step.id}
                    className={[
                      "onboarding-progress__step",
                      done ? "onboarding-progress__step--done" : "",
                      celebrating ? "dh-op-step-celebrating" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    <span className="onboarding-progress__step-icon">
                      {celebrating ? "🎉" : done ? "✓" : idx + 1}
                    </span>
                    <span className="onboarding-progress__step-text">
                      <strong>{celebrating ? step.celebrate : step.label}</strong>
                      {!done && !celebrating && (
                        <span className="onboarding-progress__step-hint">
                          {isAnonymous ? step.anonHint : step.hint}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>

            {/* Sign-up CTA — always visible for anon, more urgent when steps done */}
            {isAnonymous && (
              <button
                type="button"
                onClick={() => {
                  capture("onboarding_progress_signup_cta_clicked", { steps_done: completedCount });
                  navigate("/signup");
                }}
                style={{
                  marginTop: 10,
                  width: "100%",
                  padding: "8px 0",
                  borderRadius: 8,
                  border: "none",
                  background: allDone
                    ? "linear-gradient(135deg,#10b981,#059669)"
                    : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "opacity 0.2s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.88"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
              >
                {allDone ? "🎉 Save your work — Sign up free →" : "Sign up free to save your work →"}
              </button>
            )}

            {onStartTour && !isAnonymous && (
              <button
                className="btn"
                style={{ marginTop: 8, width: "100%", fontSize: 12 }}
                onClick={onStartTour}
              >
                🗺 Take a tour
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
};
