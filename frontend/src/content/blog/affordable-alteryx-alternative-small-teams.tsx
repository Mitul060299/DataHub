import {
  Article, Lead, H2, H3, P, UL, LI, Strong, Callout,
  CompareTable, MidCTA, FAQ,
} from "./_components";

export default function AffordableAlteryxAlternativeSmallTeams() {
  return (
    <Article>
      <Lead>
        You're a freelance data analyst, a one-person analytics team at a startup, or a small
        consultancy. You need to clean data, build transformation pipelines, and deliver results.
        Alteryx Designer is the industry-standard tool for this — and at £4,000+ per seat per year,
        it's priced for enterprise teams, not individual practitioners. Here's what to use instead.
      </Lead>

      <H2>The Alteryx pricing problem for small teams</H2>
      <P>
        Alteryx's pricing model was designed around large enterprise deployments. The per-seat
        annual licence, the enterprise sales process, the minimum contract values — none of this
        works for a freelancer billing by the project or a startup with three people on the data
        team.
      </P>
      <P>The specific problems for small teams:</P>
      <UL>
        <LI>
          <Strong>Annual commitment only.</Strong> You can't pay monthly or per-project. A 12-month
          licence that you might only use for 6 months means paying for idle time.
        </LI>
        <LI>
          <Strong>Per-seat pricing with no free tier.</Strong> Testing the tool before committing
          costs money. Onboarding a new team member costs another full seat.
        </LI>
        <LI>
          <Strong>Collaboration requires Alteryx Server.</Strong> Sharing workflows with a client or
          a colleague requires an Alteryx Server deployment that starts at tens of thousands per
          year. Not viable for small teams.
        </LI>
        <LI>
          <Strong>Windows-only desktop app.</Strong> Freelancers on Mac or working across devices
          can't run Alteryx at all.
        </LI>
      </UL>

      <H2>What small teams actually need</H2>
      <P>
        The Alteryx features that small analytics teams actually use every day are a fraction of the
        full platform:
      </P>
      <UL>
        <LI>Upload CSV, Excel, or connect to a database</LI>
        <LI>Clean and transform the data (fix nulls, remove duplicates, standardise columns)</LI>
        <LI>Join multiple data sources together</LI>
        <LI>Aggregate and reshape for reporting</LI>
        <LI>Export results or feed into a BI tool</LI>
        <LI>Share the workflow with a client or colleague</LI>
        <LI>Repeat the same process when new data arrives</LI>
      </UL>
      <P>
        None of these require the 300+ connectors, spatial analytics, or predictive modelling that
        make up most of Alteryx's feature set.
      </P>

      <H2>DataHub: built for the way small teams work</H2>
      <P>
        DataHub covers every item on the list above, with a monthly billing model and a free tier
        for solo experimentation. The key differences from Alteryx:
      </P>

      <H3>Browser-based, no install</H3>
      <P>
        Upload a file and start working in under a minute. Works on Mac, Windows, Linux, and
        Chromebook. No licence key, no installer, no IT department required. This matters for
        freelancers switching between client machines and for small teams where "install this 2GB
        desktop app on everyone's laptop" is not a trivial request.
      </P>

      <H3>AI agent instead of drag-and-drop canvas</H3>
      <P>
        Instead of placing tool boxes on a canvas, you describe what you want in plain English. The
        AI agent builds the transformation steps, shows you what it's doing, and generates
        transparent SQL you can inspect. The result is a faster workflow for common tasks — you
        don't need to know which of 300+ tools to use.
      </P>

      <H3>Monthly billing, free tier available</H3>
      <P>
        The free plan gives you 50 AI messages/month, 10 pipeline runs, and 500MB storage —
        enough to evaluate the tool on real data before committing. Paid plans start at $19/month
        (Starter, solo use) and $179/month for a 3-seat team. No annual lock-in.
      </P>

      <Callout type="tip">
        DataHub Team ($179/mo, 3 seats) vs Alteryx Designer (£4,000+/seat/year, 3 seats = £12,000+
        /year). Annual DataHub cost: ~$2,148. Annual Alteryx cost: ~$15,585. Saving: ~86%.
      </Callout>

      <H3>Sharing with clients without extra licences</H3>
      <P>
        On the Team plan, you can invite collaborators to a project. They can view pipeline outputs,
        download results, and run pipelines — without needing their own DataHub account or paying
        for a seat. For freelancers delivering work to clients, this is a significant difference
        from Alteryx's per-seat model.
      </P>

      <MidCTA text="Start free — no credit card, works immediately in your browser." />

      <H2>Other alternatives worth considering for small teams</H2>

      <H3>KNIME (free, open source)</H3>
      <P>
        KNIME is the best free alternative for analysts who are comfortable with complex workflow
        tools. Full visual pipeline builder, extensible via plugins, handles large datasets.
        Downsides: steep learning curve, desktop app only (Windows/Mac/Linux), collaboration
        requires KNIME Server.
      </P>

      <H3>Power Query (free in Excel and Power BI Desktop)</H3>
      <P>
        If your team is already in the Microsoft ecosystem, Power Query is the zero-cost starting
        point. It handles most data cleaning and transformation tasks. Limitations: Windows-only,
        no AI assistance, scheduling requires Power BI Service, no native collaboration.
      </P>

      <H3>Airbyte + dbt (free, technical)</H3>
      <P>
        For teams with a technical co-founder or data engineer, Airbyte (data integration) plus dbt
        (transformation) is a powerful free combination. This is not a no-code solution — you write
        YAML and SQL — but it's fully open source and scales well. Too complex for business
        analysts working without engineering support.
      </P>

      <H2>Comparison: Alteryx vs affordable alternatives for small teams</H2>
      <CompareTable
        colA="Alteryx Designer"
        colB="DataHub Team"
        rows={[
          {
            feature: "Price (3 seats)",
            manual: "~$15,585/year (US); ~£12,000/year (UK)",
            datahub: "$2,148/year — 86% cheaper",
          },
          {
            feature: "Monthly billing",
            manual: "No — annual only",
            datahub: "Yes — cancel any time",
          },
          {
            feature: "Free tier",
            manual: "No",
            datahub: "Yes — functional free plan with no time limit",
          },
          {
            feature: "Mac support",
            manual: "No — Windows desktop app only",
            datahub: "Yes — browser-based",
          },
          {
            feature: "Collaboration / sharing",
            manual: "Requires Alteryx Server (£tens of thousands/year)",
            datahub: "Included from Team plan",
          },
          {
            feature: "Setup time",
            manual: "Hours to days",
            datahub: "Under 1 minute",
          },
          {
            feature: "AI-assisted pipeline building",
            manual: "Add-on at $1,950/seat/year extra",
            datahub: "Included in all plans",
          },
        ]}
      />

      <H2>When to consider each option</H2>
      <UL>
        <LI>
          <Strong>DataHub</Strong> — best for solo analysts, freelancers, and small teams (2–25
          people) who want the speed and power of Alteryx without the enterprise price tag or
          installation overhead.
        </LI>
        <LI>
          <Strong>KNIME</Strong> — best for technical analysts who need an advanced free tool and
          are comfortable with complex visual workflow builders.
        </LI>
        <LI>
          <Strong>Power Query</Strong> — best for teams already in the Microsoft stack who need
          basic data prep on Windows.
        </LI>
        <LI>
          <Strong>dbt + Airbyte</Strong> — best for teams with engineering support who want an
          open-source, code-first data pipeline.
        </LI>
        <LI>
          <Strong>Alteryx</Strong> — best when you genuinely need 300+ connectors, spatial
          analytics, or an existing Alteryx Server investment.
        </LI>
      </UL>

      <FAQ
        items={[
          {
            q: "Can I use DataHub for client deliverables as a freelancer?",
            a: "Yes. You can create a separate project per client, invite the client to view outputs on the Team plan, and export results in any format. Projects are isolated — one client can't see another's data. Pipelines are yours and remain accessible after a project wraps.",
          },
          {
            q: "Is there a trial period before I have to pay?",
            a: "The free plan is permanent — not a trial. It gives you 50 AI messages/month, 10 pipeline runs, and 500MB of storage. You can work on real projects on the free plan and upgrade when you hit the limits.",
          },
          {
            q: "How does DataHub handle data security for client data?",
            a: "All data is encrypted at rest and in transit. Each project is tenant-isolated — data from one project is never shared with or visible from another. DataHub does not use customer data to train AI models. On Enterprise, you can select data residency (EU, US, or Mumbai region).",
          },
          {
            q: "Can I run DataHub on my own infrastructure if I'm concerned about cloud data storage?",
            a: "DataHub Enterprise can be deployed in a private cloud environment. Contact the team for self-hosted deployment options.",
          },
        ]}
      />
    </Article>
  );
}
