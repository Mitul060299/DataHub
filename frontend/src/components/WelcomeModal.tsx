import { useState } from "react";
import { capture } from "../lib/posthog";

interface WelcomeModalProps {
  onClose: () => void;
  onUploadSample: (url: string) => void;
}

const SAMPLE_FILES = [
  {
    label: "Customers",
    description: "30 rows · Customer signups, spend & region — great first dataset",
    url: "/samples/customers.csv",
    badge: "Quickstart",
  },
  {
    label: "Sales Data",
    description: "300 rows · Regional sales with product, revenue & deal stage",
    url: "/samples/sales_sample.csv",
  },
  {
    label: "Journal Entries",
    description: "500 rows · GL accounting data with debits, credits & accounts",
    url: "/samples/journal_entry_sample.csv",
  },
  {
    label: "Employee Records",
    description: "200 rows · HR data with salary, department & city",
    url: "/samples/employee_sample.csv",
  },
];

export const WelcomeModal = ({ onClose, onUploadSample }: WelcomeModalProps) => {
  const [loading, setLoading] = useState<string | null>(null);

  const handleUpload = async (url: string, label: string) => {
    setLoading(url);
    capture("sample_file_selected", { file: label });
    onUploadSample(url);
  };

  return (
    <div className="welcome-modal-overlay" onClick={onClose}>
      <div
        className="welcome-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to datahub.org.in"
      >
        <button className="welcome-modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="welcome-modal__header">
          <h2>Welcome to datahub.org.in 👋</h2>
          <p>From CSV to chart in under 60 seconds. Pick a sample to start, or upload your own file.</p>
        </div>

        <div className="welcome-modal__steps">
          <div className="welcome-modal__step">
            <span className="welcome-modal__step-number">1</span>
            <span>Pick a sample (or upload your own)</span>
          </div>
          <div className="welcome-modal__step">
            <span className="welcome-modal__step-number">2</span>
            <span>Ask a question in plain English</span>
          </div>
          <div className="welcome-modal__step">
            <span className="welcome-modal__step-number">3</span>
            <span>Get a chart, insight & export</span>
          </div>
        </div>

        <div className="welcome-modal__samples">
          <h3>Try a sample dataset</h3>
          <div className="welcome-modal__sample-grid">
            {SAMPLE_FILES.map((f) => (
              <button
                key={f.url}
                className="welcome-modal__sample-card"
                onClick={() => handleUpload(f.url, f.label)}
                disabled={loading !== null}
              >
                <span className="welcome-modal__sample-label">
                  {f.label}
                  {"badge" in f && f.badge ? (
                    <span className="welcome-modal__sample-badge">{f.badge}</span>
                  ) : null}
                </span>
                <span className="welcome-modal__sample-desc">{f.description}</span>
                {loading === f.url && <span className="welcome-modal__sample-loading">Loading…</span>}
              </button>
            ))}
          </div>
        </div>

        <button
          className="welcome-modal__skip"
          onClick={() => {
            capture("onboarding_modal_skipped");
            onClose();
          }}
        >
          Skip — I'll upload my own file
        </button>
      </div>
    </div>
  );
};
