import { useEffect, useState } from "react";

interface TourStep {
  target: string;
  title: string;
  content: string;
  position: "right" | "left" | "bottom";
}

const STEPS: TourStep[] = [
  {
    target: "data-section",
    title: "Your data lives here",
    content: "Upload a CSV or Excel file, connect a database, or try a sample dataset. Press Ctrl+I (or Cmd+I on Mac) any time to open the import panel.",
    position: "right",
  },
  {
    target: "ai-agent-header",
    title: "Ask the AI Agent anything",
    content: "Type in plain English — 'remove duplicates', 'join with orders on customer_id', 'group by region and sum revenue', 'create a bar chart'. The agent plans and executes it.",
    position: "left",
  },
  {
    target: "approve-button",
    title: "You approve before anything runs",
    content: "DataHub shows you the full step-by-step plan before executing. Review the SQL, edit it, or ask the agent to revise — your data is never changed without your sign-off.",
    position: "left",
  },
  {
    target: "activity-pipeline",
    title: "Every step is recorded",
    content: "Open the Pipeline panel to see your full transformation history. Click the eye icon next to any step to preview that snapshot. Press Ctrl+R to re-run the whole pipeline on fresh data.",
    position: "right",
  },
  {
    target: "artifacts-section",
    title: "Saved checkpoints",
    content: "After running transformations, save a checkpoint here. You can branch from any checkpoint to explore alternative analyses, or export it directly to CSV or Excel.",
    position: "right",
  },
  {
    target: "canvas-tab",
    title: "Arrange your visuals on the Canvas",
    content: "Switch to the Canvas tab and drag your saved charts onto it to build a personal analysis view. Great for laying out insights side by side or sharing a quick visual summary with your team.",
    position: "bottom",
  },
  {
    target: "viz-section",
    title: "Your saved charts",
    content: "Charts you create during analysis are saved here. Drag them onto the Canvas tab to arrange them for deeper analysis, or pick one up later to continue exploring.",
    position: "right",
  },
  {
    target: "export-button",
    title: "Export when you're done",
    content: "Download as CSV for universal use, Excel (.xlsx) for Power BI and general analysis, or export directly to Tableau. You can also save a checkpoint before exporting.",
    position: "bottom",
  },
];

const TOOLTIP_W = 280;
const TOOLTIP_H = 140; // approximate
const ARROW = 10;
const GAP = 12;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function computePosition(
  rect: Rect,
  position: TourStep["position"]
): { top: number; left: number; arrowSide: "left" | "right" | "top" } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = 0;
  let left = 0;
  let arrowSide: "left" | "right" | "top" = "left";

  if (position === "right") {
    left = rect.left + rect.width + GAP;
    top = rect.top + rect.height / 2 - TOOLTIP_H / 2;
    arrowSide = "left";
  } else if (position === "left") {
    left = rect.left - TOOLTIP_W - GAP;
    top = rect.top + rect.height / 2 - TOOLTIP_H / 2;
    arrowSide = "right";
  } else {
    // bottom
    left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
    top = rect.top + rect.height + GAP;
    arrowSide = "top";
  }

  // Clamp to viewport
  top = Math.max(8, Math.min(top, vh - TOOLTIP_H - 8));
  left = Math.max(8, Math.min(left, vw - TOOLTIP_W - 8));

  // If "right" would overflow right edge, flip to left
  if (position === "right" && left + TOOLTIP_W > vw - 8) {
    left = rect.left - TOOLTIP_W - GAP;
    arrowSide = "right";
  }
  // If "left" would overflow left edge, flip to right
  if (position === "left" && left < 8) {
    left = rect.left + rect.width + GAP;
    arrowSide = "left";
  }

  return { top, left, arrowSide };
}

interface TourTooltipProps {
  step: number;
  onNext: () => void;
  onSkip: () => void;
}

export function TourTooltip({ step, onNext, onSkip }: TourTooltipProps) {
  const [pos, setPos] = useState<{ top: number; left: number; arrowSide: "left" | "right" | "top" } | null>(null);
  const [highlightRect, setHighlightRect] = useState<Rect | null>(null);

  const currentStep = STEPS[step];

  useEffect(() => {
    if (!currentStep) return;

    const measure = () => {
      const el = document.querySelector(`[data-tour="${currentStep.target}"]`);
      if (!el) {
        // Fallback: center-left of viewport
        setPos({ top: window.innerHeight / 2 - TOOLTIP_H / 2, left: 8, arrowSide: "left" });
        setHighlightRect(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      const r: Rect = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
      setHighlightRect(r);
      setPos(computePosition(r, currentStep.position));
    };

    // Small delay lets layout settle after step change
    const id = setTimeout(measure, 60);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(id);
      window.removeEventListener("resize", measure);
    };
  }, [step, currentStep]);

  if (!currentStep || !pos) return null;

  const isLast = step === STEPS.length - 1;

  const arrowStyle: React.CSSProperties = (() => {
    const base: React.CSSProperties = {
      position: "absolute",
      width: 0,
      height: 0,
      borderStyle: "solid",
    };
    if (pos.arrowSide === "left") {
      return {
        ...base,
        left: -ARROW,
        top: "50%",
        transform: "translateY(-50%)",
        borderWidth: `${ARROW}px ${ARROW}px ${ARROW}px 0`,
        borderColor: "transparent var(--bg2) transparent transparent",
      };
    }
    if (pos.arrowSide === "right") {
      return {
        ...base,
        right: -ARROW,
        top: "50%",
        transform: "translateY(-50%)",
        borderWidth: `${ARROW}px 0 ${ARROW}px ${ARROW}px`,
        borderColor: "transparent transparent transparent var(--bg2)",
      };
    }
    // top arrow (tooltip is below element)
    return {
      ...base,
      top: -ARROW,
      left: "50%",
      transform: "translateX(-50%)",
      borderWidth: `0 ${ARROW}px ${ARROW}px ${ARROW}px`,
      borderColor: "transparent transparent var(--bg2) transparent",
    };
  })();

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onSkip}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          background: "rgba(0,0,0,0.45)",
        }}
      />

      {/* Highlight cutout ring around target */}
      {highlightRect && (
        <div
          style={{
            position: "fixed",
            zIndex: 9999,
            top: highlightRect.top - 4,
            left: highlightRect.left - 4,
            width: highlightRect.width + 8,
            height: highlightRect.height + 8,
            borderRadius: 8,
            boxShadow: "0 0 0 4px var(--ac)",
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
          border: "1px solid var(--bd2)",
          borderRadius: "var(--r8)",
          padding: "14px 16px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          color: "var(--tx0)",
        }}
      >
        {/* Arrow */}
        <div style={{ position: "relative" }}>
          <div style={arrowStyle} />
        </div>

        {/* Step counter */}
        <div style={{ fontSize: 11, color: "var(--tx2)", marginBottom: 6 }}>
          Step {step + 1} of {STEPS.length}
        </div>

        {/* Title */}
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
          {currentStep.title}
        </div>

        {/* Body */}
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--tx1)", lineHeight: 1.5 }}>
          {currentStep.content}
        </p>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            className="btn"
            style={{ fontSize: 12, padding: "3px 10px", color: "var(--tx2)" }}
            onClick={onSkip}
          >
            Skip tour
          </button>
          <button
            className="btn"
            style={{ fontSize: 12, padding: "3px 10px", background: "var(--ac)", color: "#fff", borderColor: "var(--ac)" }}
            onClick={onNext}
          >
            {isLast ? "Done" : "Next →"}
          </button>
        </div>
      </div>
    </>
  );
}

export { STEPS };
