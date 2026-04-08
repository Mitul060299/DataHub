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
      "Share workspaces, collaborate on pipelines, assign roles. Version history shows who changed what and when.",
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
  priceUSD: string;
  priceINR: string;
  periodUSD: string;
  periodINR: string;
  features: string[];
  buttonLabel: string;
  buttonStyle: "ghost" | "blue" | "primary" | "amber" | "dark";
  action: "trial" | "contact" | "waitlist" | "checkout";
  popular?: boolean;
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
      "2 projects",
      "50 AI messages/month",
      "50 MB file size",
      "100 MB storage",
      "1 team member",
      "0 scheduled pipelines",
      "2 canvases",
      "Unlimited visualizations",
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
    priceUSD: "$79",
    priceINR: "\u20b93,299",
    periodUSD: "/month",
    periodINR: "/month",
    features: [
      "Unlimited projects",
      "500 AI messages/month",
      "1 GB file size",
      "20 GB storage",
      "1 team member",
      "5 scheduled pipelines",
      "20 canvases",
      "Unlimited visualizations",
      "DB connections: PostgreSQL, MySQL, SQLite, MSSQL, Oracle (coming soon)",
      "Email support",
    ],
    buttonLabel: "Start free trial",
    buttonStyle: "blue",
    action: "checkout",
  },
  {
    tier: "Team",
    color: "#5B6AF0",
    priceUSD: "$149",
    priceINR: "\u20b96,199",
    periodUSD: "/month",
    periodINR: "/month",
    features: [
      "Unlimited projects",
      "Unlimited AI messages",
      "1 GB file size",
      "100 GB storage",
      "10 team members",
      "20 scheduled pipelines",
      "Unlimited canvases",
      "Unlimited visualizations",
      "DB connections: + Snowflake, Redshift, BigQuery (coming soon)",
      "Audit log",
      "Priority email support",
    ],
    buttonLabel: "Join waitlist",
    buttonStyle: "primary",
    action: "waitlist",
    popular: true,
  },
  {
    tier: "Business",
    color: "#eab308",
    priceUSD: "$399",
    priceINR: "\u20b916,599",
    periodUSD: "/month",
    periodINR: "/month",
    features: [
      "Unlimited projects",
      "Unlimited AI messages",
      "1 GB file size",
      "500 GB storage",
      "50 team members",
      "Unlimited scheduled pipelines",
      "Unlimited canvases",
      "Unlimited visualizations",
      "DB connections: + Custom connectors (coming soon)",
      "Audit log",
      "SSO / SAML (coming soon)",
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
      "Unlimited everything",
      "Custom storage",
      "Unlimited team members",
      "Custom DB connections (coming soon)",
      "White-label option (coming soon)",
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

const feedbackTags = ["Feature requests", "Bug reports", "Integration ideas", "General feedback"];

const metricsStrip = [
  { number: "10+", label: "Countries served" },
  { number: "Free", label: "Forever tier" },
  { number: "0", label: "Lines of code" },
  { number: "100%", label: "Audit trail" },
];

export function HomePage() {
  const navigate = useNavigate();
  const { session } = useAuth();

  const mainRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ container: mainRef });

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

  // Geo-based currency (display only — no payment logic)
  const [currency, setCurrency] = useState<"USD" | "INR">("USD");
  const [showWaitlistToast, setShowWaitlistToast] = useState(false);

  // Animated demo queries in hero input bar
  const DEMO_QUERIES = [
    "Remove duplicates and fill nulls with averages",
    "Show revenue by region as a bar chart",
    "Join with customers table on customer_id",
    "Flag rows where revenue exceeds the monthly average",
    "Export cleaned data to Google Sheets",
  ];
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

  const handleWaitlist = () => {
    setShowWaitlistToast(true);
    setTimeout(() => setShowWaitlistToast(false), 4000);
  };

  const handleCheckout = () => {
    navigate(session ? "/settings/billing" : "/signup");
  };

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

  return (
    <main className="app-page home-page" ref={mainRef}>
      <motion.div
        className="scroll-progress-bar"
        style={{ scaleX: scrollYProgress }}
      />
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
              Beta Live - Help us Improve
            </div>

            <motion.h1
              className="hero-title"
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
            >
              Your data,
              <br />
              <span className="hero-title-gradient">understood</span>
              <br />
              by AI
            </motion.h1>

            <motion.p
              className="hero-subtitle"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.12, ease: "easeOut" }}
            >
              Talk to your data in plain English. DataHub&apos;s AI agent cleans, transforms, and visualises — recording every
              step so your work is always auditable, repeatable, and shareable.
            </motion.p>

            <motion.div
              className="hero-actions"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.24, ease: "easeOut" }}
            >
              <motion.button
                type="button" className="hero-primary-btn" onClick={handleGetStarted}
                whileHover={{ scale: 1.04, backgroundColor: "#4b59dc" }}
                whileTap={{ scale: 0.97 }}
              >
                ▶ Get started free
              </motion.button>
              <motion.button
                type="button" className="hero-ghost-btn" onClick={handleScrollHow}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                See how it works ↓
              </motion.button>
            </motion.div>
            <motion.p
              style={{ marginTop: 10, fontSize: 11, color: "#44445a" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.38 }}
            >No credit card required · Free tier forever</motion.p>
          </div>

          <motion.div
            className="hero-window-wrap"
            initial={{ opacity: 0, y: 36 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
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

              <div style={{ display: "grid", gridTemplateColumns: "148px 1fr 200px", height: "260px" }}>
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

                {/* ── Data Table Panel ── */}
                <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid #22222a", overflow: "hidden" }}>
                  {/* Table toolbar */}
                  <div style={{ height: "28px", background: "#18181e", borderBottom: "1px solid #22222a", display: "flex", alignItems: "center", padding: "0 10px", gap: "6px", flexShrink: 0 }}>
                    <span style={{ fontSize: "9px", fontWeight: 600, color: "#818cf8" }}>sales_q4.csv</span>
                    <span style={{ marginLeft: "auto", fontSize: "8px", color: "#34d399" }}>844 rows</span>
                  </div>
                  {/* Column headers */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 52px 44px", background: "#0d0d11", borderBottom: "1px solid #22222a", flexShrink: 0 }}>
                    {["Region", "Revenue", "Date", "Status"].map((h) => (
                      <div key={h} style={{ padding: "3px 6px", fontSize: "8px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#44445a", borderRight: "1px solid #22222a" }}>{h}</div>
                    ))}
                  </div>
                  {/* Rows */}
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    {[
                      ["North", "₹1,24,000", "Jan 24", "✓", "#818cf8", "#22c55e", false],
                      ["South", "₹98,500",  "Jan 24", "✓", "#a0a0bc", "#22c55e", false],
                      ["South", "₹98,500",  "Jan 24", "dup", "#2e2e3a", "#f87171", true],
                      ["West",  "—",         "Jan 24", "null", "#2e2e3a", "#f87171", false],
                      ["East",  "₹2,01,300", "Jan 24", "✓", "#a0a0bc", "#22c55e", false],
                    ].map(([region, revenue, date, status, regionColor, statusColor, isDup], i) => (
                      <div
                        key={i}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 52px 44px",
                          borderBottom: "1px solid #22222a",
                          opacity: isDup ? 0.3 : 1,
                          background: isDup ? "rgba(248,113,113,0.04)" : "transparent",
                          textDecoration: isDup ? "line-through" : "none",
                        }}
                      >
                        <div style={{ padding: "4px 6px", fontSize: "9px", color: regionColor as string, fontFamily: "monospace", borderRight: "1px solid #22222a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{region as string}</div>
                        <div style={{ padding: "4px 6px", fontSize: "9px", color: "#8888a0", fontFamily: "monospace", borderRight: "1px solid #22222a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{revenue as string}</div>
                        <div style={{ padding: "4px 6px", fontSize: "9px", color: "#44445a", fontFamily: "monospace", borderRight: "1px solid #22222a" }}>{date as string}</div>
                        <div style={{ padding: "4px 6px", fontSize: "9px", color: statusColor as string, fontFamily: "monospace" }}>{status as string}</div>
                      </div>
                    ))}
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
                    <span style={{
                      flex: 1,
                      fontSize: "10px",
                      color: "#818cf8",
                      fontStyle: "italic",
                      opacity: demoQueryFade ? 1 : 0,
                      transition: "opacity 0.35s ease",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}>
                      {DEMO_QUERIES[demoQueryIdx]}
                    </span>
                    <div style={{ width: 20, height: 20, borderRadius: "4px", background: "rgba(91,106,240,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: "#818cf8" }}>↑</div>
                  </div>
                </div>
              </div>
            </div>

            <motion.div
              className="hero-status-badge hero-status-cleaned"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.7 }}
              style={{ y: 0 }}
              whileInView={{ y: [0, -7, 0] }}
              viewport={{ once: false }}
            >
              <span className="hero-badge-dot hero-badge-dot-green" />
              847 rows cleaned
            </motion.div>
            <motion.div
              className="hero-status-badge hero-status-recorded"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.9 }}
            >
              <span className="hero-badge-dot hero-badge-dot-indigo" />
              3 steps recorded · replayable
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Trust metrics strip ── */}
      <section className="metrics-strip-section">
        <div className="metrics-strip">
          {metricsStrip.map((item, i) => (
            <motion.div
              key={item.label}
              className="metrics-item"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.38, delay: i * 0.08, ease: "easeOut" }}
            >
              <span className="metrics-number">{item.number}</span>
              <span className="metrics-label">{item.label}</span>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="how" className="home-section">
        <div className="home-inner">
          <motion.p
            className="section-label"
            initial={{ opacity: 0, x: -18 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.38, ease: "easeOut" }}
          >How it works</motion.p>
          <motion.h2
            className="section-title"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
          >From messy data to decisions in four steps</motion.h2>
          <motion.p
            className="section-subtitle"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.16, ease: "easeOut" }}
          >
            No SQL. No Python. No BI team needed. Just describe what you want — the agent handles the rest, with a full audit trail.
          </motion.p>

          <div className="how-grid">
            {howSteps.map((step, i) => (
              <motion.article
                key={step.step}
                className="how-card"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.45, delay: i * 0.09, ease: "easeOut" }}
                whileHover={{ y: -3, transition: { duration: 0.18 } }}
              >
                <p className="how-step">{step.step}</p>
                <div className="how-icon-wrap" style={{ background: `${step.color}1A` }}>
                  {step.icon}
                </div>
                <h3 className="how-title">{step.title}</h3>
                <p className="how-description">{step.description}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="home-inner">
          <motion.p
            className="section-label"
            initial={{ opacity: 0, x: -18 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.38, ease: "easeOut" }}
          >Features</motion.p>
          <motion.h2
            className="section-title"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
          >Everything your data team needs</motion.h2>
          <motion.p
            className="section-subtitle"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.16, ease: "easeOut" }}
          >
            Built for analysts who want the power of a data engineer without writing a single line of code.
          </motion.p>

          <div className="features-grid">
            {features.map((feature, i) => (
              <motion.article
                key={feature.title}
                className="feature-card"
                style={{ "--feature-color": feature.color } as CSSProperties}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: i * 0.07, ease: "easeOut" }}
                whileHover={{ y: -4, borderColor: `${feature.color}55`, transition: { duration: 0.18 } }}
              >
                <div className="feature-icon-wrap" style={{ background: `${feature.color}1A` }}>
                  {feature.icon}
                </div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-description">{feature.description}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Branching Pipeline DAG section ── */}
      <section className="home-section" style={{ background: "#08080d" }}>
        <div className="home-inner">
          <motion.p
            className="section-label"
            initial={{ opacity: 0, x: -18 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.38, ease: "easeOut" }}
          >Branching Pipelines</motion.p>
          <motion.h2
            className="section-title"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
          >Multi-stream pipelines, not just a list</motion.h2>
          <motion.p
            className="section-subtitle"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.16, ease: "easeOut" }}
          >
            When your analysis splits into parallel streams, DataHub visualises it as a dependency graph —
            just like GitHub Actions workflows. Independent branches run as soon as their inputs are ready;
            join steps wait for all upstream branches automatically.
          </motion.p>
          <div className="pipeline-dag-demo">
            <div className="dag-demo-query">
              &ldquo;Clean the data, then branch — segment customers by region AND calculate monthly revenue trends, finally merge into one summary report.&rdquo;
            </div>
            <div className="dag-demo-graph">
              <div className="dag-row">
                <motion.div
                  className="dag-node dag-node-source"
                  initial={{ opacity: 0, scale: 0.85 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: 0.0 }}
                >1 &middot; Clean sales data</motion.div>
              </div>
              <div className="dag-connectors dag-connectors-fork">
                <span className="dag-line dag-line-left" />
                <span className="dag-line dag-line-right" />
              </div>
              <div className="dag-row">
                <motion.div
                  className="dag-node dag-node-branch"
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: 0.18 }}
                >2 &middot; Segment by region</motion.div>
                <motion.div
                  className="dag-node dag-node-branch"
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: 0.18 }}
                >3 &middot; Revenue trends</motion.div>
              </div>
              <div className="dag-connectors dag-connectors-join">
                <span className="dag-line dag-line-left" />
                <span className="dag-line dag-line-right" />
              </div>
              <div className="dag-row">
                <motion.div
                  className="dag-node dag-node-merge"
                  initial={{ opacity: 0, scale: 0.85 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: 0.36 }}
                >4 &middot; Merge into summary</motion.div>
              </div>
            </div>
            <div className="dag-demo-note">
              Steps 2 and 3 run independently — step 4 starts only when both are done.
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="home-section">
        <div className="home-inner">
          <motion.p
            className="section-label"
            initial={{ opacity: 0, x: -18 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.38, ease: "easeOut" }}
          >Pricing</motion.p>
          <motion.h2
            className="section-title"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
          >Start free, scale when ready</motion.h2>
          <motion.p
            className="section-subtitle"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.16 }}
          >No credit card required. Upgrade when your team needs more.</motion.p>

          <div className="pricing-grid">
            {plans.map((plan, planIdx) => {
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
                  className={`pricing-card ${plan.tier === "Team" ? "pricing-card-team" : ""}`}
                  style={{ "--plan-color": plan.color } as CSSProperties}
                  initial={{ opacity: 0, y: 22 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.42, delay: planIdx * 0.07, ease: "easeOut" }}
                  whileHover={{ y: -6, transition: { duration: 0.2 } }}
                >
                  {plan.popular ? <span className="pricing-popular">Popular</span> : null}
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
                    <button type="button" className={buttonClass} onClick={handleWaitlist}>
                      {plan.buttonLabel}
                    </button>
                  ) : (
                    <button type="button" className={buttonClass} onClick={() => handlePlanCta("trial")}>
                      {plan.buttonLabel}
                    </button>
                  )}
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ──────────────────────────────────────────────────── */}
      <section className="home-cta-section">
        <div className="home-inner home-cta-inner">
          <motion.h2
            className="home-cta-title"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
          >Start analysing your data in 60 seconds</motion.h2>
          <motion.p
            className="home-cta-sub"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
          >Upload a CSV, ask a question, get results. No setup. No SQL. No BI team required.</motion.p>
          <motion.button
            type="button" className="home-cta-btn" onClick={handleGetStarted}
            whileHover={{ scale: 1.04, backgroundColor: "#4b59dc" }}
            whileTap={{ scale: 0.97 }}
          >
            ▶ Try it free &mdash; no credit card needed
          </motion.button>
        </div>
      </section>

      {/* ── Reviews ─────────────────────────────────────────────────────── */}
      <section className="home-section" id="reviews">
        <div className="home-inner">
          <div className="reviews-layout">
            {/* Left — display cards */}
            <div>
              <motion.p
                className="section-label"
                initial={{ opacity: 0, x: -18 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.38, ease: "easeOut" }}
              >User reviews</motion.p>
              <motion.h2
                className="reviews-heading"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
              >What our users say</motion.h2>
              <motion.p
                className="reviews-subheading"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.16, ease: "easeOut" }}
              >
                Real feedback from teams using DataHub every day.
              </motion.p>
              {approvedReviews.length === 0 ? (
                <p className="reviews-empty">No reviews yet — be the first!</p>
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
                      whileHover={{ borderColor: "rgba(91,106,240,0.5)", transition: { duration: 0.15 } }}
                    >
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
                    </motion.div>
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

      <footer style={{ borderTop: "1px solid #1a1a22", padding: "24px 0", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "24px", flexWrap: "wrap", fontSize: "13px", color: "#44445a" }}>
          {([
            { href: "/docs", label: "Documentation" },
            { href: "/terms", label: "Terms of Service" },
            { href: "/privacy", label: "Privacy Policy" },
            { href: "mailto:mitul.srivastava000@gmail.com", label: "Contact" },
          ] as { href: string; label: string }[]).map(({ href, label }) => (
            <a
              key={label}
              href={href}
              style={{ color: "#44445a", textDecoration: "none" }}
              onMouseEnter={(e) => ((e.target as HTMLAnchorElement).style.color = "#9898b0")}
              onMouseLeave={(e) => ((e.target as HTMLAnchorElement).style.color = "#44445a")}
            >
              {label}
            </a>
          ))}
          <span>© {new Date().getFullYear()} DataHub</span>
        </div>
      </footer>

      {showWaitlistToast ? (
        <div
          style={{
            position: "fixed",
            bottom: "28px",
            right: "28px",
            background: "#18181e",
            border: "1px solid rgba(91,106,240,0.4)",
            borderRadius: "12px",
            padding: "14px 18px",
            display: "flex",
            alignItems: "flex-start",
            gap: "10px",
            boxShadow: "0 8px 40px rgba(0,0,0,0.55)",
            zIndex: 9999,
            maxWidth: "340px",
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399", marginTop: 5, flexShrink: 0 }} />
          <div>
            <p style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "#e8e8f0", lineHeight: 1.4 }}>
              You’re on the waitlist!
            </p>
            <p style={{ margin: "3px 0 0", fontSize: "12px", color: "#8888a0", lineHeight: 1.4 }}>
              We’ll notify you when this plan is available.
            </p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
