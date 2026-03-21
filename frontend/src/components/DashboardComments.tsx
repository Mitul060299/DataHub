/**
 * DashboardComments — collapsible comment thread for a dashboard
 *
 * Props:
 *   dashboardId — the dashboards_v2 record id
 */

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { api } from "../api";

interface Comment {
  id: string;
  dashboard_id: string;
  user_id: string;
  author_name: string;
  body: string;
  created_at: string;
  updated_at: string;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function DashboardComments({ dashboardId }: { dashboardId: string }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = () => {
    setLoading(true);
    api
      .get<Comment[]>(`/api/dashboards/${dashboardId}/comments`)
      .then((r) => setComments(r.data))
      .catch(() => setError("Failed to load comments."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dashboardId]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments, open]);

  const handlePost = async () => {
    if (!body.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const res = await api.post<Comment>(`/api/dashboards/${dashboardId}/comments`, {
        body: body.trim(),
      });
      setComments((prev) => [...prev, res.data]);
      setBody("");
    } catch {
      setError("Failed to post comment.");
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await api.delete(`/api/dashboards/${dashboardId}/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {
      setError("Failed to delete comment.");
    }
  };

  return (
    <div style={{ borderTop: "1px solid #1E293B", marginTop: 16 }}>
      {/* Toggle header */}
      <button
        onClick={() => setOpen((p) => !p)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          background: "none",
          border: "none",
          padding: "12px 20px",
          cursor: "pointer",
          color: "#64748B",
          fontSize: 12,
          fontWeight: 600,
          textAlign: "left",
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Comments
        {comments.length > 0 && (
          <span
            style={{
              background: "#5B6AF0",
              color: "#fff",
              borderRadius: 10,
              fontSize: 10,
              padding: "1px 6px",
              fontWeight: 700,
            }}
          >
            {comments.length}
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 16, lineHeight: 1 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div
          style={{
            padding: "0 20px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            maxHeight: 420,
            overflowY: "auto",
          }}
        >
          {loading && (
            <p style={{ color: "#475569", fontSize: 12 }}>Loading comments…</p>
          )}

          {!loading && comments.length === 0 && (
            <p style={{ color: "#475569", fontSize: 12 }}>
              No comments yet. Be the first to add one.
            </p>
          )}

          {comments.map((c) => (
            <CommentCard key={c.id} comment={c} onDelete={handleDelete} />
          ))}

          {error && (
            <p style={{ color: "#EF4444", fontSize: 12 }}>{error}</p>
          )}

          <div ref={bottomRef} />

          {/* Composer */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              borderTop: "1px solid #1E293B",
              paddingTop: 12,
              marginTop: 4,
            }}
          >
            <textarea
              rows={3}
              placeholder="Add a comment…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  void handlePost();
                }
              }}
              style={textareaStyle}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                disabled={posting || !body.trim()}
                onClick={() => void handlePost()}
                style={{
                  ...postBtnStyle,
                  opacity: posting || !body.trim() ? 0.5 : 1,
                  cursor: posting || !body.trim() ? "not-allowed" : "pointer",
                }}
              >
                {posting ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentCard({
  comment,
  onDelete,
}: {
  comment: Comment;
  onDelete: (id: string) => void;
}) {
  const initials = comment.author_name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "#5B6AF0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          color: "#fff",
          flexShrink: 0,
        }}
      >
        {initials || "?"}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            marginBottom: 3,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8" }}>
            {comment.author_name}
          </span>
          <span style={{ fontSize: 11, color: "#334155" }}>
            {timeAgo(comment.created_at)}
          </span>
          <button
            onClick={() => onDelete(comment.id)}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              color: "#334155",
              cursor: "pointer",
              fontSize: 12,
              padding: "0 2px",
              lineHeight: 1,
            }}
            title="Delete comment"
          >
            ×
          </button>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "#CBD5E1",
            lineHeight: 1.5,
            wordBreak: "break-word",
          }}
        >
          {comment.body}
        </p>
      </div>
    </div>
  );
}

const textareaStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#0F1117",
  border: "1px solid #1E293B",
  borderRadius: 8,
  color: "#E2E8F0",
  padding: "8px 10px",
  fontSize: 13,
  resize: "vertical",
  outline: "none",
  fontFamily: "inherit",
};

const postBtnStyle: CSSProperties = {
  background: "#5B6AF0",
  color: "#fff",
  border: "none",
  borderRadius: 7,
  padding: "7px 18px",
  fontSize: 13,
  fontWeight: 600,
};
