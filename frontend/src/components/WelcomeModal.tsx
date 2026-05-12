import { capture } from "../lib/posthog";

interface WelcomeModalProps {
  onClose: () => void;
  onUploadSample: (url: string) => void;
}

// Customers sample suggestions (matches the auto-loaded sample schema)
const SAMPLE_PROMPTS = [
  { label: "Top customers by spend", prompt: "Show top 10 customers by spend" },
  { label: "Signups by region", prompt: "Group by region and count signups" },
  { label: "Find duplicates", prompt: "Find duplicate rows" },
];

export const WelcomeModal = ({ onClose, onUploadSample }: WelcomeModalProps) => {
  const handlePromptClick = (prompt: string) => {
    capture("welcome_modal_prompt_clicked", { prompt });
    // Load Customers sample, then close — WorkspaceHomePage auto-loaded it already
    // for brand-new users, so onUploadSample is a no-op safe to call again.
    onUploadSample("/samples/customers.csv");
    onClose();
  };

  return (
    <div className="welcome-modal-overlay" onClick={onClose}>
      <div
        className="welcome-modal welcome-modal--v2"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to DataHub"
      >
        <button className="welcome-modal__close" onClick={onClose} aria-label="Close">×</button>

        <div className="welcome-modal__slide">
          <span className="welcome-modal__slide-badge">✨ AI-powered</span>
          <h2 className="welcome-modal__slide-title">Ask your data a question</h2>
          <p className="welcome-modal__slide-body" style={{ marginBottom: 16 }}>
            We've loaded a sample dataset. Pick a question below or type your own in the AI chat on the right.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {SAMPLE_PROMPTS.map(({ label, prompt }) => (
              <button
                key={prompt}
                className="welcome-modal__sample-card"
                style={{ textAlign: "left" }}
                onClick={() => handlePromptClick(prompt)}
              >
                <span className="welcome-modal__sample-label">💬 {label}</span>
                <span className="welcome-modal__sample-desc" style={{ fontStyle: "italic" }}>
                  "{prompt}"
                </span>
              </button>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              className="welcome-modal__skip"
              onClick={() => {
                capture("welcome_modal_upload_own");
                onClose();
              }}
            >
              I'll upload my own data →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
