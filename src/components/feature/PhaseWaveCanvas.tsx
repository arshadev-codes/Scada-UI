import { useReducedMotion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/format';
import { useThemeStore } from '@/store/themeStore';

interface PhaseWaveCanvasProps {
  className?: string;
  /** Scroll speed in cycles per second */
  speed?: number;
  /** Number of visible cycles across the width */
  cycles?: number;
  /** 0..1 — vertical amplitude as a fraction of half-height */
  amplitude?: number;
  /** Draw graticule divisions */
  graticule?: boolean;
  /** Overall opacity of the traces */
  intensity?: number;
}

/** Colours come from theme CSS variables (`r, g, b` triplets). */
const PHASES = [
  { colorVar: '--viz-phase-r', shift: 0 }, // R
  { colorVar: '--viz-phase-y', shift: (2 * Math.PI) / 3 }, // Y  (-120°)
  { colorVar: '--viz-phase-b', shift: (4 * Math.PI) / 3 }, // B  (-240°)
] as const;

/**
 * Three-phase R/Y/B sine traces, 120° apart, scrolling like an oscilloscope.
 * Pure canvas; pauses automatically when the tab is hidden (rAF).
 */
export function PhaseWaveCanvas({
  className,
  speed = 0.12,
  cycles = 2.5,
  amplitude = 0.42,
  graticule = true,
  intensity = 1,
}: PhaseWaveCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const css = getComputedStyle(document.documentElement);
    const grat = css.getPropertyValue('--viz-grat').trim() || 'rgba(255,255,255,0.045)';
    const axis = css.getPropertyValue('--viz-grat-axis').trim() || 'rgba(255,255,255,0.09)';
    const phases = PHASES.map((p) => ({ shift: p.shift, color: css.getPropertyValue(p.colorVar).trim() || '255, 255, 255' }));

    let w = 0;
    let h = 0;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawGraticule = () => {
      const div = 10;
      ctx.lineWidth = 1;
      ctx.strokeStyle = grat;
      ctx.beginPath();
      for (let i = 1; i < div; i++) {
        const x = Math.round((w / div) * i) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let i = 1; i < 8; i++) {
        const y = Math.round((h / 8) * i) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
      // centre axis with ticks
      const cy = Math.round(h / 2) + 0.5;
      ctx.strokeStyle = axis;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(w, cy);
      for (let x = 0; x < w; x += w / 50) {
        ctx.moveTo(Math.round(x) + 0.5, cy - 3);
        ctx.lineTo(Math.round(x) + 0.5, cy + 3);
      }
      ctx.stroke();
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      if (graticule) drawGraticule();

      const cy = h / 2;
      const amp = (h / 2) * amplitude;
      const k = (Math.PI * 2 * cycles) / w;
      const phase = t * speed * Math.PI * 2;
      const step = Math.max(2, w / 600);

      ctx.lineJoin = 'round';
      for (const p of phases) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += step) {
          const y = cy - Math.sin(x * k - phase - p.shift) * amp;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        // phosphor bloom then crisp core
        ctx.strokeStyle = `rgba(${p.color}, ${0.12 * intensity})`;
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.strokeStyle = `rgba(${p.color}, ${0.7 * intensity})`;
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }
    };

    const loop = (now: number) => {
      draw(now / 1000);
      raf = requestAnimationFrame(loop);
    };

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw(0);
    });
    ro.observe(canvas);

    if (reduce) draw(0);
    else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [speed, cycles, amplitude, graticule, intensity, reduce, theme]);

  return <canvas ref={ref} aria-hidden className={cn('block h-full w-full', className)} />;
}
