import { type CSSProperties, type FormEvent, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconBrain,
  IconCheck,
  IconDatabase,
  IconFileText,
  IconGrid,
  IconMessageCircle,
  IconSend,
  IconShare,
  IconShield,
  IconTeam,
  IconUpload,
} from "../components/Icons";
import { useAuth } from "../contexts/AuthContext";
import { submitFeedbackForm, submitReview, getApprovedReviews, type ReviewOut } from "../api";
import "./HomePage.css";

const howSteps = [
  {
    step: "01",
    color: "#22c55e",
    icon: <IconUpload size={16} color="#22c55e" />,
    title: "Upload your data",
    description:
      "CSV, Excel, JSON, Parquet — or connect directly to PostgreSQL, Snowflake, BigQuery, or Redshift.",
  },
  {
    step: "02",
    color: "#818cf8",
    icon: <IconBrain size={16} color="#818cf8" />,
    title: "Ask in plain English",
    description:
      '"Remove duplicates", "join with customers", "show revenue by region as a bar chart" — the agent understands.',
  },
  {
    step: "03",
    color: "#eab308",
    icon: <IconCheck size={16} color="#eab308" />,
    title: "Review the plan",
    description:
      "The agent shows exactly what it will do before executing. Approve, edit, or ask it to try again.",
  },
  {
    step: "04",
    color: "#38bdf8",
    icon: <IconShare size={16} color="#38bdf8" />,
    title: "Share & publish",
    description:
      "Publish dashboards with one link. Every step recorded and replayable — full audit trail included.",
  },
];

const features = [
  {
    title: "AI Agent",
    color: "#818cf8",
    icon: <IconMessageCircle size={18} color="#818cf8" />,
    description:
      "Understands your intent, builds a plan, shows it to you, then executes. Retries automatically on failure.",
  },
  {
    title: "Recorded Pipelines",
    color: "#22c55e",
    icon: <IconFileText size={18} color="#22c55e" />,
    description:
      "Every transformation captured as a replayable step. Edit, re-run, or hand off — always transparent.",
  },
  {
    title: "Cross-Dataset Dashboards",
    color: "#38bdf8",
    icon: <IconGrid size={18} color="#38bdf8" />,
    description:
      "Build Power BI-style dashboards across multiple datasets. Publish with one click via a shareable public link.",
  },
  {
    title: "Any Data Source",
    color: "#f59e0b",
    icon: <IconDatabase size={18} color="#f59e0b" />,
    description:
      "CSV, Excel, JSON, Parquet. Direct connections to PostgreSQL, MySQL, Snowflake, BigQuery, Redshift.",
  },
  {
    title: "Team Collaboration",
    color: "#a78bfa",
    icon: <IconTeam size={18} color="#a78bfa" />,
    description:
      "Share workspaces, co-edit pipelines, assign roles. Version history shows who changed what and when.",
  },
  {
    title: "Audit & Governance",
    color: "#f87171",
    icon: <IconShield size={18} color="#f87171" />,
    description:
      "Full data lineage, approval workflows, audit logs. SOC2-ready controls for compliance-heavy industries.",
  },
];

type PricingPlan = {
  tier: string;
  color: string;
  price: string;
  period: string;
  features: string[];
  buttonLabel: string;
  buttonStyle: "ghost" | "blue" | "primary" | "amber" | "dark";
  action: "trial" | "contact";
  popular?: boolean;
};

const plans: PricingPlan[] = [
  {
    tier: "Free",
    color: "#71717a",
    price: "₹0",
    period: "forever · 1 user",
    features: ["50 AI messages/month", "100 MB storage", "CSV & Excel only", "2 projects"],
    buttonLabel: "Get started",
    buttonStyle: "ghost",
    action: "trial",
  },
  {
    tier: "Professional",
    color: "#3b82f6",
    price: "₹3,299",
    period: "/user/month",
    features: ["500 AI messages/month", "10 GB storage", "All file formats", "4 DB connections"],
    buttonLabel: "Start free trial",
    buttonStyle: "blue",
    action: "trial",
  },
  {
    tier: "Team",
    color: "#5B6AF0",
    price: "₹6,199",
    period: "/user/month",
    features: ["Unlimited AI messages", "100 GB shared pool", "Snowflake + BigQuery", "Team collaboration"],
    buttonLabel: "Start free trial",
    buttonStyle: "primary",
    action: "trial",
    popular: true,
  },
  {
    tier: "Business",
    color: "#eab308",
    price: "₹8,299",
    period: "/user/month",
    features: ["SSO / SAML", "Data lineage tracking", "Advanced RBAC", "500 GB storage"],
    buttonLabel: "Start free trial",
    buttonStyle: "amber",
    action: "trial",
  },
  {
    tier: "Enterprise",
    color: "#ef4444",
    price: "Custom",
    period: "contact us",
    features: ["On-premise deploy", "White-label option", "24/7 dedicated support", "Custom SLA"],
    buttonLabel: "Contact sales",
    buttonStyle: "dark",
    action: "contact",
  },
];

const feedbackTags = ["Feature requests", "Bug reports", "Integration ideas", "General feedback"];

export function HomePage() {
  const navigate = useNavigate();
  const { session } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successName, setSuccessName] = useState<string | null>(null);

  // Reviews state
  const [approvedReviews, setApprovedReviews] = useState<ReviewOut[]>([]);
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerRole, setReviewerRole] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    getApprovedReviews()
      .then(setApprovedReviews)
      .catch(() => {});
  }, []);

  const handleGetStarted = () => {
    navigate(session ? "/workspace" : "/signup");
  };

  const handleScrollHow = () => {
    const section = document.getElementById("how");
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handlePlanCta = (action: "trial" | "contact") => {
    if (action === "contact") {
      window.location.href = "mailto:hello@datahub.org.in";
      return;
    }
    navigate(session ? "/workspace" : "/signup");
  };

  const handleFeedbackSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);
    setRequestError(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();

    if (!trimmedName || !trimmedEmail || !trimmedMessage) {
      setValidationError("Please enter your name, email, and message.");
      return;
    }

    setIsSubmitting(true);
    try {
      await submitFeedbackForm({
        name: trimmedName,
        email: trimmedEmail,
        subject: subject.trim(),
        message: trimmedMessage,
      });
      setSuccessName(trimmedName);
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch {
      setRequestError("Something went wrong. Email us directly at hello@datahub.org.in");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReviewSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setReviewError(null);
    const trimmedName = reviewerName.trim();
    const trimmedBody = reviewBody.trim();
    if (!trimmedName || !trimmedBody) {
      setReviewError("Please enter your name and review.");
      return;
    }
    setReviewSubmitting(true);
    try {
      await submitReview({
        name: trimmedName,
        role: reviewerRole.trim() || undefined,
        rating: reviewRating,
        body: trimmedBody,
      });
      setReviewSuccess(true);
      setReviewerName("");
      setReviewerRole("");
      setReviewRating(5);
      setReviewBody("");
    } catch {
      setReviewError("Something went wrong. Please try again.");
    } finally {
      setReviewSubmitting(false);
    }
  };

  return (
    <main className="app-page home-page">
      <section className="home-section home-hero-section">
        <div className="home-hero-overlay" />
        <div className="home-inner home-hero-grid">
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                background: "rgba(91,106,240,0.1)",
                border: "1px solid rgba(91,106,240,0.25)",
                borderRadius: "20px",
                padding: "4px 12px 4px 8px",
                fontSize: "11px",
                fontWeight: 600,
                color: "#818cf8",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                marginBottom: "22px",
              }}
            >
              🚀
              Now Live — Help us improve
            </div>

            <h1 className="hero-title">
              Your data,
              <br />
              <span className="hero-title-gradient">understood</span>
              <br />
              by AI
            </h1>

            <p className="hero-subtitle">
              Talk to your data in plain English. DataHub&apos;s AI agent cleans, transforms, and visualises — recording every
              step so your work is always auditable, repeatable, and shareable.
            </p>

            <div className="hero-actions">
              <button type="button" className="hero-primary-btn" onClick={handleGetStarted}>
                ▶ Get started free
              </button>
              <button type="button" className="hero-ghost-btn" onClick={handleScrollHow}>
                See how it works ↓
              </button>
            </div>
          </div>

          <div className="hero-window-wrap">
            <div
              style={{
                background: "#111115",
                border: "1px solid #2e2e3a",
                borderRadius: "14px",
                overflow: "hidden",
                boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
              }}
            >
              <div
                style={{
                  height: "36px",
                  background: "#18181e",
                  borderBottom: "1px solid #22222a",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 14px",
                  gap: "6px",
                }}
              >
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
                <span
                  style={{
                    flex: 1,
                    textAlign: "center",
                    fontSize: "11px",
                    color: "#44445a",
                    fontFamily: "'Geist Mono', monospace",
                  }}
                >
                  datahub.org.in — workspace
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", height: "260px" }}>
                <div
                  style={{
                    background: "#0d0d11",
                    borderRight: "1px solid #22222a",
                    padding: "10px 0",
                    fontSize: "11px",
                  }}
                >
                  <div style={{ padding: "8px 12px 3px", fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#44445a" }}>DATA</div>
                  <div style={{ padding: "5px 12px", color: "#818cf8", background: "rgba(91,106,240,0.1)", display: "flex", alignItems: "center", gap: "5px" }}>
                    <span style={{ fontSize: "9px", opacity: 0.5 }}>⊞</span> sales_q4.csv
                  </div>
                  <div style={{ padding: "5px 12px", color: "#44445a", display: "flex", alignItems: "center", gap: "5px" }}>
                    <span style={{ fontSize: "9px" }}>⊞</span> customers.csv
                  </div>
                  <div style={{ padding: "8px 12px 3px", fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#44445a", marginTop: "4px" }}>PIPELINE</div>
                  <div style={{ padding: "5px 12px", color: "#5B6AF0", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "8px", color: "#44445a" }}>①</span> Source
                  </div>
                  <div style={{ padding: "5px 12px", color: "#818cf8", background: "rgba(91,106,240,0.12)", borderLeft: "2px solid #5B6AF0", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "8px" }}>②</span> Deduplicate
                    <span style={{ marginLeft: "auto", fontSize: "8px", color: "#5B6AF0", animation: "blink 1.5s infinite" }}>●</span>
                  </div>
                  <div style={{ padding: "5px 12px", color: "#44445a", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "8px" }}>③</span> Group by region
                  </div>
                  <div style={{ padding: "5px 12px", color: "#2e2e3a", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "8px" }}>④</span> Export
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", height: "100%" }}>
                  {/* Chat header */}
                  <div style={{ height: "32px", background: "#18181e", borderBottom: "1px solid #22222a", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", flexShrink: 0 }}>
                    <span style={{ fontSize: "10px", fontWeight: 600, color: "#818cf8", display: "flex", alignItems: "center", gap: "5px" }}>
                      <span style={{ color: "#5B6AF0" }}>✦</span> AI Agent
                    </span>
                    <span style={{ fontSize: "11px", color: "#44445a", cursor: "default" }}>×</span>
                  </div>

                  {/* Messages */}
                  <div style={{ flex: 1, padding: "10px", display: "flex", flexDirection: "column", gap: "8px", overflow: "hidden" }}>
                    {/* User message */}
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <div style={{ maxWidth: "80%", background: "rgba(91,106,240,0.18)", border: "1px solid rgba(91,106,240,0.25)", borderRadius: "10px 10px 2px 10px", padding: "6px 9px", fontSize: "10px", color: "#c7c7e8", lineHeight: 1.45 }}>
                        Remove duplicates from sales_q4.csv
                      </div>
                    </div>

                    {/* AI response */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                      <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(91,106,240,0.2)", border: "1px solid rgba(91,106,240,0.35)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "8px", color: "#818cf8", fontWeight: 700 }}>AI</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ background: "#0d0d11", border: "1px solid #22222a", borderRadius: "2px 10px 10px 10px", padding: "6px 9px", fontSize: "10px", color: "#a0a0bc", lineHeight: 1.5 }}>
                          Found <span style={{ color: "#f87171", fontWeight: 600 }}>3 duplicates</span> in 847 rows. Removed — <span style={{ color: "#34d399", fontWeight: 600 }}>844 rows</span> remain.{" "}
                          Fill the null in <span style={{ color: "#818cf8" }}>Revenue</span> with the regional average?
                        </div>
                        {/* Action chips */}
                        <div style={{ display: "flex", gap: "5px", marginTop: "5px" }}>
                          <div style={{ padding: "3px 8px", background: "rgba(91,106,240,0.2)", border: "1px solid rgba(91,106,240,0.4)", borderRadius: "4px", fontSize: "9px", color: "#818cf8", fontWeight: 600, cursor: "default" }}>Yes, fill nulls</div>
                          <div style={{ padding: "3px 8px", background: "transparent", border: "1px solid #2e2e3a", borderRadius: "4px", fontSize: "9px", color: "#44445a", cursor: "default" }}>Skip</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Input bar */}
                  <div style={{ height: "34px", background: "#18181e", borderTop: "1px solid #22222a", display: "flex", alignItems: "center", padding: "0 10px", gap: "6px", flexShrink: 0 }}>
                    <span style={{ flex: 1, fontSize: "10px", color: "#2e2e3a", fontStyle: "italic" }}>Ask anything about your data…</span>
                    <div style={{ width: 20, height: 20, borderRadius: "4px", background: "rgba(91,106,240,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: "#818cf8" }}>↑</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="hero-status-badge hero-status-cleaned">
              <span className="hero-badge-dot hero-badge-dot-green" />
              847 rows cleaned
            </div>
            <div className="hero-status-badge hero-status-recorded">
              <span className="hero-badge-dot hero-badge-dot-indigo" />
              3 steps recorded · replayable
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="home-section">
        <div className="home-inner">
          <p className="section-label">How it works</p>
          <h2 className="section-title">From messy data to decisions in four steps</h2>
          <p className="section-subtitle">
            No SQL. No Python. No BI team needed. Just describe what you want — the agent handles the rest, with a full audit trail.
          </p>

          <div className="how-grid">
            {howSteps.map((step) => (
              <article key={step.step} className="how-card">
                <p className="how-step">{step.step}</p>
                <div className="how-icon-wrap" style={{ background: `${step.color}1A` }}>
                  {step.icon}
                </div>
                <h3 className="how-title">{step.title}</h3>
                <p className="how-description">{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="home-inner">
          <p className="section-label">Features</p>
          <h2 className="section-title">Everything your data team needs</h2>
          <p className="section-subtitle">
            Built for analysts who want the power of a data engineer without writing a single line of code.
          </p>

          <div className="features-grid">
            {features.map((feature) => (
              <article key={feature.title} className="feature-card" style={{ "--feature-color": feature.color } as CSSProperties}>
                <div className="feature-icon-wrap" style={{ background: `${feature.color}1A` }}>
                  {feature.icon}
                </div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-description">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="home-section">
        <div className="home-inner">
          <p className="section-label">Pricing</p>
          <h2 className="section-title">Start free, scale when ready</h2>
          <p className="section-subtitle">No credit card required. Upgrade when your team needs more.</p>

          <div className="pricing-grid">
            {plans.map((plan) => {
              const buttonClass = [
                "pricing-button",
                plan.buttonStyle === "primary"
                  ? "pricing-button-primary"
                  : plan.buttonStyle === "blue"
                    ? "pricing-button-blue"
                    : plan.buttonStyle === "amber"
                      ? "pricing-button-amber"
                      : plan.buttonStyle === "dark"
                        ? "pricing-button-dark"
                        : "pricing-button-ghost",
              ].join(" ");

              return (
                <article
                  key={plan.tier}
                  className={`pricing-card ${plan.tier === "Team" ? "pricing-card-team" : ""}`}
                  style={{ "--plan-color": plan.color } as CSSProperties}
                >
                  {plan.popular ? <span className="pricing-popular">Popular</span> : null}
                  <p className="pricing-tier">{plan.tier}</p>
                  <p className="pricing-price">{plan.price}</p>
                  <p className="pricing-period">{plan.period}</p>

                  <ul className="pricing-features">
                    {plan.features.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>

                  {plan.action === "contact" ? (
                    <a className={buttonClass} href="mailto:hello@datahub.org.in">
                      {plan.buttonLabel}
                    </a>
                  ) : (
                    <button type="button" className={buttonClass} onClick={() => handlePlanCta("trial")}>
                      {plan.buttonLabel}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Reviews ─────────────────────────────────────────────────────── */}
      <section className="home-section" id="reviews">
        <div className="home-inner">
          <div className="reviews-layout">
            {/* Left — display cards */}
            <div>
              <p className="section-label">User reviews</p>
              <h2 className="reviews-heading">What our users say</h2>
              <p className="reviews-subheading">
                Real feedback from teams using DataHub every day.
              </p>
              {approvedReviews.length === 0 ? (
                <p className="reviews-empty">No reviews yet — be the first!</p>
              ) : (
                <div className="reviews-cards">
                  {approvedReviews.map((r) => (
                    <div key={r.id} className="review-card">
                      <div className="review-stars">
                        {Array.from({ length: 5 }, (_, i) => (
                          <span key={i} className={i < r.rating ? "star-filled" : "star-empty"}>★</span>
                        ))}
                      </div>
                      <p className="review-body">&ldquo;{r.body}&rdquo;</p>
                      <p className="review-author">
                        <strong>{r.name}</strong>
                        {r.role ? <span className="review-role"> · {r.role}</span> : null}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right — submit form */}
            <div className="review-form-wrap">
              <h3 className="review-form-title">Leave a review</h3>
              <p className="review-form-sub">Your review is published after a quick check.</p>
              {reviewSuccess ? (
                <div className="feedback-success">Thanks! Your review will appear once approved. 🙏</div>
              ) : (
                <form className="feedback-form" onSubmit={(e) => void handleReviewSubmit(e)}>
                  <div className="feedback-row-two">
                    <input
                      className="feedback-input"
                      placeholder="Your name"
                      value={reviewerName}
                      onChange={(e) => setReviewerName(e.target.value)}
                    />
                    <input
                      className="feedback-input"
                      placeholder="Role / Company (optional)"
                      value={reviewerRole}
                      onChange={(e) => setReviewerRole(e.target.value)}
                    />
                  </div>
                  <div className="review-star-picker">
                    <span className="review-star-label">Rating</span>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`review-star-btn${s <= reviewRating ? " review-star-active" : ""}`}
                        onClick={() => setReviewRating(s)}
                        aria-label={`${s} star`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="feedback-textarea"
                    placeholder="Share your experience with DataHub..."
                    value={reviewBody}
                    onChange={(e) => setReviewBody(e.target.value)}
                  />
                  {reviewError ? <p className="feedback-error">{reviewError}</p> : null}
                  <button type="submit" className="feedback-submit" disabled={reviewSubmitting}>
                    <IconSend size={14} />
                    {reviewSubmitting ? "Submitting..." : "Submit review"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="home-inner">
          <div className="feedback-card">
            <div>
              <p className="section-label">We&apos;re listening</p>
              <h2 className="feedback-title">Help us build the right thing</h2>
              <p className="feedback-body">
                DataHub is actively in development. Your feedback directly shapes what we build next — whether it&apos;s a missing feature,
                a confusing flow, or something you&apos;d love to see.
              </p>

              <div className="feedback-tag-list">
                {feedbackTags.map((tag) => (
                  <span key={tag} className="feedback-tag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div>
              {successName ? (
                <div className="feedback-success">Thanks {successName} — we&apos;ll read every word. 🙏</div>
              ) : (
                <form className="feedback-form" onSubmit={(event) => void handleFeedbackSubmit(event)}>
                  <div className="feedback-row-two">
                    <input
                      className="feedback-input"
                      placeholder="Name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                    <input
                      className="feedback-input"
                      placeholder="Email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>

                  <input
                    className="feedback-input"
                    placeholder="Subject — e.g. 'Feature request: Notion connector'"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                  />

                  <textarea
                    className="feedback-textarea"
                    placeholder="Tell us what's on your mind — the more detail the better..."
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                  />

                  {validationError ? <p className="feedback-error">{validationError}</p> : null}
                  {requestError ? <p className="feedback-error">{requestError}</p> : null}

                  <button type="submit" className="feedback-submit" disabled={isSubmitting}>
                    <IconSend size={14} />
                    {isSubmitting ? "Sending..." : "Send feedback"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
