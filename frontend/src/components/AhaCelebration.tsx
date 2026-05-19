/**
 * AhaCelebration
 *
 * Displayed once after the user receives their first AI answer.
 * Shows a brief confetti burst + a "share it?" toast at the bottom-center.
 * Auto-dismisses after 6 seconds.
 *
 * Props
 * -----
 *   onDismiss   — called when the toast is closed or auto-dismissed
 *   onShare     — called when the "Share" CTA is clicked
 */

import { useEffect, useRef } from "react";
import { recordMilestone } from "../lib/activation";

interface AhaCelebrationProps {
  onDismiss: () => void;
  onShare?: () => void;
  /** When true, replaces the Share CTA with a "Save my work" sign-up prompt. */
  isAnonymous?: boolean;
  onSignUp?: () => void;
}

/** Tiny canvas-based confetti burst — no external dependency. */
function ConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const COLORS = ["#5B6AF0", "#22b573", "#f59e0b", "#ef4444", "#a78bfa", "#38bdf8"];
    const particles: Array<{
      x: number; y: number;
      vx: number; vy: number;
      color: string;
      w: number; h: number;
      angle: number; spin: number;
      opacity: number;
    }> = [];

    for (let i = 0; i < 100; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: -10,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 3 + 2,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        w: Math.random() * 8 + 4,
        h: Math.random() * 4 + 2,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.2,
        opacity: 1,
      });
    }

    let frame: number;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05; // gravity
        p.angle += p.spin;
        p.opacity -= 0.008;
        if (p.opacity > 0 && p.y < canvas.height) {
          alive = true;
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.opacity);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        }
      }
      if (alive) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9998,
      }}
      aria-hidden="true"
    />
  );
}

export function AhaCelebration({ onDismiss, onShare, isAnonymous, onSignUp }: AhaCelebrationProps) {
  // For signed-in users auto-dismiss after 7 s. For anon users keep the
  // sign-up prompt on screen a bit longer so they have time to read + act.
  useEffect(() => {
    const id = setTimeout(onDismiss, isAnonymous ? 14000 : 7000);
    return () => clearTimeout(id);
  }, [onDismiss, isAnonymous]);

  const handleShare = () => {
    recordMilestone("result_exported");
    onShare?.();
    onDismiss();
  };

  const handleSignUp = () => {
    recordMilestone("result_exported");
    onSignUp?.();
    onDismiss();
  };

  return (
    <>
      <ConfettiCanvas />
      <div
        role="status"
        aria-live="polite"
        style={{
          position: "fixed",
          bottom: 80,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
          background: "var(--bg1, #0f0f18)",
          border: `1px solid ${isAnonymous ? "#6366f1" : "var(--acl, #5B6AF0)"}`,
          borderRadius: 12,
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          boxShadow: isAnonymous
            ? "0 8px 40px rgba(99,102,241,0.35)"
            : "0 8px 32px rgba(0,0,0,0.5)",
          animation: "fadeInUp 0.35s ease",
          maxWidth: isAnonymous ? 480 : 420,
        }}
      >
        <span style={{ fontSize: 22 }}>{isAnonymous ? "🎉" : "✨"}</span>
        <div style={{ flex: 1 }}>
          {isAnonymous ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--tx0, #e8e8f0)" }}>
                You just got your first AI insight!
              </div>
              <div style={{ fontSize: 12, color: "var(--tx1, #aaa)", marginTop: 3, lineHeight: 1.4 }}>
                Sign up free to save this pipeline and run it on your own data.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--tx0, #e8e8f0)" }}>
                Your first AI insight!
              </div>
              <div style={{ fontSize: 12, color: "var(--tx1, #aaa)", marginTop: 2 }}>
                Ready to share your analysis?
              </div>
            </>
          )}
        </div>
        {isAnonymous ? (
          <button
            onClick={handleSignUp}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Save my work →
          </button>
        ) : onShare ? (
          <button
            onClick={handleShare}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "none",
              background: "var(--acl, #5B6AF0)",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Share
          </button>
        ) : null}
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            background: "none",
            border: "none",
            color: "var(--tx2, #888)",
            fontSize: 16,
            cursor: "pointer",
            padding: "0 4px",
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateX(-50%) translateY(16px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </>
  );
}
