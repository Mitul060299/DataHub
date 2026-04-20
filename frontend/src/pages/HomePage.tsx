import { type CSSProperties, type FormEvent, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useScroll } from "framer-motion";
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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   STATIC DATA
   â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const howSteps = [
  {
    step: "01",
    color: "#22c55e",
    icon: <IconUpload size={16} color="#22c55e" />,
    title: "Upload your data",
    description:
      "CSV, Excel, JSON, Parquet â€” or connect directly to PostgreSQL, Snowflake, BigQuery, or Redshift.",
  },
  {
    step: "02",
    color: "#818cf8",
    icon: <IconBrain size={16} color="#818cf8" />,
    title: "Ask in plain English",
    description:
      '"Remove duplicates", "join with customers", "show revenue by region as a bar chart" â€” the agent understands.',
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
      "Publish dashboards with one link. Every step recorded and replayable â€” full audit trail included.",
  },
];

const features = [
  {
    title: "AI Agent",
    color: "#818cf8",
    icon: <IconMessageCircle size={20} color="#818cf8" />,
    description:
      "Understands your intent, builds a step-by-step plan with the exact SQL, presents it for your review â€” and only executes after you approve. Retries automatically on failure.",
  },
  {
    title: "Recorded Pipelines",
    color: "#22c55e",
    icon: <IconFileText size={20} color="#22c55e" />,
    description:
      "Every transformation captured as a replayable step. Edit, re-run, or hand off â€” always transparent.",
  },
  {
    title: "Cross-Dataset Dashboards",
    color: "#38bdf8",
    icon: <IconGrid size={20} color="#38bdf8" />,
    description:
      "Build Power BI-style dashboards across multiple datasets. Publish with one click via a shareable public link.",
  },
  {
    title: "Any Data Source",
    color: "#f59e0b",
    icon: <IconDatabase size={20} color="#f59e0b" />,
    description:
      "CSV, Excel, JSON, Parquet. Direct connections to PostgreSQL, MySQL, Snowflake, BigQuery, Redshift.",
  },
  {
    title: "Team Collaboration",
    color: "#a78bfa",
    icon: <IconTeam size={20} color="#a78bfa" />,
    description:
      "Share workspaces, collaborate on pipelines, assign roles. Version history shows who changed what and when.",
  },
  {
    title: "Audit & Governance",
    color: "#f87171",
    icon: <IconShield size={20} color="#f87171" />,
    description:
      "Full data lineage, approval workflows, audit logs. SOC2-ready controls for compliance-heavy industries.",
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
      "1 personal workspace Â· 1 seat",
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
    color: "#5B6AF0",
    priceUSD: "$299",
    priceINR: "\u20b914,999",
    periodUSD: "/month (Coming soon)",
    periodINR: "/month",
    features: [
      "Includes 3 seats Â· +â‚¹2,499/extra seat",
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
      "Includes 5 seats Â· +â‚¹3,999/extra seat",
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
    myth: "\"It's a black box â€” I have no idea what it's doing to my data.\"",
    reality:
      "Every action is a named step shown to you before it runs. You see the exact SQL or operation, then choose Approve, Edit, or Reject. Nothing executes without your go-ahead.",
  },
  {
    myth: "\"The AI will hallucinate results or make up numbers.\"",
    reality:
      "DataHub runs real, deterministic SQL on your actual data. The AI writes the query â€” your data produces the result. No generation, no guessing, no invented rows.",
  },
  {
    myth: "\"I'll lose control of my pipeline once the AI builds it.\"",
    reality:
      "Every transformation is saved as a labelled, replayable step. You can edit any step inline, delete it, or re-run from any point. The pipeline is yours â€” the AI is just the author.",
  },
  {
    myth: "\"My sensitive data is being sent somewhere unsafe.\"",
    reality:
      "Your data is stored in our encrypted, isolated cloud storage â€” never shared between accounts. We never use your data to train our AI. Full audit logs record every access, by whom, and when.",
  },
  {
    myth: "\"It only works on clean, nicely formatted CSVs.\"",
    reality:
      "DataHub was built specifically for the messy real world â€” auto-detects delimiters, fixes broken encodings, handles nulls, outliers, duplicates, type mismatches, and multi-sheet Excel out of the box.",
  },
];

const feedbackTags = ["Feature requests", "Bug reports", "Integration ideas", "General feedback"];

const metricsStrip = [
  { number: "10+", label: "Countries served" },
  { number: "Free", label: "Forever tier" },
  { number: "0", label: "Lines of code needed" },
  { number: "100%", label: "Audit trail" },
];

const heroChips = [
  { label: "AI Agent", color: "#818cf8" },
  { label: "Recorded Pipelines", color: "#22c55e" },
  { label: "Dashboards", color: "#38bdf8" },
  { label: "Team Collaboration", color: "#a78bfa" },
  { label: "Full Audit Trail", color: "#f87171" },
];

const DEMO_QUERIES = [
  "Remove duplicates and fill nulls with averages",
  "Show revenue by region as a bar chart",
  "Join with customers table on customer_id",
  "Flag rows where revenue exceeds the monthly average",
  "Export cleaned data to Google Sheets",
];

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   COMPONENT
   â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export function HomePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const mainRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ container: mainRef });

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

  useEffect(() => {
    demoTimerRef.current = setInterval(() => {
      setDemoQueryFade(false);
      setTimeout(() => {
        setDemoQueryIdx((i) => (i + 1) % DEMO_QUERIES.length);
        setDemoQueryFade(true);
      }, 350);
    }, 3200);
    return () => { if (demoTimerRef.current) clearInterval(demoTimerRef.current); };
  }, []);

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
      setTimeout(() => setShowWaitlistToast(false), 5000);
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
      window.location.href = "mailto:mitul.srivastava000@gmail.com";
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
      setRequestError("Something went wrong. Email us directly at mitul.srivastava000@gmail.com");
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
          <a className={buttonClass} href="mailto:mitul.srivastava000@gmail.com">
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

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     RENDER
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  return (
    <main className="app-page home-page" ref={mainRef}>
      <motion.div className="scroll-progress-bar" style={{ scaleX: scrollYProgress }} />

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          HERO â€“ Full viewport, centered
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
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
            ðŸš€ Beta Live â€” Help us Improve
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
            Describe what you want. DataHub builds a step-by-step plan with the exact SQL â€” you
            review and approve before anything touches your data.
          </motion.p>

          {/* â”€â”€ Floating demo bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <motion.div
            className="hero-demo-bar"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
          >
            <span
              className="hero-demo-inner"
              style={{ opacity: demoQueryFade ? 1 : 0 }}
            >
              {DEMO_QUERIES[demoQueryIdx]}
            </span>
            <button type="button" className="hero-demo-btn" onClick={handleGetStarted}>â†‘</button>
          </motion.div>

          {/* â”€â”€ CTA buttons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
              â–¶ Get started free
            </motion.button>
            <motion.button
              type="button"
              className="btn-ghost-lg"
              onClick={handleScrollHow}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              See how it works â†“
            </motion.button>
          </motion.div>

          <motion.p
            className="hero-note"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          >
            No credit card required Â· Free tier forever
          </motion.p>

          {/* â”€â”€ Capability chips â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <motion.div
            className="hero-chips"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5, ease: "easeOut" }}
          >
            {heroChips.map((chip) => (
              <span key={chip.label} className="hero-chip">
                <span className="hero-chip-dot" style={{ background: chip.color, boxShadow: `0 0 8px ${chip.color}` }} />
                {chip.label}
              </span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          METRICS BAND
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <section className="metrics-band">
        <div className="metrics-band-inner">
          {metricsStrip.map((item, i) => (
            <motion.div
              key={item.label}
              className="metric-item"
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08, ease: "easeOut" }}
            >
              <span className="metric-number">{item.number}</span>
              <span className="metric-label">{item.label}</span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          HOW IT WORKS â€“ Large step strip
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <section id="how" className="hp-section">
        <div className="hp-inner">
          <motion.span
            className="eyebrow"
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35 }}
          >
            How it works
          </motion.span>
          <motion.h2
            className="hp-heading"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: 0.06 }}
          >
            From messy data to decisions in four steps
          </motion.h2>
          <motion.p
            className="hp-subheading"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.12 }}
          >
            No SQL. No Python. No BI team needed. Just describe what you want â€” the agent handles the rest, with a full audit trail.
          </motion.p>

          <div className="steps-grid">
            {howSteps.map((step, i) => (
              <motion.div
                key={step.step}
                className="step-card"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.45, delay: i * 0.1, ease: "easeOut" }}
              >
                <p className="step-number">{step.step}</p>
                <div className="step-icon-circle" style={{ background: `${step.color}14` }}>
                  {step.icon}
                </div>
                <h3 className="step-title">{step.title}</h3>
                <p className="step-desc">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          FEATURES â€“ Bento grid
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <section className="hp-section hp-section-dark">
        <div className="hp-inner">
          <motion.span
            className="eyebrow"
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35 }}
          >
            Features
          </motion.span>
          <motion.h2
            className="hp-heading"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: 0.06 }}
          >
            Everything your data team needs
          </motion.h2>
          <motion.p
            className="hp-subheading"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.12 }}
          >
            Built for analysts who want the power of a data engineer without writing a single line of code.
          </motion.p>

          <div className="bento-grid">
            {features.map((feature, i) => (
              <motion.article
                key={feature.title}
                className={`bento-card${i === 0 ? " bento-hero" : ""}`}
                style={{ "--feature-color": feature.color } as CSSProperties}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.42, delay: i * 0.07, ease: "easeOut" }}
              >
                <div className="bento-icon" style={{ background: `${feature.color}12` }}>
                  {feature.icon}
                </div>
                <h3 className="bento-title">{feature.title}</h3>
                <p className="bento-desc">{feature.description}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          BRANCHING PIPELINES DAG
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <section className="hp-section">
        <div className="hp-inner">
          <motion.span
            className="eyebrow"
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35 }}
          >
            Branching Pipelines
          </motion.span>
          <motion.h2
            className="hp-heading"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: 0.06 }}
          >
            Multi-stream pipelines, not just a list
          </motion.h2>
          <motion.p
            className="hp-subheading"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.12 }}
          >
            When your analysis splits into parallel streams, DataHub visualises it as a dependency graph â€”
            just like GitHub Actions workflows.
          </motion.p>

          <div className="pipeline-dag-demo">
            <div className="dag-demo-query">
              &ldquo;Clean the data, then branch â€” segment customers by region AND calculate monthly revenue trends, finally merge into one summary report.&rdquo;
            </div>
            <div className="dag-demo-graph">
              <div className="dag-row">
                <motion.div className="dag-node dag-node-source" initial={{ opacity: 0, scale: 0.85 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.35 }}>
                  1 &middot; Clean sales data
                </motion.div>
              </div>
              <div className="dag-connectors dag-connectors-fork">
                <span className="dag-line dag-line-left" />
                <span className="dag-line dag-line-right" />
              </div>
              <div className="dag-row">
                <motion.div className="dag-node dag-node-branch" initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.35, delay: 0.18 }}>
                  2 &middot; Segment by region
                </motion.div>
                <motion.div className="dag-node dag-node-branch" initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.35, delay: 0.18 }}>
                  3 &middot; Revenue trends
                </motion.div>
              </div>
              <div className="dag-connectors dag-connectors-join">
                <span className="dag-line dag-line-left" />
                <span className="dag-line dag-line-right" />
              </div>
              <div className="dag-row">
                <motion.div className="dag-node dag-node-merge" initial={{ opacity: 0, scale: 0.85 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.35, delay: 0.36 }}>
                  4 &middot; Merge into summary
                </motion.div>
              </div>
            </div>
            <div className="dag-demo-note">
              Steps 2 and 3 run independently â€” step 4 starts only when both are done.
            </div>
          </div>
        </div>
      </section>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          MYTHS / FAQ â€“ Accordion
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <section id="myths" className="hp-section hp-section-dark">
        <div className="hp-inner">
          <motion.span
            className="eyebrow"
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35 }}
          >
            Straight answers
          </motion.span>
          <motion.h2
            className="hp-heading"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: 0.06 }}
          >
            Common concerns, addressed
          </motion.h2>
          <motion.p
            className="hp-subheading"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.12 }}
          >
            AI and data tools attract scepticism â€” and that&apos;s healthy. Here&apos;s exactly how DataHub works, no hand-waving.
          </motion.p>

          <div className="accordion-list">
            {myths.map((item, i) => (
              <motion.div
                key={i}
                className={`accordion-item${openMyth === i ? " accordion-item-open" : ""}`}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ duration: 0.35, delay: i * 0.06, ease: "easeOut" }}
              >
                <button
                  type="button"
                  className="accordion-trigger"
                  onClick={() => setOpenMyth(openMyth === i ? null : i)}
                >
                  <span className="accordion-question">{item.myth}</span>
                  <span className="accordion-chevron">â–¾</span>
                </button>
                <div className="accordion-answer">
                  <p className="accordion-answer-text">{item.reality}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          PRICING â€“ 3 main + 2 enterprise
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <section id="pricing" className="hp-section">
        <div className="hp-inner">
          <motion.span
            className="eyebrow"
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35 }}
          >
            Pricing
          </motion.span>
          <motion.h2
            className="hp-heading"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: 0.06 }}
          >
            Start free, scale when ready
          </motion.h2>
          <motion.p
            className="hp-subheading"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.12 }}
          >
            No credit card required. Upgrade when your team needs more.
          </motion.p>

          {/* Main 3: Free Â· Professional Â· Team */}
          <div className="pricing-row-main">
            {plans.slice(0, 3).map((plan, i) =>
              renderPricingCard(plan, i, plan.tier === "Professional")
            )}
          </div>

          {/* Enterprise row: Business Â· Enterprise */}
          <div className="pricing-row-enterprise">
            {plans.slice(3).map((plan, i) =>
              renderPricingCard(plan, i + 3)
            )}
          </div>
        </div>
      </section>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          CTA
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <section className="home-cta-section">
        <div className="home-cta-inner">
          <motion.h2
            className="home-cta-title"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
          >
            Start analysing your data in 60 seconds
          </motion.h2>
          <motion.p
            className="home-cta-sub"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
          >
            Upload a CSV, ask a question, get results. No setup. No SQL. No BI team required.
          </motion.p>
          <motion.button
            type="button"
            className="home-cta-btn"
            onClick={handleGetStarted}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
          >
            â–¶ Try it free &mdash; no credit card needed
          </motion.button>
        </div>
      </section>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          REVIEWS
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <section className="hp-section" id="reviews">
        <div className="hp-inner">
          <div className="reviews-layout">
            <div>
              <motion.span className="eyebrow" initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.35 }}>
                User reviews
              </motion.span>
              <motion.h2
                className="reviews-heading"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: 0.08 }}
              >
                What our users say
              </motion.h2>
              <motion.p
                className="reviews-subheading"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.16 }}
              >
                Real feedback from teams using DataHub every day.
              </motion.p>
              {approvedReviews.length === 0 ? (
                <p className="reviews-empty">No reviews yet â€” be the first!</p>
              ) : (
                <div className="reviews-cards">
                  {approvedReviews.map((r, rIdx) => (
                    <motion.div
                      key={r.id}
                      className="review-card"
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: "-40px" }}
                      transition={{ duration: 0.42, delay: rIdx * 0.1, ease: "easeOut" }}
                    >
                      <div className="review-stars">
                        {Array.from({ length: 5 }, (_, i) => (
                          <span key={i} className={i < r.rating ? "star-filled" : "star-empty"}>â˜…</span>
                        ))}
                      </div>
                      <p className="review-body">&ldquo;{r.body}&rdquo;</p>
                      <p className="review-author">
                        <strong>{r.name}</strong>
                        {r.role ? <span className="review-role"> Â· {r.role}</span> : null}
                      </p>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            <div className="review-form-wrap">
              <h3 className="review-form-title">Leave a review</h3>
              <p className="review-form-sub">Your review is published after a quick check.</p>
              {reviewSuccess ? (
                <div className="feedback-success">Thanks! Your review will appear once approved. ðŸ™</div>
              ) : (
                <form className="feedback-form" onSubmit={(e) => void handleReviewSubmit(e)}>
                  <div className="feedback-row-two">
                    <input className="feedback-input" placeholder="Your name" value={reviewerName} onChange={(e) => setReviewerName(e.target.value)} />
                    <input className="feedback-input" placeholder="Role / Company (optional)" value={reviewerRole} onChange={(e) => setReviewerRole(e.target.value)} />
                  </div>
                  <div className="review-star-picker">
                    <span className="review-star-label">Rating</span>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button key={s} type="button" className={`review-star-btn${s <= reviewRating ? " review-star-active" : ""}`} onClick={() => setReviewRating(s)} aria-label={`${s} star`}>â˜…</button>
                    ))}
                  </div>
                  <textarea className="feedback-textarea" placeholder="Share your experience with DataHub..." value={reviewBody} onChange={(e) => setReviewBody(e.target.value)} />
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

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          FEEDBACK
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <section className="hp-section hp-section-dark">
        <div className="hp-inner">
          <div className="feedback-card">
            <div>
              <span className="eyebrow">We&apos;re listening</span>
              <h2 className="feedback-title">Help us build the right thing</h2>
              <p className="feedback-body">
                DataHub is actively in development. Your feedback directly shapes what we build next â€” whether it&apos;s a missing feature,
                a confusing flow, or something you&apos;d love to see.
              </p>
              <div className="feedback-tag-list">
                {feedbackTags.map((tag) => (
                  <span key={tag} className="feedback-tag">{tag}</span>
                ))}
              </div>
            </div>
            <div>
              {successName ? (
                <div className="feedback-success">Thanks {successName} â€” we&apos;ll read every word. ðŸ™</div>
              ) : (
                <form className="feedback-form" onSubmit={(event) => void handleFeedbackSubmit(event)}>
                  <div className="feedback-row-two">
                    <input className="feedback-input" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} />
                    <input className="feedback-input" placeholder="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                  </div>
                  <input className="feedback-input" placeholder="Subject â€” e.g. 'Feature request: Notion connector'" value={subject} onChange={(event) => setSubject(event.target.value)} />
                  <textarea className="feedback-textarea" placeholder="Tell us what's on your mind â€” the more detail the better..." value={message} onChange={(event) => setMessage(event.target.value)} />
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

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          FOOTER â€“ multi-column
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <footer className="hp-footer">
        <div className="footer-inner">
          <div className="footer-grid">
            <div>
              <p className="footer-brand">DataHub</p>
              <p className="footer-brand-desc">
                The AI-powered data platform that shows you exactly what it&apos;s doing. Every step transparent, every action auditable.
              </p>
            </div>
            <div>
              <p className="footer-col-title">Product</p>
              <div className="footer-links">
                <a href="/docs" className="footer-link">Documentation</a>
                <a href="#how" className="footer-link">How it works</a>
                <a href="#pricing" className="footer-link">Pricing</a>
              </div>
            </div>
            <div>
              <p className="footer-col-title">Company</p>
              <div className="footer-links">
                <a href="mailto:mitul.srivastava000@gmail.com" className="footer-link">Contact</a>
                <a href="#reviews" className="footer-link">Reviews</a>
              </div>
            </div>
            <div>
              <p className="footer-col-title">Legal</p>
              <div className="footer-links">
                <a href="/terms" className="footer-link">Terms of Service</a>
                <a href="/privacy" className="footer-link">Privacy Policy</a>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <span>Â© {new Date().getFullYear()} DataHub. All rights reserved.</span>
          </div>
        </div>
      </footer>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          WAITLIST MODAL
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {waitlistModal && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
          onClick={() => { if (!waitlistSubmitting) setWaitlistModal(null); }}
        >
          <div
            style={{ background: "#111118", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 20, padding: "32px 36px", maxWidth: 420, width: "90vw", boxShadow: "0 32px 100px rgba(0,0,0,0.6)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {waitlistDone ? (
              <>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#e8e8f0" }}>You&apos;re on the waitlist! ðŸŽ‰</p>
                <p style={{ margin: "12px 0 24px", fontSize: 14, color: "#8888a0", lineHeight: 1.6 }}>We&apos;ll email you at <strong style={{ color: "#e8e8f0" }}>{waitlistEmail}</strong> when the {waitlistModal.plan} plan launches.</p>
                <button onClick={() => setWaitlistModal(null)} style={{ padding: "10px 24px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Close</button>
              </>
            ) : (
              <form onSubmit={(e) => void handleWaitlistSubmit(e)}>
                <p style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: "#e8e8f0" }}>Join the {waitlistModal.plan} waitlist</p>
                <p style={{ margin: "0 0 24px", fontSize: 14, color: "#8888a0" }}>Enter your email and we&apos;ll notify you the moment it&apos;s available.</p>
                <input
                  type="email"
                  required
                  autoFocus
                  value={waitlistEmail}
                  onChange={(e) => setWaitlistEmail(e.target.value)}
                  placeholder="you@company.com"
                  style={{ width: "100%", boxSizing: "border-box", padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#e8e8f0", fontSize: 14, marginBottom: 16, outline: "none" }}
                />
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="submit" disabled={waitlistSubmitting} style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: waitlistSubmitting ? 0.7 : 1 }}>
                    {waitlistSubmitting ? "Submittingâ€¦" : "Notify me"}
                  </button>
                  <button type="button" onClick={() => setWaitlistModal(null)} style={{ padding: "12px 20px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "none", color: "#8888a0", fontSize: 14, cursor: "pointer" }}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {showWaitlistToast ? (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 12, padding: "12px 24px", color: "#c7d2fe", fontSize: 14, fontWeight: 500, backdropFilter: "blur(16px)", boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
          âœ“ You&apos;re on the waitlist â€” we&apos;ll be in touch!
        </div>
      ) : null}
    </main>
  );
}
