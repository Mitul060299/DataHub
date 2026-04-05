import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../contexts/AuthContext";

export function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Invalid invite link.");
      return;
    }

    if (!session) {
      // Not logged in — send to login and come back
      navigate(`/login?redirect=/invite/${token}`, { replace: true });
      return;
    }

    const accept = async () => {
      try {
        await api.get(`/invites/${token}/accept`);
        setStatus("success");
        setMessage("You've joined the workspace!");
        setTimeout(() => navigate("/home?joined=1", { replace: true }), 1500);
      } catch (err) {
        const e = err as { response?: { data?: { detail?: string } }; message?: string };
        setStatus("error");
        setMessage(e.response?.data?.detail ?? e.message ?? "Invite could not be accepted.");
      }
    };

    void accept();
  }, [token, session, navigate]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg0, #0b0d14)",
      }}
    >
      <div
        style={{
          width: "min(420px, 90vw)",
          background: "var(--bg1, #0f1117)",
          border: "1px solid var(--bd2, #1e293b)",
          borderRadius: 12,
          padding: "40px 32px",
          textAlign: "center",
        }}
      >
        {status === "loading" && (
          <>
            <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
            <p style={{ color: "var(--tx1, #94a3b8)", fontSize: 15 }}>Accepting invite…</p>
          </>
        )}
        {status === "success" && (
          <>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🎉</div>
            <p style={{ color: "var(--tx0, #e2e8f0)", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              Welcome to the workspace!
            </p>
            <p style={{ color: "var(--tx1, #94a3b8)", fontSize: 14 }}>{message}</p>
            <p style={{ color: "var(--tx2, #64748b)", fontSize: 12, marginTop: 8 }}>Redirecting…</p>
          </>
        )}
        {status === "error" && (
          <>
            <div style={{ fontSize: 36, marginBottom: 16 }}>🚫</div>
            <p style={{ color: "var(--tx0, #e2e8f0)", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              Invite not accepted
            </p>
            <p style={{ color: "var(--tx1, #94a3b8)", fontSize: 14, marginBottom: 20 }}>{message}</p>
            <button
              onClick={() => navigate("/home", { replace: true })}
              style={{
                background: "var(--ac, #5b6af0)",
                border: "none",
                borderRadius: 8,
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                padding: "10px 24px",
                cursor: "pointer",
              }}
            >
              Go to Home
            </button>
          </>
        )}
      </div>
    </div>
  );
}
