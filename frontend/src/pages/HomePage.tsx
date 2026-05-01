import { type CSSProperties, type FormEvent, useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
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
import { capture } from "../lib/posthog";
import "./HomePage.css";

/* ===========================================================================
   STATIC CONTENT (ASCII-only)
   =========================================================================== */

const howSteps = [
  {
    step: "01",
    color: "#22c55e",
    icon: <IconUpload size={18} color="#22c55e" />,
    title: "Upload your data",
    description:
      "CSV, Excel, JSON, Parquet. Or connect directly to PostgreSQL, Snowflake, BigQuery, Redshift.",
  },
  {
    step: "02",
    color: "#a78bfa",
    icon: <IconBrain size={18} color="#a78bfa" />,
    title: "Ask in plain English",
    description:
      'Say "remove duplicates", "join with customers", or "show revenue by region as a bar chart". The agent understands.',
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
      "Publish results with one link. Every step recorded and replayable. Full audit trail included.",
  },
];

type Feature = {
  title: string;
  color: string;
  icon: JSX.Element;
  description: string;
  span: "lg" | "md" | "sm" | "tall";
  visual: "agent" | "pipeline" | "dashboard" | "sources" | "team" | "audit";
};

const features: Feature[] = [
  {
    title: "AI Agent",
    color: "#a78bfa",
    icon: <IconMessageCircle size={20} color="#a78bfa" />,
    description: "Plain-English to SQL with the plan shown before anything runs.",
    span: "lg",
    visual: "agent",
  },
  {
    title: "Recorded Pipelines",
    color: "#22c55e",
    icon: <IconFileText size={20} color="#22c55e" />,
    description: "Every transformation captured as a replayable step.",
    span: "md",
    visual: "pipeline",
  },
  {
    title: "Cross-Dataset Visuals",
    color: "#38bdf8",
    icon: <IconGrid size={20} color="#38bdf8" />,
    description: "Power BI-style visuals across multiple datasets, shared by link.",
    span: "md",
    visual: "dashboard",
  },
  {
    title: "Any Data Source",
    color: "#f59e0b",
    icon: <IconDatabase size={20} color="#f59e0b" />,
    description: "CSV, Excel, JSON, Parquet. Native Postgres, Snowflake, BigQuery.",
    span: "tall",
    visual: "sources",
  },
  {
    title: "Team Collaboration",
    color: "#ec4899",
    icon: <IconTeam size={20} color="#ec4899" />,
    description: "Project-level collaboration with roles, invites, and version history.",
    span: "sm",
    visual: "team",
  },
  {
    title: "Audit & Governance",
    color: "#f87171",
    icon: <IconShield size={20} color="#f87171" />,
    description: "Full lineage, approval workflows, audit logs. SOC2-ready.",
    span: "sm",
    visual: "audit",
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
  featuresUSD?: string[];
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
      "Solo projects only",
      "Up to 2 projects",
      "50 AI messages/month",
      "50 MB file size",
      "500 MB storage",
      "5 GB data scan/month",
      "1 team member",
      "Files: CSV, Excel",
      "Databases: \u2014",
      "Community support",
    ],
    buttonLabel: "Get started",
    buttonStyle: "ghost",
    action: "trial",
  },
  {
    tier: "Starter",
    color: "#06b6d4",
    priceUSD: "$19",
    priceINR: "\u20b9999",
    periodUSD: "/month (USD launching soon)",
    periodINR: "/month",
    features: [
      "Solo projects · 1 seat",
      "Up to 5 projects",
      "500 AI messages/month",
      "250 MB file size",
      "5 GB storage",
      "25 GB data scan/month",
      "Files: CSV, Excel, JSON",
      "Database: SQLite",
      "Daily scheduled runs",
      "Email support",
    ],
    buttonLabel: "Subscribe",
    buttonStyle: "blue",
    action: "checkout",
  },
  {
    tier: "Professional",
    color: "#3b82f6",
    priceUSD: "$79",
    priceINR: "\u20b93,999",
    periodUSD: "/month (USD launching soon)",
    periodINR: "/month",
    features: [
      "Solo projects · 1 seat",
      "Up to 20 projects",
      "1,500 AI messages/month",
      "1 GB file size",
      "20 GB storage",
      "100 GB data scan/month",
      "DB: PostgreSQL, MySQL, SQLite, MSSQL, Oracle",
      "S3, GCS, Azure Blob storage",
      "Email support",
    ],
    buttonLabel: "Subscribe",
    buttonStyle: "blue",
    action: "checkout",
  },
  {
    tier: "Team",
    color: "#7c3aed",
    priceUSD: "$179",
    priceINR: "\u20b98,999",
    periodUSD: "/month (USD launching soon)",
    periodINR: "/month",
    features: [
      "Includes 3 seats. +\u20b91,499/extra seat",
      "10 members per project · 5 collaborative projects",
      "4,000+ AI messages (scales with seats)",
      "5 GB file size",
      "100 GB+ storage (scales with seats)",
      "500 GB+ data scan/month",
      "Files: CSV, Excel, JSON, Parquet",
      "Databases: PostgreSQL, MySQL, SQLite, MSSQL, Oracle, Snowflake, Redshift, BigQuery",
      "Audit log",
      "Priority email support",
    ],
    featuresUSD: [
      "Includes 3 seats. +$29/extra seat",
      "10 members per project · 5 collaborative projects",
      "4,000+ AI messages (scales with seats)",
      "5 GB file size",
      "100 GB+ storage (scales with seats)",
      "500 GB+ data scan/month",
      "Files: CSV, Excel, JSON, Parquet",
      "Databases: PostgreSQL, MySQL, SQLite, MSSQL, Oracle, Snowflake, Redshift, BigQuery",
      "Audit log",
      "Priority email support",
    ],
    buttonLabel: "Subscribe",
    buttonStyle: "primary",
    action: "checkout",
  },
  {
    tier: "Business",
    color: "#eab308",
    priceUSD: "$349",
    priceINR: "\u20b917,999",
    periodUSD: "/month (USD launching soon)",
    periodINR: "/month",
    features: [
      "Includes 5 seats. +\u20b92,499/extra seat",
      "50 members per project · unlimited collaborative projects",
      "15,000+ AI messages (scales with seats)",
      "10 GB file size",
      "500 GB+ storage (scales with seats) · 2 TB+ scan/month",
      "Files: CSV, Excel, JSON, Parquet",
      "Databases: All supported + custom connectors on request",
      "Audit log",
      "SSO / SAML · Webhooks",
      "24/7 dedicated support",
    ],
    featuresUSD: [
      "Includes 5 seats. +$49/extra seat",
      "50 members per project · unlimited collaborative projects",
      "15,000+ AI messages (scales with seats)",
      "10 GB file size",
      "500 GB+ storage (scales with seats) · 2 TB+ scan/month",
      "Files: CSV, Excel, JSON, Parquet",
      "Databases: All supported + custom connectors on request",
      "Audit log",
      "SSO / SAML · Webhooks",
      "24/7 dedicated support",
    ],
    buttonLabel: "Subscribe",
    buttonStyle: "amber",
    action: "checkout",
  },
  {
    tier: "Enterprise",
    color: "#ef4444",
    priceUSD: "Custom",
    priceINR: "Custom",
    periodUSD: "contact us · from $1,500/mo (5+ seats)",
    periodINR: "contact us · from $1,500/mo (5+ seats)",
    features: [
      "Unlimited members per project · unlimited collaborative projects",
      "Negotiated AI / pipeline / scan quotas (fair-use)",
      "Custom storage",
      "Unlimited team members",
      "Files: CSV, Excel, JSON, Parquet (any format on request)",
      "Databases: All supported + bespoke connectors",
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
    myth: 'It is a black box. I have no idea what it is doing to my data.',
    reality:
      "Every action is a named step shown to you before it runs. You see the exact SQL or operation, then choose Approve, Edit, or Reject. Nothing executes without your go-ahead.",
  },
  {
    myth: 'The AI will hallucinate results or make up numbers.',
    reality:
      "DataHub runs real, deterministic SQL on your actual data. The AI writes the query. Your data produces the result. No generation, no guessing, no invented rows.",
  },
  {
    myth: 'I will lose control of my pipeline once the AI builds it.',
    reality:
      "Every transformation is saved as a labelled, replayable step. You can edit any step inline, delete it, or re-run from any point. The pipeline is yours. The AI is just the author.",
  },
  {
    myth: 'My sensitive data is being sent somewhere unsafe.',
    reality:
      "Your data is stored in our encrypted, isolated cloud storage, never shared between accounts. We never use your data to train our AI. Full audit logs record every access.",
  },
  {
    myth: 'It only works on clean, nicely formatted CSVs.',
    reality:
      "DataHub was built for the messy real world. Auto-detects delimiters, fixes broken encodings, handles nulls, outliers, duplicates, type mismatches, and multi-sheet Excel out of the box.",
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

const MARQUEE_ITEMS = [
  "PostgreSQL",
  "Snowflake",
  "BigQuery",
  "Redshift",
  "MySQL",
  "MSSQL",
  "Oracle",
  "SQLite",
  "CSV",
  "Excel",
  "JSON",
  "Parquet",
  "Google Sheets",
];

const SUPPORT_EMAIL = "mitul.srivastava000@gmail.com";

/* ===========================================================================
   COMPONENT
   =========================================================================== */

const HOME_HOWTO_LD = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to analyse data with DataHub's AI agent",
  description:
    "Go from a raw CSV, Excel file, or database connection to a trusted, shareable analysis in four reviewable steps.",
  totalTime: "PT10M",
  step: [
    {
      "@type": "HowToStep",
      position: 1,
      name: "Upload your data",
      text: "Upload CSV, Excel, JSON, or Parquet files, or connect directly to PostgreSQL, MySQL, Snowflake, BigQuery, or Redshift.",
      url: "https://datahub.org.in/#how",
    },
    {
      "@type": "HowToStep",
      position: 2,
      name: "Ask in plain English",
      text: "Describe what you want — 'remove duplicates', 'join with customers', 'show revenue by region as a bar chart'. The AI agent translates it to SQL.",
      url: "https://datahub.org.in/#how",
    },
    {
      "@type": "HowToStep",
      position: 3,
      name: "Review the SQL plan",
      text: "DataHub shows the exact SQL or operation it intends to run. Approve, edit the plan, or ask the agent to try a different approach.",
      url: "https://datahub.org.in/#how",
    },
    {
      "@type": "HowToStep",
      position: 4,
      name: "Share and publish results",
      text: "Publish the analysis with one link. Every step is recorded, replayable, and audit-logged.",
      url: "https://datahub.org.in/#how",
    },
  ],
};

const HOME_FAQ_LD = [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Is DataHub a black box? Will I know what it is doing to my data?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Every action is a named step shown to you before it runs. You see the exact SQL or operation, then choose Approve, Edit, or Reject. Nothing executes without your go-ahead.",
        },
      },
      {
        "@type": "Question",
        name: "Will the AI hallucinate results or make up numbers?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "DataHub runs real, deterministic SQL on your actual data. The AI writes the query. Your data produces the result. No generation, no guessing, no invented rows.",
        },
      },
      {
        "@type": "Question",
        name: "Will I lose control of my pipeline once the AI builds it?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Every transformation is saved as a labelled, replayable step. You can edit any step inline, delete it, or re-run from any point. The pipeline is yours.",
        },
      },
      {
        "@type": "Question",
        name: "Is my sensitive data safe with DataHub?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Your data is stored in encrypted, isolated cloud storage — never shared between accounts. We never use your data to train the AI. Full audit logs record every access.",
        },
      },
      {
        "@type": "Question",
        name: "Does DataHub only work with clean, nicely formatted CSV files?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "DataHub was built for the messy real world. It auto-detects delimiters, fixes broken encodings, handles nulls, outliers, duplicates, type mismatches, and multi-sheet Excel files out of the box.",
        },
      },
    ],
  },
];

export function HomePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const mainRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLElement>(null);

  const pageLd = useMemo(() => [...HOME_FAQ_LD, HOME_HOWTO_LD], []);
  useSEO({
    title: "DataHub – The Simple and Reliable Way to Prepare & Analyse Your Data",
    description:
      "DataHub cleans, transforms, and analyses your CSV, Excel, and database data in plain English. Every step runs as readable SQL you can review, edit, and replay — so the result is always one you can trust.",
    canonical: "https://datahub.org.in/",
    structuredData: pageLd,
  });

  const { scrollYProgress } = useScroll({ container: mainRef });
  const progressOpacity = useTransform(scrollYProgress, [0, 0.005, 1], [0, 1, 1]);
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.4 });

  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    container: mainRef,
    offset: ["start start", "end start"],
  });
  const heroOrbY = useTransform(heroProgress, [0, 1], [0, 180]);
  const heroContentY = useTransform(heroProgress, [0, 1], [0, -60]);
  const heroContentOpacity = useTransform(heroProgress, [0, 0.7], [1, 0.2]);
  const heroBgScale = useTransform(heroProgress, [0, 1], [1, 1.1]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successName, setSuccessName] = useState<string | null>(null);

  const [approvedReviews, setApprovedReviews] = useState<ReviewOut[]>([]);
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerRole, setReviewerRole] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const [openMyth, setOpenMyth] = useState<number | null>(null);

  useEffect(() => {
    getApprovedReviews()
      .then(setApprovedReviews)
      .catch(() => {});
  }, []);

  const [currency, setCurrency] = useState<"USD" | "INR">("USD");
  const [showWaitlistToast, setShowWaitlistToast] = useState(false);
  const [waitlistModal, setWaitlistModal] = useState<{ plan: string } | null>(null);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);

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

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    fetch("https://ipapi.co/json/")
      .then((r) => r.json())
      .then((d) => {
        if (d?.country_code === "IN") setCurrency("INR");
      })
      .catch(() => {});
  }, []);

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

  const handleMagneticMove = (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--mx", `${x}%`);
    el.style.setProperty("--my", `${y}%`);
  };

  const renderFeatureVisual = (kind: Feature["visual"]) => {
    switch (kind) {
      case "agent":
        return (
          <div className="bento-visual bento-visual-agent">
            <div className="agent-msg user">Show revenue by region this quarter</div>
            <div className="agent-msg ai">
              <span className="agent-step">Step 1</span> Group orders by region
            </div>
            <div className="agent-msg ai">
              <span className="agent-step">Step 2</span> Sum revenue, sort desc
            </div>
            <div className="agent-msg ai">
              <span className="agent-step">Step 3</span> Render bar chart
            </div>
          </div>
        );
      case "pipeline":
        return (
          <div className="bento-visual bento-visual-pipeline">
            {["Load", "Clean", "Join", "Aggregate", "Export"].map((s, i) => (
              <div key={s} className="pipe-node" style={{ animationDelay: `${i * 0.15}s` }}>
                {s}
              </div>
            ))}
          </div>
        );
      case "dashboard":
        return (
          <div className="bento-visual bento-visual-dashboard">
            <div className="bar" style={{ height: "60%" }} />
            <div className="bar" style={{ height: "85%" }} />
            <div className="bar" style={{ height: "45%" }} />
            <div className="bar" style={{ height: "95%" }} />
            <div className="bar" style={{ height: "70%" }} />
          </div>
        );
      case "sources":
        return (
          <div className="bento-visual bento-visual-sources">
            {["PG", "SF", "BQ", "RS", "MY", "MS", "CSV", "XLS"].map((s) => (
              <div key={s} className="src-chip">
                {s}
              </div>
            ))}
          </div>
        );
      case "team":
        return (
          <div className="bento-visual bento-visual-team">
            <div className="avatar a1">M</div>
            <div className="avatar a2">A</div>
            <div className="avatar a3">+</div>
          </div>
        );
      case "audit":
        return (
          <div className="bento-visual bento-visual-audit">
            <div className="audit-row">
              <span className="dot" /> approved
            </div>
            <div className="audit-row">
              <span className="dot" /> approved
            </div>
            <div className="audit-row">
              <span className="dot" /> approved
            </div>
          </div>
        );
    }
  };

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

    // INR billing is live: promote any waitlist CTA to a real checkout for INR users.
    // USD billing is not yet enabled: demote any paid checkout CTA to waitlist for USD users.
    let effectiveAction = plan.action;
    let effectiveLabel = plan.buttonLabel;
    if (currency === "INR" && plan.action === "waitlist") {
      effectiveAction = "checkout";
      effectiveLabel = "Subscribe";
    } else if (currency === "USD" && plan.action === "checkout") {
      effectiveAction = "waitlist";
      effectiveLabel = "Join waitlist";
    }

    return (
      <motion.article
        key={plan.tier}
        className={`pricing-card${highlight ? " pricing-card-highlight" : ""}`}
        style={{ "--plan-color": plan.color } as CSSProperties}
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.45, delay: idx * 0.06, ease: "easeOut" }}
        whileHover={{ y: -8 }}
        onMouseMove={handleMagneticMove}
      >
        <div className="card-glow" />
        <p className="pricing-tier">{plan.tier}</p>
        <p className="pricing-price">{currency === "INR" ? plan.priceINR : plan.priceUSD}</p>
        <p className="pricing-period">{currency === "INR" ? plan.periodINR : plan.periodUSD}</p>
        <ul className="pricing-features">
          {(currency === "USD" && plan.featuresUSD ? plan.featuresUSD : plan.features).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {effectiveAction === "contact" ? (
          <a className={buttonClass} href={`mailto:${SUPPORT_EMAIL}`}>
            {effectiveLabel}
          </a>
        ) : effectiveAction === "checkout" ? (
          <button type="button" className={buttonClass} onClick={handleCheckout}>
            {effectiveLabel}
          </button>
        ) : effectiveAction === "waitlist" ? (
          <button type="button" className={buttonClass} onClick={() => handleWaitlist(plan.tier)}>
            {effectiveLabel}
          </button>
        ) : (
          <button type="button" className={buttonClass} onClick={() => handlePlanCta("trial")}>
            {effectiveLabel}
          </button>
        )}
      </motion.article>
    );
  };

  return (
    <main className="app-page home-page" ref={mainRef}>
      <motion.div
        className="scroll-progress-bar"
        style={{ scaleX: smoothProgress, opacity: progressOpacity }}
      />

      {/* HERO */}
      <section className="hero" ref={heroRef}>
        <motion.div className="hero-bg" style={{ y: heroOrbY, scale: heroBgScale }}>
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
          <div className="hero-orb hero-orb-3" />
          <div className="hero-grid-lines" />
          <div className="hero-noise" />
        </motion.div>

        <motion.div
          className="hero-content"
          style={{ y: heroContentY, opacity: heroContentOpacity }}
        >
          <motion.div
            className="hero-badge"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <span className="hero-badge-dot" />
            Beta live. Help us improve.
          </motion.div>

          <motion.h1
            className="hero-headline"
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            The{" "}
            <span className="hero-gradient-text">simple and reliable way</span>
            <br />
            to prepare and analyse your data
          </motion.h1>

          <motion.p
            className="hero-description"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.12, ease: "easeOut" }}
          >
            DataHub cleans, transforms, and analyses your CSVs, Excel files, and database tables —
            all in plain English. Every step runs as readable SQL you can review, edit, and replay,
            so you can always trust the result.
          </motion.p>

          <motion.div
            className="hero-demo-bar"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
            whileHover={{ y: -2, boxShadow: "0 20px 60px rgba(124,58,237,0.35)" }}
          >
            <span className="hero-demo-prefix">&gt;</span>
            <span className="hero-demo-inner" style={{ opacity: demoQueryFade ? 1 : 0 }}>
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
              <span className="btn-shine" />
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

          <motion.div
            className="hero-secondary-cta"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.36, ease: "easeOut" }}
          >
            <button
              type="button"
              className="hero-try-link"
              onClick={() => {
                capture("homepage_try_demo_clicked");
                navigate("/try");
              }}
            >
              ▶ Try a live demo — no signup required
            </button>
          </motion.div>

          <motion.div
            className="hero-preview"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
          >
            <div className="preview-window">
              <div className="window-bar">
                <span className="dot red" />
                <span className="dot yellow" />
                <span className="dot green" />
                <span className="window-title">DataHub  /  Trial  /  Project</span>
              </div>
              <div className="ws-preview">
                {/* Icon rail */}
                <div className="ws-rail">
                  <div className="ws-rail-icon active" title="Data">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>
                  </div>
                  <div className="ws-rail-icon" title="Pipelines">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h8M6 8v8M18 8v8"/></svg>
                  </div>
                </div>

                {/* Explorer */}
                <div className="ws-explorer">
                  <div className="ws-project">
                    <span className="ws-project-badge">T</span>
                    <span className="ws-project-name">Trial</span>
                    <span className="ws-chev">v</span>
                  </div>
                  <div className="ws-search">Search datasets...</div>
                  <div className="ws-section-head">DATA <span className="ws-plus">+</span></div>
                  <div className="ws-row">
                    <span className="ws-row-icon" />
                    <span>customers.csv</span>
                  </div>
                  <div className="ws-row active">
                    <span className="ws-row-icon ac" />
                    <span>orders.csv</span>
                  </div>
                  <div className="ws-section-head">ARTIFACTS</div>
                  <div className="ws-row live">
                    <span className="ws-live-dot" />
                    <span>LIVE  revenue_by_region</span>
                  </div>
                  <div className="ws-section-head">VISUALIZATIONS</div>
                  <div className="ws-row muted">Sales by region</div>
                </div>

                {/* Canvas */}
                <div className="ws-canvas">
                  <div className="ws-tabs">
                    <span className="ws-tab active" title="Data">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>
                    </span>
                    <span className="ws-tab"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h6a4 4 0 0 1 4 4v6"/></svg></span>
                    <span className="ws-tab"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20V10M10 20V4M16 20v-8M22 20h-22"/></svg></span>
                    <span className="ws-tab"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>
                    <span className="ws-export">Export v</span>
                  </div>
                  <div className="ws-canvas-body">
                    <div className="ws-step-pill">
                      <span className="ws-step-dot" /> Step 3 / 3 - Group by region
                      <span className="ws-step-meta">12,575 rows</span>
                    </div>
                    <div className="ws-chart">
                      <div className="ws-bar" style={{ height: "55%" }} />
                      <div className="ws-bar" style={{ height: "82%" }} />
                      <div className="ws-bar" style={{ height: "40%" }} />
                      <div className="ws-bar" style={{ height: "92%" }} />
                      <div className="ws-bar" style={{ height: "68%" }} />
                      <div className="ws-bar" style={{ height: "76%" }} />
                    </div>
                    <div className="ws-table-strip">
                      <div className="ws-th"><span /><span /><span /><span /></div>
                      <div className="ws-tr"><span /><span /><span /><span /></div>
                      <div className="ws-tr"><span /><span /><span /><span /></div>
                      <div className="ws-tr"><span /><span /><span /><span /></div>
                    </div>
                  </div>
                </div>

                {/* Pipeline */}
                <div className="ws-pipeline">
                  <div className="ws-pipe-head">PIPELINE</div>
                  <div className="ws-pipe-section">APPLIED STEPS</div>
                  <div className="ws-pipe-row source">
                    <span className="ws-pipe-icon">S</span> Source
                  </div>
                  <div className="ws-pipe-row">
                    <span className="ws-pipe-num">1</span> Drop nulls (email)
                    <span className="ws-pipe-tag ok">OK</span>
                  </div>
                  <div className="ws-pipe-row">
                    <span className="ws-pipe-num">2</span> Join orders
                    <span className="ws-pipe-tag ok">OK</span>
                  </div>
                  <div className="ws-pipe-row running">
                    <span className="ws-pipe-num">3</span> Group by region
                    <span className="ws-pipe-tag run">RUN</span>
                  </div>
                  <div className="ws-pipe-cta">
                    <span className="ws-play">&#9654;</span> Run Applied Steps
                  </div>
                </div>

                {/* AI agent */}
                <div className="ws-ai">
                  <div className="ws-ai-head">
                    <span className="ws-ai-dot" /> AI Agent
                  </div>
                  <div className="ws-ai-msg user">
                    Show revenue by region
                  </div>
                  <div className="ws-ai-msg ai">
                    Joined orders, grouped by region. Ready to chart.
                  </div>
                  <div className="ws-ai-input">Ask in plain English...</div>
                </div>
              </div>
            </div>
            <div className="preview-glow" />
          </motion.div>
        </motion.div>
      </section>

      {/* MARQUEE */}
      <section className="marquee-section">
        <div className="marquee-label">Connects to</div>
        <div className="marquee">
          <div className="marquee-track">
            {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
              <span key={`${item}-${i}`} className="marquee-item">
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* HOW */}
      <section id="how" className="section section-how">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
        >
          <p className="section-eyebrow">Workflow</p>
          <h2 className="section-title">
            From raw data to trusted analysis{" "}
            <span className="hero-gradient-text">in four steps</span>
          </h2>
          <p className="section-subtitle">
            Every SQL action is transparent, reviewable, and replayable. You stay in control end to end.{" "}
            <Link to="/docs" style={{ color: "#a78bfa", textDecoration: "underline" }}>Read the full documentation →</Link>
          </p>
        </motion.div>

        <div className="how-grid">
          {howSteps.map((s, i) => (
            <motion.article
              key={s.step}
              className="how-card"
              style={{ "--step-color": s.color } as CSSProperties}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.1, ease: "easeOut" }}
              whileHover={{ y: -8 }}
              onMouseMove={handleMagneticMove}
            >
              <div className="card-glow" />
              <div className="how-step-number">{s.step}</div>
              <div className="how-step-icon">{s.icon}</div>
              <h3 className="how-step-title">{s.title}</h3>
              <p className="how-step-description">{s.description}</p>
            </motion.article>
          ))}
        </div>
      </section>

      {/* FEATURES BENTO */}
      <section className="section section-features">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
        >
          <p className="section-eyebrow">Capabilities</p>
          <h2 className="section-title">
            One platform for data transformation,{" "}
            <span className="hero-gradient-text">SQL pipelines &amp; dashboards</span>
          </h2>
          <p className="section-subtitle">
            Built for the messy, real-world data that breaks every other tool.{" "}
            <Link to="/pricing" style={{ color: "#a78bfa", textDecoration: "underline" }}>Compare plans →</Link>
          </p>
        </motion.div>

        <div className="bento-grid">
          {features.map((f, i) => (
            <motion.article
              key={f.title}
              className={`bento-card bento-${f.span}`}
              style={{ "--feat-color": f.color } as CSSProperties}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: "easeOut" }}
              whileHover={{ y: -6 }}
              onMouseMove={handleMagneticMove}
            >
              <div className="card-glow" />
              <div className="bento-content">
                <div className="feature-icon">{f.icon}</div>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-description">{f.description}</p>
              </div>
              {renderFeatureVisual(f.visual)}
            </motion.article>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="section section-pricing">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
        >
          <p className="section-eyebrow">Pricing</p>
          <h2 className="section-title">
            Simple,{" "}
            <span className="hero-gradient-text">transparent</span> pricing
          </h2>
          <p className="section-subtitle">
            Start free. Upgrade when your team is ready. No surprises.
          </p>
        </motion.div>

        <div className="pricing-grid">
          {plans.map((plan, idx) => renderPricingCard(plan, idx))}
        </div>
      </section>

      {/* MYTHS */}
      <section className="section section-myths">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
        >
          <p className="section-eyebrow">Why DataHub is different</p>
          <h2 className="section-title">Common concerns about AI data tools &amp; SQL automation</h2>
          <p className="section-subtitle">
            We built DataHub specifically to address every one of these.
          </p>
        </motion.div>

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

      {/* REVIEWS */}
      <section className="section section-reviews">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
        >
          <p className="section-eyebrow">Reviews</p>
          <h2 className="section-title">What early users are saying</h2>
        </motion.div>

        {approvedReviews.length > 0 ? (
          <div className="reviews-grid">
            {approvedReviews.slice(0, 6).map((r, i) => (
              <motion.article
                key={r.id}
                className="review-card"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                whileHover={{ y: -4 }}
                onMouseMove={handleMagneticMove}
              >
                <div className="card-glow" />
                <div className="review-stars">
                  {Array.from({ length: 5 }).map((_, k) => (
                    <span key={k} className={k < r.rating ? "star filled" : "star"}>
                      *
                    </span>
                  ))}
                </div>
                <p className="review-body">&quot;{r.body}&quot;</p>
                <p className="review-author">
                  <strong>{r.name}</strong>
                  {r.role ? <span className="review-role"> &middot; {r.role}</span> : null}
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
              Thank you. Your review has been submitted for moderation.
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
                    *
                  </button>
                ))}
              </div>
              <textarea
                className="form-textarea"
                placeholder="Tell us what worked, what did not, what you would love to see..."
                rows={4}
                value={reviewBody}
                onChange={(e) => setReviewBody(e.target.value)}
                required
              />
              {reviewError ? <div className="form-error">{reviewError}</div> : null}
              <button type="submit" className="btn-primary-lg" disabled={reviewSubmitting}>
                <span className="btn-shine" />
                {reviewSubmitting ? "Submitting..." : "Submit review"}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* FEEDBACK */}
      <section id="feedback" className="section section-feedback">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
        >
          <p className="section-eyebrow">Get in touch</p>
          <h2 className="section-title">Have feedback or a question?</h2>
          <p className="section-subtitle">
            We read everything. Tell us what you need: feature, bug, integration, or anything else.
          </p>
        </motion.div>

        <div className="feedback-card">
          {successName ? (
            <div className="form-success">
              Thanks, {successName}. We will get back to you shortly.
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
                placeholder="Your message..."
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
              {validationError ? <div className="form-error">{validationError}</div> : null}
              {requestError ? <div className="form-error">{requestError}</div> : null}
              <button type="submit" className="btn-primary-lg" disabled={isSubmitting}>
                <span className="btn-shine" />
                {isSubmitting ? "Sending..." : "Send message"}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="section section-cta">
        <motion.div
          className="cta-card"
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
        >
          <div className="cta-glow" />
          <h2 className="home-cta-title">
            Ready to ship{" "}
            <span className="hero-gradient-text">clean data?</span>
          </h2>
          <p className="cta-sub">Start free in seconds. No credit card. Upgrade anytime.</p>
          <div className="hero-buttons">
            <motion.button
              type="button"
              className="btn-primary-lg"
              onClick={handleGetStarted}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              <span className="btn-shine" />
              Get started free
            </motion.button>
            <a className="btn-ghost-lg" href={`mailto:${SUPPORT_EMAIL}`}>
              Talk to us
            </a>
          </div>
        </motion.div>
      </section>

      {/* FOOTER */}
      <footer className="home-footer">
        <div className="footer-grid">
          <div>
            <p className="footer-brand">DataHub</p>
            <p className="footer-tag">Ask in plain English. See every step. Ship trusted analysis.</p>
          </div>
          <div className="footer-links">
            <Link className="footer-link" to="/pricing">Pricing</Link>
            <Link className="footer-link" to="/docs">Docs</Link>
            <Link className="footer-link" to="/privacy">Privacy</Link>
            <Link className="footer-link" to="/terms">Terms</Link>
            <a className="footer-link" href={`mailto:${SUPPORT_EMAIL}`}>Contact</a>
          </div>
        </div>
        <p className="footer-copy">
          (c) {new Date().getFullYear()} DataHub. All rights reserved.
        </p>
      </footer>

      {/* WAITLIST MODAL */}
      {waitlistModal && (
        <div className="modal-backdrop" onClick={() => setWaitlistModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Join the {waitlistModal.plan} waitlist</h3>
            <p className="modal-sub">We will let you know the moment it is available.</p>
            {waitlistDone ? (
              <div className="form-success">You are on the list. Talk soon.</div>
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
                  <span className="btn-shine" />
                  {waitlistSubmitting ? "Joining..." : "Join waitlist"}
                </button>
              </form>
            )}
            <button
              type="button"
              className="modal-close"
              onClick={() => setWaitlistModal(null)}
              aria-label="Close"
            >
              x
            </button>
          </div>
        </div>
      )}

      {showWaitlistToast && (
        <div className="toast">
          You are on the waitlist. We will be in touch.
        </div>
      )}
    </main>
  );
}
