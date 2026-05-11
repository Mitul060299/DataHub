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
        Your data is stored on industry-standard cloud infrastructure using managed relational
        database, object storage, and application-hosting services. All storage is encrypted in
        transit via TLS 1.2+ and at rest using AES-256. We implement row-level security, token-based
        authentication, and strict access controls. Account data is retained while your account is
        active and deleted within 30 days of account deletion. Payment records are retained for
        7 years as required by law.
      </Section>

      <Section title="5. Cookies and Tracking">
        We use essential cookies for authentication and session management, analytics cookies for
        usage tracking to improve the product, and preference cookies for UI settings. You can
        disable non-essential cookies via your browser settings. Disabling essential cookies will
        prevent you from logging in.
      </Section>

      <Section title="6. Third-Party Service Providers">
        We work with carefully selected third-party providers to deliver the Service. These providers
        fall into the following categories, each bound by confidentiality obligations and appropriate
        data-processing agreements:<br /><br />
        <strong>Cloud hosting and infrastructure</strong> — to host the application, serve the
        frontend, and store your files securely.<br /><br />
        <strong>Database and authentication</strong> — to store your account information and
        authenticate you securely.<br /><br />
        <strong>AI inference</strong> — to process natural-language requests. We send only the
        minimum data necessary for the request. Your data is <strong>not used to train any AI
        model</strong> and is not retained by AI providers beyond the duration of a single
        request.<br /><br />
        <strong>Payment processing</strong> — to handle subscriptions and billing. Card numbers
        are handled entirely by our payment processors and never touch our servers.<br /><br />
        <strong>Product analytics</strong> — to understand how users interact with the product
        so we can improve it. No personally identifiable file content is sent to analytics
        services.<br /><br />
        <strong>Email delivery</strong> — to send transactional emails (password resets, billing
        receipts, product updates).<br /><br />
        <strong>Provider changes:</strong> We may add, change, or remove providers as the Service
        evolves. We will notify registered users of material changes by email at least 14 days before
        they take effect. Enterprise customers may request our full subprocessor list by emailing
        mitul.srivastava000@gmail.com. We do not share your data with any third party outside these
        categories without your explicit consent.
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
        Indian users' file and database data is stored in data centres located within India, consistent
        with India's Digital Personal Data Protection Act 2023 (DPDP). Some supporting services
        (authentication, AI inference, email delivery) involve processing in the United States. These
        providers operate under Standard Contractual Clauses or equivalent data-transfer
        mechanisms.<br /><br />
        <strong>For EU/UK users (GDPR):</strong> Transfers outside the EEA are made under appropriate
        safeguards. EU-region storage is on our roadmap for enterprise customers who require
        contractual data residency guarantees. To request a Data Processing Agreement (DPA), contact
        mitul.srivastava000@gmail.com.<br /><br />
        <strong>For California users (CCPA):</strong> We do not sell your personal information. Your
        rights under CCPA are described in Section 7.
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
