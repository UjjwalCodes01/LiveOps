'use client';

import { useEffect, useRef } from 'react';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const NODE_COUNT = 46;
const LINK_DISTANCE = 150;
const NODE_COLOR = 'rgba(148, 163, 253, 0.55)';
const LINK_COLOR = (alpha: number) => `rgba(129, 140, 248, ${alpha})`;

// A slow-drifting node/connection mesh behind every page — reinforces the
// "you are watching a live network" theme instead of being decorative for
// its own sake. Pure canvas (no charting/3D library) to keep this cheap:
// it runs continuously behind interactive content.
export function NetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let nodes: Node[] = [];

    function resize() {
      if (!canvas) return;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seed() {
      nodes = Array.from({ length: NODE_COUNT }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
      }));
    }

    resize();
    seed();

    let frame = 0;
    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;
      }
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i]!;
          const b = nodes[j]!;
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist > LINK_DISTANCE) continue;
          ctx.strokeStyle = LINK_COLOR(0.16 * (1 - dist / LINK_DISTANCE));
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      for (const node of nodes) {
        ctx.fillStyle = NODE_COLOR;
        ctx.beginPath();
        ctx.arc(node.x, node.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      // draw() reschedules itself regardless of how it was first invoked —
      // the reduced-motion decision has to live here, not just at the call
      // site, or the very first frame re-enters the loop anyway.
      if (!reduceMotion) frame = window.requestAnimationFrame(draw);
    }

    if (reduceMotion) draw(); // one static frame, no animation loop
    else frame = window.requestAnimationFrame(draw);

    window.addEventListener('resize', resize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 -z-10 opacity-70"
      aria-hidden="true"
    />
  );
}
