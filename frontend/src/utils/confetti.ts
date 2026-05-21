/**
 * Lightweight confetti burst — no external library required.
 *
 * Creates a temporary <canvas> element, fires a burst of particles, then
 * removes itself after the animation completes (~2.8 s).
 *
 * Usage:
 *   import { fireConfetti } from "../utils/confetti";
 *   fireConfetti();                     // default burst
 *   fireConfetti({ x: 0.5, y: 0.4 });  // burst from custom origin (0-1 fractions)
 */

interface ConfettiOptions {
  /** Horizontal origin as fraction of viewport width (0 = left, 1 = right). Default 0.5 */
  x?: number;
  /** Vertical origin as fraction of viewport height (0 = top, 1 = bottom). Default 0.4 */
  y?: number;
  /** Number of particles. Default 90 */
  count?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  width: number;
  height: number;
  color: string;
  alpha: number;
}

export function fireConfetti(opts: ConfettiOptions = {}): void {
  // Defined inside the function to avoid Rollup TDZ in production bundles.
  const COLORS = [
    "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b",
    "#10b981", "#3b82f6", "#f43f5e", "#14b8a6",
    "#facc15", "#a78bfa",
  ];
  const {
    x: ox = 0.5,
    y: oy = 0.4,
    count = 90,
  } = opts;

  const canvas = document.createElement("canvas");
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  canvas.width = vw;
  canvas.height = vh;
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    zIndex: "99999",
    pointerEvents: "none",
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;

  const particles: Particle[] = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 10;
    return {
      x: ox * vw,
      y: oy * vh,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 6,   // upward bias
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.3,
      width: 6 + Math.random() * 8,
      height: 4 + Math.random() * 4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha: 1,
    };
  });

  const GRAVITY = 0.25;
  const DRAG = 0.99;
  let frame: number;

  const tick = () => {
    ctx.clearRect(0, 0, vw, vh);
    let alive = 0;
    for (const p of particles) {
      p.vy += GRAVITY;
      p.vx *= DRAG;
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;
      if (p.y > vh + 20) continue;  // off-screen — skip but keep alive count
      p.alpha = Math.max(0, p.alpha - 0.008);
      alive++;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
      ctx.restore();
    }
    if (alive > 0) {
      frame = requestAnimationFrame(tick);
    } else {
      canvas.remove();
    }
  };

  frame = requestAnimationFrame(tick);

  // Hard-cap cleanup after 4 s in case a particle never fades
  setTimeout(() => {
    cancelAnimationFrame(frame);
    canvas.remove();
  }, 4000);
}
