export function HomePage() {
  return (
    <main className="app-page" style={{ padding: 20 }}>
      <section className="panel" style={{ padding: 18, marginBottom: 14 }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>DataHub</h1>
        <p style={{ color: "var(--tx1)", maxWidth: 760 }}>
          AI-assisted data operations platform for importing, cleaning, transforming, and scheduling pipelines with team collaboration.
        </p>
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        {[
          ["Features", "Dataset import, transformations, AI workflow suggestions, and pipeline scheduling."],
          ["Pricing", "Free, Team, and Enterprise plans with collaboration and governance controls."],
          ["Why DataHub", "Move from raw sources to production-ready datasets in a single workspace."],
        ].map(([title, body]) => (
          <article key={title} className="panel" style={{ padding: 14 }}>
            <h3 style={{ marginBottom: 8 }}>{title}</h3>
            <p style={{ color: "var(--tx1)" }}>{body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
