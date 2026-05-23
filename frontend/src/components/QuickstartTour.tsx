/**
 * QuickstartTour — 5-step onboarding tooltip guide for the Quickstart project.
 *
 * Step 1: Upload a dataset    (targets: data-section in ExplorerPanel)
 * Step 2: Ask the AI agent    (targets: ai-agent-header in AIPanel)
 * Step 3: Results — Data tab  (targets: data-tab button in CanvasPanel)
 * Step 4: Pipeline history    (targets: pipeline-tab button in CanvasPanel)
 * Step 5: Dashboards & export (targets: dashboards-tab button in CanvasPanel)
 *
 * Steps 1 and 2 auto-advance via DOM events:
 *   "datahub:quickstart-step1-done"  – fired when first dataset is imported
 *   "datahub:quickstart-step2-done"  – fired when first AI answer arrives
 * Steps 3-5 are manual-only (user presses Next / Finish).
 *
 * Progress is persisted in localStorage under "datahub_qs_step".
 * The tour is fully dismissed by storing "datahub_qs_done" = "1".
 */

import { useEffect, useState, useCallback } from "react";
import { fireConfetti } from "../utils/confetti";

// ─── Step definitions ──────────────────────────────────────────────────────

interface QStep {
  target: string;             // data-tour value on the DOM element
  title: string;
  content: string;
  position: "right" | "left" | "bottom" | "top";
  completionEvent?: string;   // if omitted the step only advances via Next button
  celebration: string;        // toast text shown on completion
}

// QS_STEPS is defined inside the component to avoid Rollup TDZ in production
// bundles — module-level `const` can be in the temporal dead zone when
// Rollup concatenates chunks and the component renders before the module
// initializer has executed.

// ─── localStorage keys ─────────────────────────────────────────────────────

const LS_STEP = "datahub_qs_step";   // "0" | "1" | "2" | "done"
const LS_DONE = "datahub_qs_done";   // "1" when fully dismissed

// ─── Geometry helpers ──────────────────────────────────────────────────────

const TOOLTIP_W = 300;
const TOOLTIP_H = 160; // approximate
const ARROW = 10;
const GAP = 14;

interface Rect { top: number; left: number; width: number; height: number }

function computePos(
  rect: Rect,
  position: QStep["position"],
): { top: number; left: number; arrowSide: "left" | "right" | "top" | "bottom" } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = 0, left = 0;
  let arrowSide: "left" | "right" | "top" | "bottom" = "left";

  if (position === "right") {
    left = rect.left + rect.width + GAP;
    top = rect.top + rect.height / 2 - TOOLTIP_H / 2;
    arrowSide = "left";
  } else if (position === "left") {
    left = rect.left - TOOLTIP_W - GAP;
    top = rect.top + rect.height / 2 - TOOLTIP_H / 2;
    arrowSide = "right";
  } else if (position === "top") {
    left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
    top = rect.top - TOOLTIP_H - GAP;
    arrowSide = "bottom";
  } else {
    // bottom
    left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
    top = rect.top + rect.height + GAP;
    arrowSide = "top";
  }

  // Clamp to viewport
  top = Math.max(8, Math.min(top, vh - TOOLTIP_H - 8));
  left = Math.max(8, Math.min(left, vw - TOOLTIP_W - 8));

  // Flip if overflowing
  if (position === "right" && left + TOOLTIP_W > vw - 8) {
    left = rect.left - TOOLTIP_W - GAP;
    arrowSide = "right";
  }
  if (position === "left" && left < 8) {
    left = rect.left + rect.width + GAP;
    arrowSide = "left";
  }

  return { top, left, arrowSide };
}

// ─── Component ─────────────────────────────────────────────────────────────

interface QuickstartTourProps {
  /** Called when the tour is dismissed or completed so parent can hide it */
  onDone?: () => void;
}

export function QuickstartTour({ onDone }: QuickstartTourProps) {
  // Defined here (not at module level) to avoid Rollup TDZ in production bundles.
  const QS_STEPS: QStep[] = [
    {
      target: "data-section",
      title: "Step 1 — Upload a dataset",
      content:
        'Click "Import" or drag a CSV here to load your first dataset. You can also use a sample file to try things out.',
      position: "right",
      completionEvent: "datahub:quickstart-step1-done",
      celebration: "🎉 Dataset loaded! On to the AI.",
    },
    {
      target: "ai-agent-header",
      title: "Step 2 — Ask the AI",
      content:
        'Type a question like "Show me the top 10 rows" or "What is the average value per category?" and press Enter. The AI transforms your data instantly.',
      position: "left",
      completionEvent: "datahub:quickstart-step2-done",
      celebration: "✨ Great! The AI answered your question.",
    },
    {
      target: "data-tab",
      title: "Step 3 — Results in the Data tab",
      content:
        "The Data tab always shows the current state of your dataset. Every time the AI transforms your data, the result appears here — rows, columns, and all.",
      position: "bottom",
      celebration: "👀 Got it!",
    },
    {
      target: "pipeline-tab",
      title: "Step 4 — Your Pipeline",
      content:
        "The Pipeline tab records every transformation as a numbered step. You can re-run the whole pipeline, roll back a step, or export the result at any point.",
      position: "bottom",
      celebration: "🔁 Pipeline understood!",
    },
    {
      target: "dashboards-tab",
      title: "Step 5 — Charts & Dashboards",
      content:
        "Open Dashboards to build charts from your data. Use the Export button to download as CSV, or set a Schedule to refresh the pipeline automatically.",
      position: "bottom",
      celebration: "🎉 You're all set! Enjoy DataHub.",
    },
  ];

  const [stepIndex, setStepIndex] = useState<number>(() => {
    const saved = localStorage.getItem(LS_STEP);
    if (!saved || saved === "done") return 0;
    return parseInt(saved, 10) || 0;
  });

  const [pos, setPos] = useState<{
    top: number;
    left: number;
    arrowSide: "left" | "right" | "top" | "bottom";
  } | null>(null);

  const [highlightRect, setHighlightRect] = useState<Rect | null>(null);
  const [celebToast, setCelebToast] = useState<string | null>(null);

  const step = QS_STEPS[stepIndex];

  // Measure target element position
  useEffect(() => {
    if (!step) return;
    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (!el) {
        setPos({ top: window.innerHeight / 2 - TOOLTIP_H / 2, left: 8, arrowSide: "left" });
        setHighlightRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const rect: Rect = { top: r.top, left: r.left, width: r.width, height: r.height };
      setHighlightRect(rect);
      setPos(computePos(rect, step.position));
    };

    const id = setTimeout(measure, 80);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(id);
      window.removeEventListener("resize", measure);
    };
  }, [step]);

  // Listen for step completion events
  const completeStep = useCallback(
    (idx: number) => {
      const s = QS_STEPS[idx];
      if (!s) return;

      // Confetti burst
      fireConfetti({ x: 0.5, y: 0.35 });

      // Celebration toast
      setCelebToast(s.celebration);
      setTimeout(() => setCelebToast(null), 3500);

      const next = idx + 1;
      if (next >= QS_STEPS.length) {
        // Tour complete — dismiss immediately so the user can't click Finish again
        localStorage.setItem(LS_STEP, "done");
        localStorage.setItem(LS_DONE, "1");
        onDone?.();
      } else {
        localStorage.setItem(LS_STEP, String(next));
        setStepIndex(next);
      }
    },
    [onDone],
  );

  useEffect(() => {
    const handlers: Array<() => void> = QS_STEPS
      .filter((s) => !!s.completionEvent)
      .map((s, _i) => {
        // Resolve the real index (filter may have shifted it)
        const i = QS_STEPS.indexOf(s);
        const handler = () => {
          // Only fire if this is the current step
          setStepIndex((cur) => {
            if (cur === i) completeStep(i);
            return cur;
          });
        };
        window.addEventListener(s.completionEvent!, handler);
        return () => window.removeEventListener(s.completionEvent!, handler);
      });
    return () => handlers.forEach((cleanup) => cleanup());
  }, [completeStep]);

  const dismiss = useCallback(() => {
    localStorage.setItem(LS_DONE, "1");
    onDone?.();
  }, [onDone]);

  if (!step || !pos) return null;

  const isLast = stepIndex === QS_STEPS.length - 1;

  // ── Arrow style ────────────────────────────────────────────────────────
  const arrowStyle: React.CSSProperties = (() => {
    const base: React.CSSProperties = { position: "absolute", width: 0, height: 0, borderStyle: "solid" };
    if (pos.arrowSide === "left") {
      return { ...base, left: -ARROW, top: "50%", transform: "translateY(-50%)",
        borderWidth: `${ARROW}px ${ARROW}px ${ARROW}px 0`,
        borderColor: "transparent var(--bg2) transparent transparent" };
    }
    if (pos.arrowSide === "right") {
      return { ...base, right: -ARROW, top: "50%", transform: "translateY(-50%)",
        borderWidth: `${ARROW}px 0 ${ARROW}px ${ARROW}px`,
        borderColor: "transparent transparent transparent var(--bg2)" };
    }
    if (pos.arrowSide === "bottom") {
      return { ...base, bottom: -ARROW, left: "50%", transform: "translateX(-50%)",
        borderWidth: `${ARROW}px ${ARROW}px 0 ${ARROW}px`,
        borderColor: "var(--bg2) transparent transparent transparent" };
    }
    // top
    return { ...base, top: -ARROW, left: "50%", transform: "translateX(-50%)",
      borderWidth: `0 ${ARROW}px ${ARROW}px ${ARROW}px`,
      borderColor: "transparent transparent var(--bg2) transparent" };
  })();

  return (
    <>
      {/* Dim backdrop */}
      <div
        onClick={dismiss}
        style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.42)" }}
      />

      {/* Highlight ring */}
      {highlightRect && (
        <div
          style={{
            position: "fixed",
            zIndex: 9999,
            top: highlightRect.top - 5,
            left: highlightRect.left - 5,
            width: highlightRect.width + 10,
            height: highlightRect.height + 10,
            borderRadius: 10,
            boxShadow: "0 0 0 4px #6366f1, 0 0 24px rgba(99,102,241,0.4)",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Tooltip bubble */}
      <div
        style={{
          position: "fixed",
          zIndex: 10000,
          top: pos.top,
          left: pos.left,
          width: TOOLTIP_W,
          background: "var(--bg2)",
          border: "1px solid rgba(99,102,241,0.5)",
          borderRadius: "var(--r8, 10px)",
          padding: "14px 16px",
          boxShadow: "0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.15)",
          color: "var(--tx0)",
        }}
      >
        {/* Arrow */}
        <div style={{ position: "relative" }}>
          <div style={arrowStyle} />
        </div>

        {/* Progress dots */}
        <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
          {QS_STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === stepIndex ? 18 : 6,
                height: 6,
                borderRadius: 3,
                background: i <= stepIndex ? "#6366f1" : "var(--bd2)",
                transition: "width 0.3s, background 0.3s",
              }}
            />
          ))}
        </div>

        {/* Title */}
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: "var(--tx0)" }}>
          {step.title}
        </div>

        {/* Body */}
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--tx1)", lineHeight: 1.55 }}>
          {step.content}
        </p>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
          <button
            className="btn"
            style={{ fontSize: 11, padding: "3px 10px", color: "var(--tx2)", border: "1px solid var(--bd)" }}
            onClick={dismiss}
          >
            Skip tour
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {stepIndex > 0 && (
              <button
                className="btn"
                style={{ fontSize: 11, padding: "3px 10px", color: "var(--tx2)" }}
                onClick={() => {
                  const prev = stepIndex - 1;
                  localStorage.setItem(LS_STEP, String(prev));
                  setStepIndex(prev);
                }}
              >
                ← Back
              </button>
            )}
            <button
              className="btn"
              style={{
                fontSize: 12,
                padding: "3px 12px",
                background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                color: "#fff",
                border: "none",
              }}
              onClick={() => {
                if (isLast) {
                  completeStep(stepIndex);
                } else {
                  const next = stepIndex + 1;
                  localStorage.setItem(LS_STEP, String(next));
                  setStepIndex(next);
                }
              }}
            >
              {isLast ? "Finish 🎉" : "Next →"}
            </button>
          </div>
        </div>
      </div>

      {/* Celebration toast */}
      {celebToast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: 32,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10001,
            padding: "12px 20px",
            borderRadius: 12,
            background: "linear-gradient(135deg,rgba(99,102,241,0.25),rgba(139,92,246,0.2))",
            border: "1px solid rgba(99,102,241,0.5)",
            color: "#c7d2fe",
            fontWeight: 600,
            fontSize: 14,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            whiteSpace: "nowrap",
          }}
        >
          {celebToast}
        </div>
      )}
    </>
  );
}

// ─── Helpers exported for firing completion events from other components ───

export function markQuickstartStep1Done() {
  window.dispatchEvent(new CustomEvent("datahub:quickstart-step1-done"));
}

export function markQuickstartStep2Done() {
  window.dispatchEvent(new CustomEvent("datahub:quickstart-step2-done"));
}


