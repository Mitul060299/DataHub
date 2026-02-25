export function MarketplacePage() {
  const cards = [
    "Sales Data Cleaning",
    "Attribution ETL",
    "Churn Feature Engineering",
    "Finance Forecast Prep",
  ];

  return (
    <main className="app-page" style={{ padding: 20 }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>Marketplace</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        {cards.map((card) => (
          <article key={card} className="panel" style={{ padding: 14 }}>
            <h3 style={{ marginBottom: 6 }}>{card}</h3>
            <p style={{ color: "var(--tx1)" }}>Reusable pipeline template for rapid onboarding.</p>
            <button className="btn" style={{ marginTop: 10 }}>Use Template</button>
          </article>
        ))}
      </div>
    </main>
  );
}
