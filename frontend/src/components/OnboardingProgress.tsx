interface OnboardingProgressProps {
  hasUploadedFirstFile: boolean;
  hasCompletedOnboarding: boolean;
  hasAskedFirstQuestion?: boolean;
  firstAiAnswerAt?: string | null;
  hasPipelineStep?: boolean;
  hasExported?: boolean;
  onDismiss: () => void;
  onStartTour?: () => void;
}

const STEPS = [
  {
    id: "upload",
    label: "Load data",
    hint: "Drag & drop a CSV into the Data panel, or press Ctrl+I to import",
  },
  {
    id: "question",
    label: "Ask the AI",
    hint: 'Type a question in the AI panel on the right, e.g. "Show top 10 by spend"',
  },
  {
    id: "aha",
    label: "Get your first AI answer",
    hint: "The AI will write and run SQL on your data — review the result in the preview",
  },
  {
    id: "pipeline",
    label: "Approve a transform",
    hint: "Click the Pipeline tab, then Approve a pending step to save it",
  },
  {
    id: "export",
    label: "Export your result",
    hint: "Click Export (↑ icon) to download as CSV, Excel or send to Google Sheets",
  },
];

export const OnboardingProgress = ({
  hasUploadedFirstFile,
  hasCompletedOnboarding,
  hasAskedFirstQuestion,
  firstAiAnswerAt,
  hasPipelineStep,
  hasExported,
  onDismiss,
  onStartTour,
}: OnboardingProgressProps) => {
  if (hasCompletedOnboarding) return null;

  const stepDone = [
    hasUploadedFirstFile,
    hasAskedFirstQuestion ?? false,
    !!firstAiAnswerAt,
    hasPipelineStep ?? false,
    hasExported ?? false,
  ];

  const completedCount = stepDone.filter(Boolean).length;
  const pct = Math.round((completedCount / STEPS.length) * 100);

  return (
    <div className="onboarding-progress" role="complementary" aria-label="Getting started">
      <div className="onboarding-progress__header">
        <span className="onboarding-progress__title">Getting started</span>
        <button
          className="onboarding-progress__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss onboarding"
        >
          ×
        </button>
      </div>
      <div className="onboarding-progress__bar-track">
        <div
          className="onboarding-progress__bar-fill"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <ul className="onboarding-progress__steps">
        {STEPS.map((step, idx) => {
          const done = stepDone[idx];
          return (
            <li
              key={step.id}
              className={`onboarding-progress__step${done ? " onboarding-progress__step--done" : ""}`}
            >
              <span className="onboarding-progress__step-icon">{done ? "✓" : idx + 1}</span>
              <span className="onboarding-progress__step-text">
                <strong>{step.label}</strong>
                {!done && <span className="onboarding-progress__step-hint">{step.hint}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {onStartTour && (
        <button
          className="btn"
          style={{ marginTop: 8, width: "100%", fontSize: 12 }}
          onClick={onStartTour}
        >
          🗺 Take a tour
        </button>
      )}
    </div>
  );
};
