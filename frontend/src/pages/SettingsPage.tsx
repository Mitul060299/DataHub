export function SettingsPage() {
  return (
    <main className="app-page" style={{ padding: 20 }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>Settings</h1>
      <section className="panel" style={{ padding: 14, maxWidth: 720, display: "grid", gap: 12 }}>
        <div>
          <p style={{ color: "var(--tx1)", marginBottom: 6 }}>Display Name</p>
          <input className="auth-input" placeholder="Your name" defaultValue="DataHub User" />
        </div>
        <div>
          <p style={{ color: "var(--tx1)", marginBottom: 6 }}>Email</p>
          <input className="auth-input" placeholder="you@company.com" defaultValue="user@datahub.dev" />
        </div>
        <div>
          <p style={{ color: "var(--tx1)", marginBottom: 6 }}>Theme</p>
          <select className="auth-select" defaultValue="dark">
            <option value="dark">Dark</option>
          </select>
        </div>
        <button className="btn btn-primary" style={{ width: 120 }}>Save</button>
      </section>
    </main>
  );
}
