"use client";

import { useEffect, useRef } from "react";

/** Grid pitch in CSS pixels. */
const GAP = 26;
/** Resting dot radius. */
const DOT = 1.1;
/** Cursor influence radius. */
const RADIUS = 150;
/** How far a dot right under the cursor is pushed away. */
const PUSH = 14;
/** Spring toward each dot's target offset, per frame. */
const EASE = 0.14;

const REST = "rgba(20, 20, 20, 0.13)";

interface Dot {
  x: number;
  y: number;
  /** current offset from the grid point */
  dx: number;
  dy: number;
  /** current influence 0..1 (drives size and colour) */
  t: number;
}

/**
 * Desk background: a quiet grid of dots behind the page. Near the cursor the
 * dots part like a ripple, grow and warm to the site's red, then ease back.
 * Fixed and non-interactive (pointer-events: none). The loop only runs while
 * something is moving and stops once every dot is at rest; it sleeps in hidden
 * tabs. With reduced motion, or without a mouse, it draws the still grid.
 */
export function DotField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const interactive = !reduced && finePointer;
    const red = getComputedStyle(document.documentElement).getPropertyValue("--red").trim() || "#d8121f";

    let dots: Dot[] = [];
    let w = 0;
    let h = 0;
    let frame = 0;
    // Cursor in viewport coordinates; far away when unknown.
    let mx = -1e4;
    let my = -1e4;

    const layout = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const ox = ((w % GAP) + GAP) / 2;
      const oy = ((h % GAP) + GAP) / 2;
      dots = [];
      for (let y = oy; y < h; y += GAP) for (let x = ox; x < w; x += GAP) dots.push({ x, y, dx: 0, dy: 0, t: 0 });
    };

    /** Advance every dot one step toward its target; returns whether anything is still moving. */
    const step = () => {
      let moving = false;
      for (const d of dots) {
        const vx = d.x - mx;
        const vy = d.y - my;
        const dist = Math.hypot(vx, vy);
        let tx = 0;
        let ty = 0;
        let tt = 0;
        if (dist < RADIUS) {
          const f = 1 - dist / RADIUS;
          tt = f * f;
          const k = (PUSH * tt) / (dist || 1);
          tx = vx * k;
          ty = vy * k;
        }
        d.dx += (tx - d.dx) * EASE;
        d.dy += (ty - d.dy) * EASE;
        d.t += (tt - d.t) * EASE;
        if (Math.abs(tx - d.dx) > 0.05 || Math.abs(ty - d.dy) > 0.05 || Math.abs(tt - d.t) > 0.005) moving = true;
      }
      return moving;
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      // Resting dots in one path, then the active ones on top in red.
      ctx.fillStyle = REST;
      ctx.beginPath();
      for (const d of dots) {
        if (d.t > 0.02) continue;
        ctx.moveTo(d.x + d.dx + DOT, d.y + d.dy);
        ctx.arc(d.x + d.dx, d.y + d.dy, DOT, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.fillStyle = red;
      for (const d of dots) {
        if (d.t <= 0.02) continue;
        ctx.globalAlpha = 0.18 + 0.6 * d.t;
        ctx.beginPath();
        ctx.arc(d.x + d.dx, d.y + d.dy, DOT + 1.6 * d.t, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const tick = () => {
      frame = 0;
      const moving = step();
      draw();
      if (moving) frame = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!frame && interactive && !document.hidden) frame = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      mx = e.clientX;
      my = e.clientY;
      wake();
    };
    const onLeave = () => {
      mx = -1e4;
      my = -1e4;
      wake();
    };
    const onResize = () => {
      layout();
      draw();
    };
    const onVisibility = () => {
      if (document.hidden && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    layout();
    draw();
    window.addEventListener("resize", onResize);
    if (interactive) {
      window.addEventListener("pointermove", onMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />;
}
