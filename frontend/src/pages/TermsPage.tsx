import { Link } from "react-router-dom";

export function TermsPage() {
  return (
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
        ← Back to DataHub
      </Link>

      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Terms of Service</h1>
      <p style={{ color: "var(--tx1)", fontSize: 13, marginBottom: 40 }}>
        Last updated: March 29, 2026 · Effective: April 1, 2026
      </p>

      <Section title="1. Agreement to Terms">
        By accessing or using DataHub ("Service", "Platform"), you agree to be bound by these Terms of
        Service. If you do not agree, do not use DataHub. DataHub is operated by Mitul Srivastava,
        currently an unincorporated entity based in Delhi, India, in the process of formal incorporation.
      </Section>

      <Section title="2. Description of Service">
        DataHub is an AI-powered data pipeline platform that allows users to clean, transform, analyse,
        and visualise data using natural language. The Service includes AI-assisted data transformation
        and analysis, replayable pipeline creation, visualization and dashboard building, database
        connectivity (select plans), and scheduled pipeline execution (select plans).
      </Section>

      <Section title="3. Accounts and Registration">
        You must provide accurate and complete information when creating an account. You are responsible
        for maintaining the security of your account credentials. You must be at least 18 years old to
        use DataHub. One person or legal entity may not maintain more than one free account. You are
        responsible for all activity that occurs under your account.
      </Section>

      <Section title="4. Subscriptions and Billing">
        <strong>Plans:</strong> DataHub offers Free, Professional, Team, Business, and Enterprise plans.
        Plan features and limits are described at datahub.org.in/pricing.<br /><br />
        <strong>Billing:</strong> Paid subscriptions are billed monthly or annually in advance. Indian
        users are billed in INR via Razorpay. International users are billed in USD via Dodo Payments.
        All prices are exclusive of applicable taxes.<br /><br />
        <strong>Auto-renewal:</strong> Subscriptions automatically renew at the end of each billing
        period unless cancelled before the renewal date.<br /><br />
        <strong>No Refunds:</strong> All subscription payments are non-refundable. You may cancel at any
        time and retain access until the end of your current billing period. No partial refunds are
        issued for unused time. By subscribing, you acknowledge and agree to this no-refund
        policy.<br /><br />
        <strong>Price Changes:</strong> We may change subscription prices with 30 days advance notice
        via email. Continued use after the notice period constitutes acceptance of new pricing.
      </Section>

      <Section title="5. Acceptable Use">
        You agree not to use DataHub to: upload or process data you do not have legal right to access;
        process personal data of individuals without appropriate legal basis; reverse engineer or attempt
        to extract source code; resell or sublicense DataHub without written permission; attempt
        unauthorised access to any part of the Service; develop a competing product using DataHub;
        upload malicious files or malware; violate any applicable law or regulation. We reserve the
        right to suspend or terminate accounts that violate these terms without notice or refund.
      </Section>

      <Section title="6. Data and Privacy">
        You retain full ownership of all data you upload to DataHub. We do not claim any intellectual
        property rights over your data. We do not use your data to train AI models. Your data is used
        solely to provide the Service to you. Upon account deletion, your data is deleted within 30
        days. See our{" "}
        <Link to="/privacy" style={{ color: "#5B6AF0" }}>
          Privacy Policy
        </Link>{" "}
        for full details.
      </Section>

      <Section title="7. AI-Generated Outputs">
        DataHub uses artificial intelligence to generate data analysis, transformations, and insights.
        AI-generated outputs may contain errors, inaccuracies, or omissions. You are solely responsible
        for verifying AI-generated results before making business decisions. DataHub is not liable for
        any decisions made based on AI-generated analysis. AI outputs do not constitute professional
        financial, legal, medical, or other regulated advice.
      </Section>

      <Section title="8. Intellectual Property">
        DataHub, its features, functionality, design, and underlying technology are owned by us and
        protected by applicable intellectual property laws. You retain all rights to content you create
        using DataHub, including pipelines, visualizations, and dashboards. If you provide feedback or
        suggestions, you grant us a perpetual, royalty-free licence to use that feedback without
        compensation.
      </Section>

      <Section title="9. Limitation of Liability">
        DataHub is provided "as is" without warranties of any kind. We do not warrant that the Service
        will be uninterrupted or error-free. In no event shall we be liable for indirect, incidental,
        special, consequential, or punitive damages. Our total liability for any claim shall not exceed
        the amount you paid us in the 3 months preceding the claim.
      </Section>

      <Section title="10. Indemnification">
        You agree to indemnify and hold harmless DataHub from any claims, damages, and expenses arising
        from your use of the Service, your violation of these Terms, your violation of any third-party
        rights, or data you upload or process using DataHub.
      </Section>

      <Section title="11. Governing Law">
        <strong>For users in India:</strong> These Terms are governed by the laws of India. Disputes are
        subject to the exclusive jurisdiction of the courts of Delhi, India.<br /><br />
        <strong>For users outside India:</strong> These Terms are governed by the laws of the State of
        Delaware, United States. Disputes shall be resolved by binding arbitration under the rules of
        the American Arbitration Association, conducted in English.<br /><br />
        Before initiating any formal dispute, you agree to contact us at mitul.srivastava000@gmail.com and
        attempt informal resolution for at least 30 days.
      </Section>

      <Section title="12. Termination">
        You may cancel your account at any time from Settings → Billing. We may suspend or terminate
        your account immediately for violation of these Terms, fraudulent or illegal activity, or
        failure to pay subscription fees. Upon termination, your right to access DataHub ceases
        immediately. We will provide 30 days to export your data unless termination was for cause.
      </Section>

      <Section title="13. Changes to Terms">
        We may update these Terms at any time. We will notify you of material changes via email at least
        14 days before they take effect. Continued use after the effective date constitutes acceptance.
      </Section>

      <Section title="14. Contact">
        For questions about these Terms, email us at{" "}
        <a href="mailto:mitul.srivastava000@gmail.com" style={{ color: "#5B6AF0" }}>
          mitul.srivastava000@gmail.com
        </a>
        .
      </Section>
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
