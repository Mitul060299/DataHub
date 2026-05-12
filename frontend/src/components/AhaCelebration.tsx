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

export function AhaCelebration({ onDismiss, onShare }: AhaCelebrationProps) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 7000);
    return () => clearTimeout(id);
  }, [onDismiss]);

  const handleShare = () => {
    recordMilestone("result_exported");
    onShare?.();
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
          border: "1px solid var(--acl, #5B6AF0)",
          borderRadius: 12,
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          animation: "fadeInUp 0.35s ease",
          maxWidth: 420,
        }}
      >
        <span style={{ fontSize: 22 }}>✨</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--tx0, #e8e8f0)" }}>
            Your first AI insight!
          </div>
          <div style={{ fontSize: 12, color: "var(--tx1, #aaa)", marginTop: 2 }}>
            Ready to share your analysis?
          </div>
        </div>
        {onShare && (
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
        )}
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
