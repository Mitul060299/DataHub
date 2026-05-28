import { type CSSProperties, type FormEvent, useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { billingEnabled } from "../utils/featureFlags";
import {
  IconBrain,
  IconCheck,
  IconDatabase,
  IconFileText,
  IconGrid,
  IconShare,
  IconShield,
  IconTeam,
  IconUpload,
} from "../components/Icons";
import { useAuth } from "../contexts/AuthContext";
import { submitFeedbackForm, submitReview, getApprovedReviews, type ReviewOut } from "../api";
import { capture } from "../lib/posthog";
import { startTrial as startTrialApi, type BillingPlanSlug } from "../services/billing";
import "./HomePage.css";

/* ===========================================================================
   STATIC CONTENT (ASCII-only)
   =========================================================================== */

const howSteps = [
  {
    step: "01",
    color: "#22c55e",
    icon: <IconUpload size={18} color="#22c55e" />,
    title: "Upload or connect",
    description: "CSV, Excel, JSON, Parquet, or a live database. Ready in under a minute.",
  },
  {
    step: "02",
    color: "#a78bfa",
    icon: <IconBrain size={18} color="#a78bfa" />,
    title: "Ask in plain English",
    description: "\"Remove duplicates.\" \"Join with customers.\" \"Flag outliers.\" No SQL needed.",
  },
  {
    step: "03",
    color: "#facc15",
    icon: <IconCheck size={18} color="#facc15" />,
    title: "Review before it runs",
    description: "See the exact SQL. Approve, edit, or reject. Nothing runs without your OK.",
  },
  {
    step: "04",
    color: "#22d3ee",
    icon: <IconGrid size={18} color="#22d3ee" />,
    title: "Save as a self-running pipeline",
    description: "Schedule it daily, weekly, or monthly. Same approved logic runs itself on new data.",
  },
  {
    step: "05",
    color: "#38bdf8",
    icon: <IconShare size={18} color="#38bdf8" />,
    title: "Share the results",
    description: "Publish a dashboard, push to Power BI / Tableau / Sheets, or export clean files.",
  },
];

type Feature = {
  title: string;
  color: string;
  icon: JSX.Element;
  description: string;
  span: "lg" | "md" | "sm" | "tall";
  visual: "browser" | "instant" | "cost" | "prompt" | "sql" | "approve";
};

const features: Feature[] = [
  {
    title: "Build once. Run every week.",
    color: "#22d3ee",
    icon: <IconGrid size={20} color="#22d3ee" />,
    description: "Save any sequence as a visual pipeline. Schedule it. It re-runs on new data with the same logic you already approved.",
    span: "lg",
    visual: "browser",
  },
  {
    title: "Up and running in under a minute",
    color: "#22c55e",
    icon: <IconFileText size={20} color="#22c55e" />,
    description: "No warehouse, no ETL stack. Drop a file or paste DB credentials — working immediately.",
    span: "md",
    visual: "instant",
  },
  {
    title: "A fraction of the cost",
    color: "#38bdf8",
    icon: <IconGrid size={20} color="#38bdf8" />,
    description: "One tool replaces three or four. Free tier for small teams. No per-seat fees, no overage bills.",
    span: "md",
    visual: "cost",
  },
  {
    title: "No SQL to learn",
    color: "#f59e0b",
    icon: <IconDatabase size={20} color="#f59e0b" />,
    description: "Type what you want. The agent writes the SQL and runs it. Works for analysts and non-technical teammates alike.",
    span: "tall",
    visual: "prompt",
  },
  {
    title: "No black box",
    color: "#ec4899",
    icon: <IconTeam size={20} color="#ec4899" />,
    description: "Every step is readable SQL you can inspect, edit, and replay.",
    span: "sm",
    visual: "sql",
  },
  {
    title: "You stay in control",
    color: "#f87171",
    icon: <IconShield size={20} color="#f87171" />,
    description: "Approve, edit, or reject every step. Full audit log of every change.",
    span: "sm",
    visual: "approve",
  },
];

type PricingPlan = {
  tier: string;
  color: string;
  priceUSD: string;
  priceINR: string;
  periodUSD: string;
  periodINR: string;
  trialBadge?: string; // e.g. "15 days free"
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
      "Solo projects",
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
    trialBadge: "15 days free",
    features: [
      "Solo projects · 1 seat",
      "500 AI messages/month",
      "250 MB file size",
      "5 GB storage",
      "25 GB data scan/month",
      "Files: CSV, Excel, JSON",
      "Database: SQLite",
      "Daily scheduled runs",
      "Email support",
    ],
    buttonLabel: "Start free trial",
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
    trialBadge: "15 days free",
    features: [
      "Solo projects · 1 seat",
      "1,500 AI messages/month",
      "1 GB file size",
      "20 GB storage",
      "100 GB data scan/month",
      "DB: PostgreSQL, MySQL, SQLite, MSSQL, Oracle",
      "S3, GCS, Azure Blob storage",
      "Email support",
    ],
    buttonLabel: "Start free trial",
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
    trialBadge: "15 days free",
    features: [
      "Includes 3 seats. +\u20b91,499/extra seat",
      "Unlimited projects · 10 members per project",
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
      "Unlimited projects · 10 members per project",
      "4,000+ AI messages (scales with seats)",
      "5 GB file size",
      "100 GB+ storage (scales with seats)",
      "500 GB+ data scan/month",
      "Files: CSV, Excel, JSON, Parquet",
      "Databases: PostgreSQL, MySQL, SQLite, MSSQL, Oracle, Snowflake, Redshift, BigQuery",
      "Audit log",
      "Priority email support",
    ],
    buttonLabel: "Start free trial",
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
    trialBadge: "15 days free",
    features: [
      "Includes 5 seats. +\u20b92,499/extra seat",
      "Unlimited projects · 50 members per project",
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
      "Unlimited projects · 50 members per project",
      "15,000+ AI messages (scales with seats)",
      "10 GB file size",
      "500 GB+ storage (scales with seats) · 2 TB+ scan/month",
      "Files: CSV, Excel, JSON, Parquet",
      "Databases: All supported + custom connectors on request",
      "Audit log",
      "SSO / SAML · Webhooks",
      "24/7 dedicated support",
    ],
    buttonLabel: "Start free trial",
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
      "Unlimited projects · unlimited members per project",
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
      "You see the exact SQL before it runs. Approve, edit, or reject. Nothing executes without your OK.",
  },
  {
    myth: 'The AI will hallucinate results or make up numbers.',
    reality:
      "The agent writes SQL. Your data produces the result. No generated rows, no guessing.",
  },
  {
    myth: 'An AI tool can\u2019t replace a reliable scheduled job.',
    reality:
      "Pipelines run on a schedule using the SQL you already approved. Not the AI re-guessing — your saved logic, on fresh data.",
  },
  {
    myth: 'I will lose control once the AI builds it.',
    reality:
      "Every step is a named, editable node in a visual pipeline. Edit, delete, reorder, or re-run from any point. The pipeline is yours.",
  },
  {
    myth: 'My sensitive data is being sent somewhere unsafe.',
    reality:
      "Encrypted, isolated cloud storage. Never used to train AI. Full audit logs of every access.",
  },
  {
    myth: 'It only works on clean, nicely formatted CSVs.',
    reality:
      "Built for messy data. Handles delimiters, encodings, nulls, outliers, duplicates, type mismatches, and multi-sheet Excel.",
  },
];

const feedbackTags = ["Feature requests", "Bug reports", "Integration ideas", "General feedback"];

const DEMO_QUERIES = [
  "Removed 4,200 duplicate rows from a 50,000-row export in 3 seconds",
  "Built a monthly client reporting pipeline — now it runs itself without me",
  "Reconciled April GL export against bank statement — 12 mismatches found",
  "Standardised column names across 30 supplier files automatically",
  "Scheduled: reconcile bank vs GL every Monday at 8am, zero manual steps",
  "Filled missing revenue values with column averages, flagged 6 outliers",
  "Joined orders with customers and exported clean CSV for Power BI",
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
  name: "How to work with DataHub — your AI agent for data work",
  description:
    "Go from a raw CSV, Excel file, or database connection to trusted, shareable results — or save the whole flow as a pipeline that runs itself every week.",
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
        name: "What is DataHub?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "DataHub is your reliable AI agent for data work. Upload CSV, Excel, or connect databases like PostgreSQL or Snowflake, describe what you need in plain English, and DataHub generates readable SQL transformations you approve before they run. Save any sequence as a visual reusable pipeline and schedule it to run daily, weekly, or monthly on fresh data — every step transparent, replayable, and audit-logged.",
        },
      },
      {
        "@type": "Question",
        name: "What file types and databases does DataHub support?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "DataHub supports CSV (with auto-delimiter detection), Excel (.xlsx and .xls, including multi-sheet), JSON, and Parquet file uploads. For databases it connects to PostgreSQL, MySQL, MSSQL, Oracle, SQLite (Starter+), Snowflake, BigQuery, Redshift, and Azure Synapse (Team+).",
        },
      },
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
      {
        "@type": "Question",
        name: "Is there a free plan for DataHub?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. The Free plan costs ₹0/month with no credit card required. It includes 50 AI messages per month, 10 pipeline runs, and 500 MB of storage. Paid plans start at ₹999/month with a 15-day free trial.",
        },
      },
      {
        "@type": "Question",
        name: "How is DataHub different from Excel or Power BI?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Excel requires manual work for every transformation — formulas, VBA, or Power Query. Power BI is a visualisation tool, not a data cleaning tool. DataHub is the AI agent that handles the work before Excel or Power BI — cleaning, joining, and transforming data in plain English, saving every step as a replayable visual pipeline you can schedule to run automatically.",
        },
      },
      {
        "@type": "Question",
        name: "How much cheaper is DataHub compared to Alteryx?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Alteryx Designer costs approximately $5,195 per seat per year. DataHub Team plan at $179/month for 3 seats works out to roughly $716 per seat per year — about 86% cheaper — while covering the same data blending, transformation, and automation workflows.",
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
    title: "DataHub – AI Tool for Analysts | Clean Excel Files, Merge CSVs, Automate Data Work",
    description:
      "Clean messy Excel files, merge multiple CSVs, remove duplicates, and automate repetitive data workflows — DataHub is the AI-powered transformation tool for analysts, accountants, and consultants. No code required.",
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

  // 15-day trial: if signed in, start the trial directly; otherwise route to
  // signup with an intent param so onboarding can resume the flow.
  const handleStartTrial = async (tierName: string) => {
    const slug = tierName.toLowerCase() as BillingPlanSlug;
    if (!session) {
      navigate(`/signup?trial=${slug}`);
      return;
    }
    try {
      const res = await startTrialApi(slug);
      capture("trial_started", { plan: slug, ends_at: res.ends_at });
      // eslint-disable-next-line no-alert
      window.alert(`Your 15-day ${tierName} trial is active. Enjoy!`);
      navigate("/workspace");
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e?.code === "trial_already_used" || e?.code === "subscription_exists") {
        navigate("/settings/billing");
        return;
      }
      // eslint-disable-next-line no-alert
      window.alert(e?.message || "Could not start free trial. Please try again.");
    }
  };

  const handleGetStarted = () => {
    navigate("/signup");
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
      // Identify the visitor in PostHog so session recordings show their name/email
      capture("contact_form_submitted", { $set: { email: trimmedEmail, $email: trimmedEmail, name: trimmedName, $name: trimmedName } });
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
      case "browser":
        return (
          <div className="bento-visual bento-visual-browser">
            <div className="browser-chrome">
              <span className="browser-dot r" />
              <span className="browser-dot y" />
              <span className="browser-dot g" />
              <div className="browser-url">
                <span className="lock">🔒</span> app.datahub.in
              </div>
            </div>
            <div className="browser-body">
              <div className="browser-pill ok">✓ No install needed</div>
              <div className="browser-os">
                <span>macOS</span>
                <span>Windows</span>
                <span>Linux</span>
                <span>ChromeOS</span>
              </div>
            </div>
          </div>
        );
      case "instant":
        return (
          <div className="bento-visual bento-visual-instant">
            <div className="instant-drop">
              <span className="instant-file">📄 sales.csv</span>
              <span className="instant-arrow">→</span>
              <span className="instant-ready">Ready ✓</span>
            </div>
            <div className="instant-meta">
              <span>No warehouse</span>
              <span>·</span>
              <span>No ETL</span>
              <span>·</span>
              <span className="instant-timer">&lt; 60s</span>
            </div>
          </div>
        );
      case "cost":
        return (
          <div className="bento-visual bento-visual-cost">
            <div className="cost-stack">
              <div className="cost-old">
                <div className="cost-old-label">Legacy stack</div>
                <div className="cost-tiles">
                  <span className="cost-tile">BI tool</span>
                  <span className="cost-plus">+</span>
                  <span className="cost-tile">ETL service</span>
                  <span className="cost-plus">+</span>
                  <span className="cost-tile">Modelling layer</span>
                  <span className="cost-plus">+</span>
                  <span className="cost-tile">Per-seat licenses</span>
                </div>
                <div className="cost-old-price">{currency === "INR" ? "₹50,000+ / month" : "$600+ / month"}</div>
              </div>
              <div className="cost-arrow">↓</div>
              <div className="cost-new">
                <div className="cost-new-label">DataHub</div>
                <div className="cost-new-price">One plan · flat fee</div>
              </div>
            </div>
          </div>
        );
      case "prompt":
        return (
          <div className="bento-visual bento-visual-prompt">
            <div className="prompt-msg user">Show top 5 regions by revenue this quarter</div>
            <div className="prompt-arrow">↓ AI writes SQL</div>
            <div className="prompt-msg sql">
              <span className="kw">SELECT</span> region, <span className="kw">SUM</span>(revenue)
              <br />
              <span className="kw">FROM</span> orders
              <br />
              <span className="kw">GROUP BY</span> region <span className="kw">LIMIT</span> 5;
            </div>
          </div>
        );
      case "sql":
        return (
          <div className="bento-visual bento-visual-sql">
            <div className="sql-step">
              <span className="sql-num">01</span>
              <code><span className="kw">SELECT</span> *</code>
            </div>
            <div className="sql-step">
              <span className="sql-num">02</span>
              <code><span className="kw">WHERE</span> date &gt; ...</code>
            </div>
            <div className="sql-step">
              <span className="sql-num">03</span>
              <code><span className="kw">GROUP BY</span> region</code>
            </div>
            <div className="sql-foot">editable · replayable</div>
          </div>
        );
      case "approve":
        return (
          <div className="bento-visual bento-visual-approve">
            <div className="approve-plan">
              <div className="approve-title">AI proposed plan</div>
              <div className="approve-step">› Filter rows where region = 'APAC'</div>
              <div className="approve-step">› Aggregate by month</div>
            </div>
            <div className="approve-actions">
              <span className="btn-approve">Approve</span>
              <span className="btn-edit">Edit</span>
              <span className="btn-reject">Reject</span>
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
        {plan.trialBadge && (
          <span className="pricing-trial-badge">{plan.trialBadge}</span>
        )}
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
          <button type="button" className={buttonClass} onClick={() => handleStartTrial(plan.tier)}>
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

      {!billingEnabled && (
        <div style={{
          background: "linear-gradient(90deg, rgba(91,106,240,0.18), rgba(139,92,246,0.14))",
          borderBottom: "1px solid rgba(91,106,240,0.35)",
          padding: "10px 20px",
          textAlign: "center",
          fontSize: 13,
          color: "#e8e8f0",
          position: "relative",
          zIndex: 5,
        }}>
          <strong>Free during beta.</strong>{" "}
          <span style={{ color: "#b8b8d0" }}>
            DataHub is fully free while we&apos;re finalizing pricing — no card required. {" "}
            <Link to="/pricing" style={{ color: "#a5b3ff", textDecoration: "underline" }}>Planned tiers</Link>.
          </span>
        </div>
      )}

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
            initial={{ y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <span className="hero-badge-dot" />
            Beta live · Try free, no signup
          </motion.div>

          <motion.h1
            className="hero-headline"
            initial={{ y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            Reliable AI for your{" "}
            <span className="hero-gradient-text">data work</span>.
          </motion.h1>

          <motion.p
            className="hero-description"
            initial={{ y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.12, ease: "easeOut" }}
          >
            Analysts spend most of their time preparing data. DataHub does that work —
            transparently, repeatably, and without a single line of code.
          </motion.p>

          <motion.div
            className="hero-demo-bar"
            initial={{ y: 16 }}
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
            initial={{ y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.28, ease: "easeOut" }}
          >
            {/* Primary CTA goes straight to the interactive demo workspace
                — no signup wall. Conversion happens inside the workspace via
                the persistent demo banner + aha-celebration sign-up prompt. */}
            <motion.button
              type="button"
              className="btn-primary-lg"
              onClick={() => {
                capture("homepage_try_demo_clicked", { surface: "hero_primary" });
                sessionStorage.setItem("datahub_signup_intent", JSON.stringify({ source: "demo", sample: "/samples/customers.csv" }));
                navigate("/workspace");
              }}
              onPointerEnter={() => { void import("./WorkspacePage"); }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              <span className="btn-shine" />
              ▶ Try it now — no signup
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
            initial={{ y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.36, ease: "easeOut" }}
          >
            <p className="hero-demo-subtext">
              Full workspace, no email needed. Already have an account?{" "}
              <button
                type="button"
                className="hero-try-link"
                style={{ display: "inline", padding: 0, fontSize: "inherit" }}
                onClick={() => {
                  capture("homepage_signin_clicked", { surface: "hero" });
                  navigate("/login");
                }}
              >
                Sign in
              </button>
            </p>
          </motion.div>

          <motion.div
            className="hero-preview"
            initial={{ y: 60 }}
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

      {/* PROOF METRICS */}
      <section
        aria-label="Product statistics"
        style={{
          borderTop: "1px solid #1e2235",
          borderBottom: "1px solid #1e2235",
          padding: "28px 24px",
          background: "rgba(15,17,26,0.6)",
        }}
      >
        <dl
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "8px 48px",
            margin: 0,
            padding: 0,
            listStyle: "none",
          }}
        >
          {([
            ["30+", "data transformation operations"],
            ["10+", "database & file connectors"],
            ["308", "automated tests in CI"],
            ["100%", "SQL-transparent — no hidden steps"],
            ["Free", "plan available, no credit card"],
          ] as [string, string][]).map(([stat, label]) => (
            <div key={stat} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <dt
                style={{
                  fontSize: "clamp(20px, 3vw, 28px)",
                  fontWeight: 800,
                  color: "#5B6AF0",
                  letterSpacing: "-0.5px",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {stat}
              </dt>
              <dd
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "#64748b",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* PROBLEMS WE SOLVE */}
      <section className="section section-problems">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
        >
          <p className="section-eyebrow">What DataHub solves</p>
          <h2 className="section-title">
            Sound{" "}
            <span className="hero-gradient-text">familiar?</span>
          </h2>
          <p className="section-subtitle">
            Click any card to see how DataHub handles it.
          </p>
        </motion.div>
        <div className="problems-grid">
          {[
            {
              emoji: "🔁",
              title: "Reconciling two Excel files",
              body: "Skip the VLOOKUP. Join on a key and flag every mismatch in seconds.",
              slug: "reconcile-excel-files-automatically",
            },
            {
              emoji: "🗑️",
              title: "Removing duplicates from a CSV",
              body: "Exact and near-duplicates, gone. No formulas required.",
              slug: "remove-duplicates-csv-without-code",
            },
            {
              emoji: "📊",
              title: "Cleaning data for Power BI",
              body: "Fix names, blanks, and dates before import. Save it once as a pipeline.",
              slug: "prepare-raw-data-for-power-bi",
            },
            {
              emoji: "🔤",
              title: "Inconsistent column names",
              body: "\"Customer ID\", \"CustomerID\", \"cust_id\" — all standardised to snake_case automatically.",
              slug: "standardise-column-names-excel",
            },
            {
              emoji: "⏱️",
              title: "Same clean-up every month",
              body: "Save the steps once. Re-run on next month's file in one click.",
              slug: "automate-repetitive-data-cleaning-workflows",
            },
            {
              emoji: "💸",
              title: "Enterprise prices for basic work",
              body: "Dedup, join, clean, validate — at a fraction of legacy ETL pricing.",
              slug: "alteryx-alternative-cheaper",
            },
          ].map((item, i) => (
            <motion.div
              key={item.slug}
              className="problem-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: i * 0.07 }}
            >
              <Link to={`/blog/${item.slug}`} className="problem-card-link">
                <span className="problem-emoji">{item.emoji}</span>
                <h3 className="problem-title">{item.title}</h3>
                <p className="problem-body">{item.body}</p>
                <span className="problem-cta">See how it works →</span>
              </Link>
            </motion.div>
          ))}
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
            From raw data to a pipeline{" "}
            <span className="hero-gradient-text">that runs itself</span>
          </h2>
          <p className="section-subtitle">
            Five reviewable steps. Every SQL action is transparent and replayable. Save the whole flow as a pipeline and schedule it to run on its own.{" "}
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

        {/* Inline mid-page CTA — keep the demo one click away even after scrolling */}
        <motion.div
          style={{ display: "flex", justifyContent: "center", marginTop: 48 }}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4 }}
        >
          <motion.button
            type="button"
            className="btn-primary-lg"
            onClick={() => {
              capture("homepage_try_demo_clicked", { surface: "mid_page_how" });
              sessionStorage.setItem("datahub_signup_intent", JSON.stringify({ source: "demo", sample: "/samples/customers.csv" }));
              navigate("/workspace");
            }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
          >
            <span className="btn-shine" />
            ▶ Try it now — no signup
          </motion.button>
        </motion.div>
      </section>

      {/* SECTIONS BELOW REMOVED — features bento, pricing, myths, reviews, feedback, details links. */}

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
            <Link className="footer-link" to="/blog">Blog</Link>
            <Link className="footer-link" to="/changelog">Changelog</Link>
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
