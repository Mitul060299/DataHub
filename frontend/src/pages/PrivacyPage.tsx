import { Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO";

export function PrivacyPage() {
  useSEO({
    title: "Privacy Policy – datahub.org.in",
    description:
      "datahub.org.in Privacy Policy. Understand how we collect, use, store, and protect your personal information and data.",
    canonical: "https://datahub.org.in/privacy",
  });
  return (
    <div style={{ height: "100vh", overflowY: "auto", background: "var(--bg0)" }}>
    <div
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "48px 24px",
        color: "var(--tx)",
        lineHeight: 1.7,
      }}
    >
      <Link
        to="/"
        style={{
          color: "var(--tx1)",
          fontSize: 13,
          textDecoration: "none",
          display: "inline-block",
          marginBottom: 32,
        }}
      >
        ← Back to datahub.org.in
      </Link>

      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Privacy Policy</h1>
      <p style={{ color: "var(--tx1)", fontSize: 13, marginBottom: 40 }}>
        Last updated: April 5, 2026 · Effective: April 5, 2026
      </p>

      <Section title="1. Introduction">
        DataHub is committed to protecting your privacy. This policy explains how we collect, use,
        store, and share information when you use datahub.org.in. By using DataHub, you agree to the
        collection and use of information as described here.
      </Section>

      <Section title="2. Information We Collect">
        <strong>Account information:</strong> Name, email address, password (hashed, never stored in
        plain text), and primary role.<br /><br />
        <strong>Data you upload:</strong> Files (CSV, Excel, JSON, Parquet), database connection
        credentials (encrypted at rest), pipeline configurations, and visualizations.<br /><br />
        <strong>Payment information:</strong> Billing details processed by Razorpay (India) or Dodo
        Payments (international). We do not store card numbers — these are handled entirely by our
        payment processors.<br /><br />
        <strong>Usage data:</strong> Features used, pages visited, session data collected via PostHog
        analytics, server logs, and IP addresses.
      </Section>

      <Section title="3. How We Use Your Information">
        We use your information to provide, operate, and improve DataHub; process payments and manage
        subscriptions; send transactional emails; respond to support requests; monitor for security
        threats; and comply with legal obligations.<br /><br />
        <strong>We do not:</strong> sell your personal data, use your uploaded data to train AI models,
        use your data for advertising, or share your data with third parties except as described in this
        policy.
      </Section>

      <Section title="4. Data Storage and Security">
        Your data is stored on Supabase PostgreSQL, AWS S3 (Mumbai region for Indian users), and
        Render application servers. Frontend assets are served from Vercel's global CDN. All data is
        encrypted in transit via TLS 1.2+ and at rest using AES-256. We implement row-level security,
        JWT authentication, and access controls. Account data is retained while your account is
        active and deleted within 30 days of account deletion. Payment records are retained for
        7 years as required by law. <strong>Naming our subprocessors here is a transparency and
        compliance practice required by GDPR, CCPA, and India's DPDP Act 2023 — it does not weaken
        the security of your data.</strong>
      </Section>

      <Section title="5. Cookies and Tracking">
        We use essential cookies for authentication and session management (Supabase), analytics cookies
        via PostHog for usage tracking, and preference cookies for UI settings. You can disable
        non-essential cookies via your browser settings. Disabling essential cookies will prevent you
        from logging in.
      </Section>

      <Section title="6. Third-Party Service Providers (Subprocessors)">
        We use the following third-party providers to deliver the Service. Each is bound by
        confidentiality, security, and data-processing obligations under written agreements or their
        published Data Processing Addenda:<br /><br />
        <strong>Infrastructure & storage:</strong> Vercel Inc. (frontend hosting and CDN), Render
        Services Inc. (backend application servers), Amazon Web Services Inc. (file storage — S3,
        Mumbai region for Indian users), Supabase Inc. (PostgreSQL database and authentication).
        <br /><br />
        <strong>AI inference:</strong> Groq Inc. We send only the prompts and data necessary for the
        request. Per Groq's terms, your data is <strong>not used to train any model</strong> and is
        not retained beyond the duration of the inference request.<br /><br />
        <strong>Payments:</strong> Razorpay Software Pvt. Ltd. (Indian payments), Dodo Payments
        (international payments). Card numbers are handled entirely by these processors and never
        touch our servers.<br /><br />
        <strong>Operational:</strong> PostHog Inc. (product analytics), Resend Inc. (transactional
        email).<br /><br />
        <strong>Subprocessor changes:</strong> We may add, change, or remove subprocessors as the
        Service evolves. We will notify registered users of material changes by email at least 14 days
        before they take effect, giving you the opportunity to terminate your subscription if you
        object. We do not share your data with any third party outside this list without your
        consent.
      </Section>

      <Section title="7. Your Rights">
        You have the right to access, correct, delete, and export your personal data at any time from
        Settings.<br /><br />
        <strong>EU/UK users (GDPR):</strong> You additionally have the right to object to processing,
        restrict processing, and lodge a complaint with your local data protection authority. Our lawful
        basis for processing is contract performance, legitimate interests, and legal
        obligation.<br /><br />
        <strong>California users (CCPA):</strong> We do not sell personal information. You have the
        right to know what data is collected and request its deletion.<br /><br />
        To exercise any rights, contact mitul.srivastava000@gmail.com.
      </Section>

      <Section title="8. Children's Privacy">
        DataHub is not directed at children under 18. We do not knowingly collect personal information
        from children. Contact us if you believe a child has provided data and we will delete it.
      </Section>

      <Section title="9. International Data Transfers">
        Your data is stored primarily on AWS S3 in the Asia Pacific (Mumbai, India) region
        (ap-south-1). Indian users' data remaining in India is fully consistent with India's Digital
        Personal Data Protection Act 2023 (DPDP).<br /><br />
        Application servers run on Render.com (United States). Authentication and database services run
        on Supabase (United States). AI inference is handled by Groq (United States). These providers
        are bound by data processing agreements.<br /><br />
        <strong>For EU/UK users (GDPR):</strong> Transfers to India and the United States are made
        under appropriate safeguards. AWS has Standard Contractual Clauses (SCCs) in place covering
        all regions including Mumbai. Our other US-based processors (Supabase, Render, Groq) operate
        under Standard Contractual Clauses. EU-region storage is on our roadmap for enterprise
        customers who require contractual data residency guarantees. To request a Data Processing
        Agreement (DPA), contact mitul.srivastava000@gmail.com.<br /><br />
        <strong>For California users (CCPA):</strong> We do not sell your personal information. No US
        law requires your data to remain within the United States for SaaS products. Your rights under
        CCPA are described in Section 7.
      </Section>

      <Section title="10. Changes to This Policy">
        We will notify you of material changes via email at least 14 days before they take effect.
      </Section>

      <Section title="11. Contact">
        For privacy questions or to exercise your rights, email{" "}
        <a href="mailto:mitul.srivastava000@gmail.com" style={{ color: "#5B6AF0" }}>
          mitul.srivastava000@gmail.com
        </a>
        . EU/UK users may also contact their local data protection authority.
      </Section>
    </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{title}</h2>
      <p style={{ fontSize: 14, color: "var(--tx1)", margin: 0 }}>{children}</p>
    </div>
  );
}
