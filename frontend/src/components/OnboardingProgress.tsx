interface OnboardingProgressProps {
  hasUploadedFirstFile: boolean;
  hasCompletedOnboarding: boolean;
  hasAskedFirstQuestion?: boolean;
  onDismiss: () => void;
  onStartTour?: () => void;
}

const STEPS = [
  {
    id: "upload",
    label: "Upload your first file",
    hint: "Drag & drop a CSV/Excel into the Data panel, or press Ctrl+I to import",
  },
  {
    id: "question",
    label: "Ask your first question",
    hint: "Type in the AI Agent on the right, e.g. \"remove duplicates\" or \"show top 10 rows by revenue\"",
  },
  {
    id: "complete",
    label: "Explore the Pipeline tab",
    hint: "Click the git-branch icon tab to see your transformation history, then export when ready",
  },
];

export const OnboardingProgress = ({
  hasUploadedFirstFile,
  hasCompletedOnboarding,
  hasAskedFirstQuestion,
  onDismiss,
  onStartTour,
}: OnboardingProgressProps) => {
  if (hasCompletedOnboarding) return null;

  const completedCount =
    (hasUploadedFirstFile ? 1 : 0) +
    (hasAskedFirstQuestion ? 1 : 0) +
    (hasCompletedOnboarding ? 1 : 0);

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
          const done =
            idx === 0 ? hasUploadedFirstFile :
            idx === 1 ? (hasAskedFirstQuestion ?? false) :
            hasCompletedOnboarding;
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
