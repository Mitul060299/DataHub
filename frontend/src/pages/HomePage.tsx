import { type CSSProperties, type FormEvent, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  IconBrain,
  IconCheck,
  IconDatabase,
  IconFileText,
  IconGrid,
  IconMessageCircle,
  IconShare,
  IconShield,
  IconTeam,
  IconUpload,
} from "../components/Icons";
import { useAuth } from "../contexts/AuthContext";
import { submitFeedbackForm, submitReview, getApprovedReviews, type ReviewOut } from "../api";
import "./HomePage.css";

/* ===========================================================================
   STATIC CONTENT
   =========================================================================== */

const howSteps = [
  {
    step: "01",
    color: "#22c55e",
    icon: <IconUpload size={18} color="#22c55e" />,
    title: "Upload your data",
    description:
      "CSV, Excel, JSON, Parquet — or connect directly to PostgreSQL, Snowflake, BigQuery, or Redshift.",
  },
  {
    step: "02",
    color: "#a78bfa",
    icon: <IconBrain size={18} color="#a78bfa" />,
    title: "Ask in plain English",
    description:
      "“Remove duplicates”, “join with customers”, “show revenue by region as a bar chart” — the agent understands.",
  },
  {
    step: "03",
    color: "#facc15",
    icon: <IconCheck size={18} color="#facc15" />,
    title: "Review the plan",
    description:
      "The agent shows exactly what it will do before executing. Approve, edit, or ask it to try again.",
  },
  {
    step: "04",
    color: "#38bdf8",
    icon: <IconShare size={18} color="#38bdf8" />,
    title: "Share & publish",
    description:
      "Publish dashboards with one link. Every step recorded and replayable — full audit trail included.",
  },
];

const features = [
  {
    title: "AI Agent",
    color: "#a78bfa",
    icon: <IconMessageCircle size={20} color="#a78bfa" />,
    description:
      "Plain-English to SQL, with the plan shown before anything runs.",
  },
  {
    title: "Recorded Pipelines",
    color: "#22c55e",
    icon: <IconFileText size={20} color="#22c55e" />,
    description:
      "Every transformation captured as a replayable step. Edit, re-run, hand off.",
  },
  {
    title: "Cross-Dataset Dashboards",
    color: "#38bdf8",
    icon: <IconGrid size={20} color="#38bdf8" />,
    description:
      "Power BI-style dashboards across multiple datasets, shareable by link.",
  },
  {
    title: "Any Data Source",
    color: "#f59e0b",
    icon: <IconDatabase size={20} color="#f59e0b" />,
    description:
      "CSV, Excel, JSON, Parquet. Native connections to Postgres, Snowflake, BigQuery.",
  },
  {
    title: "Team Collaboration",
    color: "#ec4899",
    icon: <IconTeam size={20} color="#ec4899" />,
    description:
      "Shared workspaces, roles, and version history showing who changed what.",
  },
  {
    title: "Audit & Governance",
    color: "#f87171",
    icon: <IconShield size={20} color="#f87171" />,
    description:
      "Full lineage, approval workflows, audit logs — SOC2-ready foundations.",
  },
];

type PricingPlan = {
  tier: string;
  color: string;
  priceUSD: string;
  priceINR: string;
  periodUSD: string;
  periodINR: string;
  features: string[];
  buttonLabel: string;
  buttonStyle: "ghost" | "blue" | "primary" | "amber" | "dark";
  action: "trial" | "contact" | "waitlist" | "checkout";
};

const plans: PricingPlan[] = [
  {
    tier: "Free",
    color: "#71717a",
    priceUSD: "$0",
    priceINR: "\u20b90",
    periodUSD: "forever",
    periodINR: "forever",
    features: [
      "1 personal workspace",
      "2 projects per workspace",
      "100 AI messages/month",
      "50 MB file size",
      "500 MB storage",
      "5 GB data scan/month",
      "1 team member",
      "DB connections: CSV & Excel only",
      "Community support",
    ],
    buttonLabel: "Get started",
    buttonStyle: "ghost",
    action: "trial",
  },
  {
    tier: "Professional",
    color: "#3b82f6",
    priceUSD: "$149",
    priceINR: "\u20b96,999",
    periodUSD: "/month (Coming soon)",
    periodINR: "/month",
    features: [
      "1 personal workspace · 1 seat",
      "20 projects per workspace",
      "2,000 AI messages/month",
      "1 GB file size",
      "20 GB storage",
      "50 GB data scan/month",
      "DB connections: PostgreSQL, MySQL, SQLite, MSSQL, Oracle",
      "Email support",
    ],
    buttonLabel: "Start free trial",
    buttonStyle: "blue",
    action: "checkout",
  },
  {
    tier: "Team",
    color: "#7c3aed",
    priceUSD: "$299",
    priceINR: "\u20b914,999",
    periodUSD: "/month (Coming soon)",
    periodINR: "/month",
    features: [
      "Includes 3 seats · +\u20b92,499/extra seat",
      "1 personal + 2 collab workspaces",
      "5,000+ AI messages (scales with seats)",
      "5 GB file size",
      "100 GB+ storage (scales with seats)",
      "200 GB+ data scan/month",
      "DB connections: + Snowflake, Redshift, BigQuery",
      "Audit log",
      "Priority email support",
    ],
    buttonLabel: "Join waitlist",
    buttonStyle: "primary",
    action: "waitlist",
  },
  {
    tier: "Business",
    color: "#eab308",
    priceUSD: "$599",
    priceINR: "\u20b929,999",
    periodUSD: "/month (Coming soon)",
    periodINR: "/month",
    features: [
      "Includes 5 seats · +\u20b93,999/extra seat",
      "1 personal + 9 collab workspaces",
      "Unlimited AI messages",
      "10 GB file size",
      "2 TB storage + unlimited scan",
      "DB connections: + Custom connectors",
      "Audit log",
      "SSO / SAML",
      "24/7 dedicated support",
    ],
    buttonLabel: "Join waitlist",
    buttonStyle: "amber",
    action: "waitlist",
  },
  {
    tier: "Enterprise",
    color: "#ef4444",
    priceUSD: "Custom",
    priceINR: "Custom",
    periodUSD: "contact us",
    periodINR: "contact us",
    features: [
      "Unlimited workspaces",
      "Unlimited everything",
      "Custom storage",
      "Unlimited team members",
      "Custom DB connections",
      "White-label option",
      "SSO / SAML",
      "Audit log",
      "Custom SLA",
      "On-premise deploy",
    ],
    buttonLabel: "Contact sales",
    buttonStyle: "dark",
    action: "contact",
  },
];

const myths = [
  {
    myth: "“It's a black box — I have no idea what it's doing to my data.”",
    reality:
      "Every action is a named step shown to you before it runs. You see the exact SQL or operation, then choose Approve, Edit, or Reject. Nothing executes without your go-ahead.",
  },
  {
    myth: "“The AI will hallucinate results or make up numbers.”",
    reality:
      "DataHub runs real, deterministic SQL on your actual data. The AI writes the query — your data produces the result. No generation, no guessing, no invented rows.",
  },
  {
    myth: "“I'll lose control of my pipeline once the AI builds it.”",
    reality:
      "Every transformation is saved as a labelled, replayable step. You can edit any step inline, delete it, or re-run from any point. The pipeline is yours — the AI is just the author.",
  },
  {
    myth: "“My sensitive data is being sent somewhere unsafe.”",
    reality:
      "Your data is stored in our encrypted, isolated cloud storage — never shared between accounts. We never use your data to train our AI. Full audit logs record every access, by whom, and when.",
  },
  {
    myth: "“It only works on clean, nicely formatted CSVs.”",
    reality:
      "DataHub was built specifically for the messy real world — auto-detects delimiters, fixes broken encodings, handles nulls, outliers, duplicates, type mismatches, and multi-sheet Excel out of the box.",
  },
];

const feedbackTags = ["Feature requests", "Bug reports", "Integration ideas", "General feedback"];

const DEMO_QUERIES = [
  "Remove duplicates and fill nulls with averages",
  "Show revenue by region as a bar chart",
  "Join with customers table on customer_id",
  "Flag rows where revenue exceeds the monthly average",
  "Export cleaned data to Google Sheets",
];

const SUPPORT_EMAIL = "mitul.srivastava000@gmail.com";

/* ===========================================================================
   COMPONENT
   =========================================================================== */

export function HomePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const mainRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ container: mainRef });
  const progressOpacity = useTransform(scrollYProgress, [0, 0.01, 1], [0, 1, 1]);

  /* Feedback state */
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successName, setSuccessName] = useState<string | null>(null);

  /* Reviews state */
  const [approvedReviews, setApprovedReviews] = useState<ReviewOut[]>([]);
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerRole, setReviewerRole] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  /* Accordion state for myths */
  const [openMyth, setOpenMyth] = useState<number | null>(null);

  useEffect(() => {
    getApprovedReviews()
      .then(setApprovedReviews)
      .catch(() => {});
  }, []);

  /* Currency */
  const [currency, setCurrency] = useState<"USD" | "INR">("USD");
  const [showWaitlistToast, setShowWaitlistToast] = useState(false);
  const [waitlistModal, setWaitlistModal] = useState<{ plan: string } | null>(null);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);

  /* Demo queries animation */
  const [demoQueryIdx, setDemoQueryIdx] = useState(0);
  const [demoQueryFade, setDemoQueryFade] = useState(true);
  const demoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    demoTimerRef.current = setInterval(() => {
      setDemoQueryFade(false);
      fadeTimerRef.current = setTimeout(() => {
        setDemoQueryIdx((i) => (i + 1) % DEMO_QUERIES.length);
        setDemoQueryFade(true);
      }, 350);
    }, 3200);
    return () => {
      if (demoTimerRef.current) clearInterval(demoTimerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, []);

  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  useEffect(() => {
    fetch("https://ipapi.co/json/")
      .then((r) => r.json())
      .then((d) => { if (d?.country_code === "IN") setCurrency("INR"); })
      .catch(() => {});
  }, []);

  /* Handlers */
  const handleWaitlist = (planName: string) => {
    setWaitlistEmail("");
    setWaitlistDone(false);
    setWaitlistModal({ plan: planName });
  };

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail.trim()) return;
    setWaitlistSubmitting(true);
    try {
      await submitFeedbackForm({
        name: "Waitlist signup",
        email: waitlistEmail.trim(),
        subject: `Waitlist: ${waitlistModal?.plan ?? "Unknown plan"}`,
        message: `User requested to join the waitlist for the ${waitlistModal?.plan ?? "Unknown"} plan.`,
      });
      setWaitlistDone(true);
      setShowWaitlistToast(true);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setShowWaitlistToast(false), 5000);
    } catch {
      setWaitlistDone(true);
    } finally {
      setWaitlistSubmitting(false);
    }
  };

  const handleCheckout = () => {
    navigate(session ? "/settings/billing" : "/signup");
  };

  const handleGetStarted = () => {
    navigate(session ? "/workspace" : "/signup");
  };

  const handleScrollHow = () => {
    const section = document.getElementById("how");
    if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handlePlanCta = (action: "trial" | "contact") => {
    if (action === "contact") {
      window.location.href = `mailto:${SUPPORT_EMAIL}`;
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
      setRequestError(`Something went wrong. Email us directly at ${SUPPORT_EMAIL}`);
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

  /* Pricing helper */
  const renderPricingCard = (plan: PricingPlan, idx: number, highlight = false) => {
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
      <motion.article
        key={plan.tier}
        className={`pricing-card${highlight ? " pricing-card-highlight" : ""}`}
        style={{ "--plan-color": plan.color } as CSSProperties}
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.45, delay: idx * 0.08, ease: "easeOut" }}
        whileHover={{ y: -6, transition: { duration: 0.2 } }}
      >
        <p className="pricing-tier">{plan.tier}</p>
        <p className="pricing-price">{currency === "INR" ? plan.priceINR : plan.priceUSD}</p>
        <p className="pricing-period">{currency === "INR" ? plan.periodINR : plan.periodUSD}</p>
        <ul className="pricing-features">
          {plan.features.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {plan.action === "contact" ? (
          <a className={buttonClass} href={`mailto:${SUPPORT_EMAIL}`}>
            {plan.buttonLabel}
          </a>
        ) : plan.action === "checkout" ? (
          <button type="button" className={buttonClass} onClick={handleCheckout}>
            {plan.buttonLabel}
          </button>
        ) : plan.action === "waitlist" ? (
          <button type="button" className={buttonClass} onClick={() => handleWaitlist(plan.tier)}>
            {plan.buttonLabel}
          </button>
        ) : (
          <button type="button" className={buttonClass} onClick={() => handlePlanCta("trial")}>
            {plan.buttonLabel}
          </button>
        )}
      </motion.article>
    );
  };

  /* ===========================================================================
     RENDER
     =========================================================================== */
  return (
    <main className="app-page home-page" ref={mainRef}>
      {/* Scroll progress at very top, behind nothing else */}
      <motion.div
        className="scroll-progress-bar"
        style={{ scaleX: scrollYProgress, opacity: progressOpacity }}
      />

      {/* ============================== HERO ============================== */}
      <section className="hero">
        <div className="hero-bg">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
          <div className="hero-orb hero-orb-3" />
          <div className="hero-grid-lines" />
        </div>

        <div className="hero-content">
          <motion.div
            className="hero-badge"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <span className="hero-badge-dot" />
            Beta live — help us improve
          </motion.div>

          <motion.h1
            className="hero-headline"
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            The data tool that lets you{" "}
            <span className="hero-gradient-text">see exactly</span>{" "}
            what it&apos;s doing
          </motion.h1>

          <motion.p
            className="hero-description"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.12, ease: "easeOut" }}
          >
            Describe what you want. DataHub builds a step-by-step plan with the exact SQL — you
            review and approve before anything touches your data.
          </motion.p>

          {/* Floating prompt-bar */}
          <motion.div
            className="hero-demo-bar"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
          >
            <span className="hero-demo-prefix">›</span>
            <span
              className="hero-demo-inner"
              style={{ opacity: demoQueryFade ? 1 : 0 }}
            >
              {DEMO_QUERIES[demoQueryIdx]}
            </span>
            <button
              type="button"
              className="hero-demo-btn"
              onClick={handleGetStarted}
              aria-label="Try this prompt"
            >
              Try
            </button>
          </motion.div>

          <motion.div
            className="hero-buttons"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.28, ease: "easeOut" }}
          >
            <motion.button
              type="button"
              className="btn-primary-lg"
              onClick={handleGetStarted}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              Get started free
            </motion.button>
            <motion.button
              type="button"
              className="btn-ghost-lg"
              onClick={handleScrollHow}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              See how it works
            </motion.button>
          </motion.div>
        </div>
      </section>

      {/* ============================== HOW IT WORKS ============================== */}
      <section id="how" className="section section-how">
        <div className="section-header">
          <p className="section-eyebrow">Workflow</p>
          <h2 className="section-title">From data to dashboard in four steps</h2>
          <p className="section-subtitle">
            Every action is transparent, reviewable, and replayable. You stay in control end-to-end.
          </p>
        </div>

        <div className="how-grid">
          {howSteps.map((s, i) => (
            <motion.article
              key={s.step}
              className="how-card"
              style={{ "--step-color": s.color } as CSSProperties}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: i * 0.08, ease: "easeOut" }}
              whileHover={{ y: -6 }}
            >
              <div className="how-step-number">{s.step}</div>
              <div className="how-step-icon">{s.icon}</div>
              <h3 className="how-step-title">{s.title}</h3>
              <p className="how-step-description">{s.description}</p>
            </motion.article>
          ))}
        </div>
      </section>

      {/* ============================== FEATURES ============================== */}
      <section className="section section-features">
        <div className="section-header">
          <p className="section-eyebrow">Capabilities</p>
          <h2 className="section-title">Everything you need to ship clean data</h2>
          <p className="section-subtitle">
            Built for the messy, real-world data that breaks every other tool.
          </p>
        </div>

        <div className="features-grid">
          {features.map((f, i) => (
            <motion.article
              key={f.title}
              className="feature-card"
              style={{ "--feat-color": f.color } as CSSProperties}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: i * 0.06, ease: "easeOut" }}
              whileHover={{ y: -6 }}
            >
              <div className="feature-icon">{f.icon}</div>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-description">{f.description}</p>
            </motion.article>
          ))}
        </div>
      </section>

      {/* ============================== PRICING ============================== */}
      <section id="pricing" className="section section-pricing">
        <div className="section-header">
          <p className="section-eyebrow">Pricing</p>
          <h2 className="section-title">Simple, transparent pricing</h2>
          <p className="section-subtitle">
            Start free. Upgrade when your team is ready. No surprises.
          </p>
          <div className="currency-toggle">
            <button
              type="button"
              className={`currency-btn${currency === "USD" ? " active" : ""}`}
              onClick={() => setCurrency("USD")}
            >
              USD
            </button>
            <button
              type="button"
              className={`currency-btn${currency === "INR" ? " active" : ""}`}
              onClick={() => setCurrency("INR")}
            >
              INR
            </button>
          </div>
        </div>

        <div className="pricing-grid">
          {plans.map((plan, idx) => renderPricingCard(plan, idx))}
        </div>
      </section>

      {/* ============================== MYTHS ============================== */}
      <section className="section section-myths">
        <div className="section-header">
          <p className="section-eyebrow">Why DataHub is different</p>
          <h2 className="section-title">Common concerns about AI data tools</h2>
          <p className="section-subtitle">
            We built DataHub specifically to address every one of these.
          </p>
        </div>

        <div className="myths-list">
          {myths.map((m, i) => (
            <motion.div
              key={i}
              className={`myth-item${openMyth === i ? " open" : ""}`}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
            >
              <button
                type="button"
                className="myth-q"
                onClick={() => setOpenMyth(openMyth === i ? null : i)}
                aria-expanded={openMyth === i}
              >
                <span>{m.myth}</span>
                <span className="myth-toggle">{openMyth === i ? "-" : "+"}</span>
              </button>
              {openMyth === i && <p className="myth-a">{m.reality}</p>}
            </motion.div>
          ))}
        </div>
      </section>

      {/* ============================== REVIEWS ============================== */}
      <section className="section section-reviews">
        <div className="section-header">
          <p className="section-eyebrow">Reviews</p>
          <h2 className="section-title">What early users are saying</h2>
        </div>

        {approvedReviews.length > 0 ? (
          <div className="reviews-grid">
            {approvedReviews.slice(0, 6).map((r) => (
              <motion.article
                key={r.id}
                className="review-card"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4 }}
              >
                <div className="review-stars">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} className={i < r.rating ? "star filled" : "star"}>?</span>
                  ))}
                </div>
                <p className="review-body">“{r.body}”</p>
                <p className="review-author">
                  <strong>{r.name}</strong>
                  {r.role ? <span className="review-role"> · {r.role}</span> : null}
                </p>
              </motion.article>
            ))}
          </div>
        ) : (
          <p className="reviews-empty">Be the first to share a review below.</p>
        )}

        <div className="review-form-wrap">
          <h3 className="review-form-title">Share your experience</h3>
          {reviewSuccess ? (
            <div className="form-success">
              Thank you — your review has been submitted for moderation.
            </div>
          ) : (
            <form className="review-form" onSubmit={handleReviewSubmit}>
              <div className="form-row">
                <input
                  className="form-input"
                  placeholder="Your name"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  required
                />
                <input
                  className="form-input"
                  placeholder="Role (optional)"
                  value={reviewerRole}
                  onChange={(e) => setReviewerRole(e.target.value)}
                />
              </div>
              <div className="rating-row">
                <span className="rating-label">Rating:</span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`rating-star${n <= reviewRating ? " active" : ""}`}
                    onClick={() => setReviewRating(n)}
                    aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  >
                    ?
                  </button>
                ))}
              </div>
              <textarea
                className="form-textarea"
                placeholder="Tell us what worked, what didn't, what you'd love to see…"
                rows={4}
                value={reviewBody}
                onChange={(e) => setReviewBody(e.target.value)}
                required
              />
              {reviewError ? <div className="form-error">{reviewError}</div> : null}
              <button type="submit" className="btn-primary-lg" disabled={reviewSubmitting}>
                {reviewSubmitting ? "Submitting…" : "Submit review"}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ============================== FEEDBACK ============================== */}
      <section id="feedback" className="section section-feedback">
        <div className="section-header">
          <p className="section-eyebrow">Get in touch</p>
          <h2 className="section-title">Have feedback or a question?</h2>
          <p className="section-subtitle">
            We read everything. Tell us what you need — feature, bug, integration, or anything else.
          </p>
        </div>

        <div className="feedback-card">
          {successName ? (
            <div className="form-success">
              Thanks, {successName} — we&apos;ll get back to you shortly.
            </div>
          ) : (
            <form className="feedback-form" onSubmit={handleFeedbackSubmit}>
              <div className="form-row">
                <input
                  className="form-input"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <input
                  className="form-input"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="tag-row">
                {feedbackTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={`tag-chip${subject === tag ? " active" : ""}`}
                    onClick={() => setSubject(subject === tag ? "" : tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <textarea
                className="form-textarea"
                placeholder="Your message…"
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
              {validationError ? <div className="form-error">{validationError}</div> : null}
              {requestError ? <div className="form-error">{requestError}</div> : null}
              <button type="submit" className="btn-primary-lg" disabled={isSubmitting}>
                {isSubmitting ? "Sending…" : "Send message"}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ============================== CTA ============================== */}
      <section className="section section-cta">
        <div className="cta-card">
          <h2 className="home-cta-title">Ready to ship clean data?</h2>
          <p className="cta-sub">
            Start free in seconds. No credit card. Upgrade anytime.
          </p>
          <div className="hero-buttons">
            <motion.button
              type="button"
              className="btn-primary-lg"
              onClick={handleGetStarted}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              Get started free
            </motion.button>
            <a className="btn-ghost-lg" href={`mailto:${SUPPORT_EMAIL}`}>
              Talk to us
            </a>
          </div>
        </div>
      </section>

      {/* ============================== FOOTER ============================== */}
      <footer className="home-footer">
        <div className="footer-grid">
          <div>
            <p className="footer-brand">DataHub</p>
            <p className="footer-tag">Plain-English data work, fully transparent.</p>
          </div>
          <div className="footer-links">
            <a className="footer-link" href="#pricing">Pricing</a>
            <a className="footer-link" href="/docs">Docs</a>
            <a className="footer-link" href="/privacy">Privacy</a>
            <a className="footer-link" href="/terms">Terms</a>
            <a className="footer-link" href={`mailto:${SUPPORT_EMAIL}`}>Contact</a>
          </div>
        </div>
        <p className="footer-copy">© {new Date().getFullYear()} DataHub. All rights reserved.</p>
      </footer>

      {/* ============================== WAITLIST MODAL ============================== */}
      {waitlistModal && (
        <div className="modal-backdrop" onClick={() => setWaitlistModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Join the {waitlistModal.plan} waitlist</h3>
            <p className="modal-sub">
              We&apos;ll let you know the moment it&apos;s available.
            </p>
            {waitlistDone ? (
              <div className="form-success">
                You&apos;re on the list. Talk soon.
              </div>
            ) : (
              <form onSubmit={handleWaitlistSubmit} className="modal-form">
                <input
                  className="form-input"
                  type="email"
                  placeholder="you@company.com"
                  value={waitlistEmail}
                  onChange={(e) => setWaitlistEmail(e.target.value)}
                  required
                  autoFocus
                />
                <button type="submit" className="btn-primary-lg" disabled={waitlistSubmitting}>
                  {waitlistSubmitting ? "Joining…" : "Join waitlist"}
                </button>
              </form>
            )}
            <button
              type="button"
              className="modal-close"
              onClick={() => setWaitlistModal(null)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {showWaitlistToast && (
        <div className="toast">
          ? You&apos;re on the waitlist — we&apos;ll be in touch!
        </div>
      )}
    </main>
  );
}
