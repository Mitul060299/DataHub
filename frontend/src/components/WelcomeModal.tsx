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

interface Slide {
  id: string;
  badge: string;
  title: string;
  body: string;
  features?: Array<{ icon: string; label: string; desc: string }>;
  tips?: Array<{ icon: string; text: string }>;
}

const SLIDES: Slide[] = [
  {
    id: "welcome",
    badge: "Welcome",
    title: "Your data workspace",
    body: "DataHub lets you upload any dataset, clean and transform it with plain-English AI commands, and export results — no SQL experience needed.",
    features: [
      { icon: "📊", label: "Data tab", desc: "Upload, preview and explore your raw dataset" },
      { icon: "🔀", label: "Pipeline tab", desc: "See every transformation as a visual graph" },
      { icon: "✨", label: "AI Agent", desc: "Plain-English commands → verified SQL, every time" },
    ],
  },
  {
    id: "data-tab",
    badge: "Step 1 · Data tab",
    title: "Upload & explore your data",
    body: "The Data tab is your main working area. Upload a CSV or connect a database, then browse rows and ask the AI to clean or query your data.",
    tips: [
      { icon: "📥", text: "Press Ctrl+I (⌘I on Mac) to import a file at any time" },
      { icon: "🔍", text: "Search datasets and saved artifacts in the left sidebar" },
      { icon: "✨", text: "Use the AI Agent on the right to clean, filter or transform rows" },
      { icon: "↩", text: "The amber banner shows a live preview — click Save to persist it" },
    ],
  },
  {
    id: "pipeline-tab",
    badge: "Step 2 · Pipeline tab",
    title: "Track every transformation",
    body: "Click the Pipeline tab (git-branch icon, second from left in the tab bar) to see a visual graph of every step you've applied.",
    tips: [
      { icon: "🔀", text: "Visual DAG shows your full transformation history at a glance" },
      { icon: "📋", text: "Applied steps panel on the right: run, undo, export or import steps" },
      { icon: "👁", text: "Click the eye icon on any step to preview that exact snapshot" },
      { icon: "▶", text: "Run Applied Steps replays your full pipeline on the freshest data" },
    ],
  },
];

const TOTAL_SLIDES = SLIDES.length + 1; // +1 for the sample-pick screen

export const WelcomeModal = ({ onClose, onUploadSample }: WelcomeModalProps) => {
  const [slide, setSlide] = useState(0);
  const [loading, setLoading] = useState<string | null>(null);
  const isStartScreen = slide === SLIDES.length;

  const handleUpload = (url: string, label: string) => {
    setLoading(url);
    capture("sample_file_selected", { file: label });
    onUploadSample(url);
  };

  const current = SLIDES[slide];

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

        {/* Progress dots */}
        <div className="welcome-modal__dots">
          {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
            <button
              key={i}
              className={`welcome-modal__dot${i === slide ? " welcome-modal__dot--active" : ""}`}
              onClick={() => setSlide(i)}
              aria-label={`Go to slide ${i + 1} of ${TOTAL_SLIDES}`}
            />
          ))}
        </div>

        {/* Content slides 0–2 */}
        {!isStartScreen && current && (
          <div className="welcome-modal__slide">
            <span className="welcome-modal__slide-badge">{current.badge}</span>
            <h2 className="welcome-modal__slide-title">{current.title}</h2>
            <p className="welcome-modal__slide-body">{current.body}</p>

            {current.features && (
              <div className="welcome-modal__features">
                {current.features.map((f) => (
                  <div key={f.label} className="welcome-modal__feature-card">
                    <span className="welcome-modal__feature-icon">{f.icon}</span>
                    <div>
                      <div className="welcome-modal__feature-label">{f.label}</div>
                      <div className="welcome-modal__feature-desc">{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {current.tips && (
              <ul className="welcome-modal__tips">
                {current.tips.map((t) => (
                  <li key={t.text} className="welcome-modal__tip">
                    <span className="welcome-modal__tip-icon">{t.icon}</span>
                    <span>{t.text}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="welcome-modal__nav">
              {slide > 0 && (
                <button className="btn" onClick={() => setSlide((s) => s - 1)} style={{ fontSize: 13, padding: "6px 16px" }}>
                  ← Back
                </button>
              )}
              <button
                className="btn"
                onClick={() => setSlide((s) => s + 1)}
                style={{ fontSize: 13, padding: "6px 16px", background: "var(--ac)", color: "#fff", borderColor: "var(--ac)", marginLeft: "auto" }}
              >
                {slide === SLIDES.length - 1 ? "Get started →" : "Next →"}
              </button>
            </div>
          </div>
        )}

        {/* Slide 3: sample-pick / start */}
        {isStartScreen && (
          <div className="welcome-modal__slide">
            <span className="welcome-modal__slide-badge">Get started</span>
            <h2 className="welcome-modal__slide-title">Pick a sample dataset</h2>
            <p className="welcome-modal__slide-body">Choose one to load instantly and follow the tour, or skip to upload your own file.</p>

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

            <div className="welcome-modal__nav" style={{ marginTop: 16 }}>
              <button className="btn" onClick={() => setSlide((s) => s - 1)} style={{ fontSize: 13, padding: "6px 16px" }}>
                ← Back
              </button>
              <button
                className="welcome-modal__skip"
                onClick={() => { capture("onboarding_modal_skipped"); onClose(); }}
              >
                Skip — I'll upload my own
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


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
