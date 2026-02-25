export function ChartView() {
  return (
    <div
      className="panel"
      style={{
        height: "100%",
        margin: 8,
        display: "grid",
        placeItems: "center",
        color: "var(--tx1)",
        background: "linear-gradient(180deg, var(--bg1), var(--bg2))",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 16, marginBottom: 6 }}>Chart visualisation</p>
        <p>Switch dataset columns to generate chart summaries.</p>
      </div>
    </div>
  );
}
