import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/format';

export type LampColor = 'amber' | 'ok' | 'fault' | 'r' | 'y' | 'b';

const fill: Record<LampColor, string> = {
  amber: 'bg-[var(--viz-amber)]',
  ok: 'bg-ok',
  fault: 'bg-fault',
  r: 'bg-phase-r',
  y: 'bg-phase-y',
  b: 'bg-phase-b',
};

interface LampProps {
  on: boolean;
  color?: LampColor;
  size?: 'sm' | 'md' | 'lg';
  /** Pulse the glow while on */
  pulse?: boolean;
  /** Blink the lamp itself (e.g. connecting) */
  blink?: boolean;
  className?: string;
  label?: string;
}

const sizes = { sm: 'size-2', md: 'size-3', lg: 'size-6' } as const;

/** Panel pilot lamp: lens in a metal bezel; a pulsing lamp brightens and dims. */
export function Lamp({ on, color = 'amber', size = 'md', pulse, blink, className, label }: LampProps) {
  const reduce = useReducedMotion();
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label ? `${label}: ${on ? 'on' : 'off'}` : undefined}
      aria-hidden={label ? undefined : true}
      className={cn('relative inline-flex shrink-0 items-center justify-center', sizes[size], className)}
    >
      <motion.span
        className="absolute inset-0 z-10 rounded-full bg-white"
        initial={false}
        animate={
          on
            ? pulse && !reduce
              ? { opacity: [0.18, 0.5, 0.18] }
              : { opacity: 0.3 }
            : { opacity: 0 }
        }
        transition={pulse && on ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
      />
      <span
        className={cn(
          'relative rounded-full border transition-colors duration-150',
          sizes[size],
          on ? cn(fill[color], 'border-white/30') : 'border-line-strong bg-ink-700',
          blink && 'animate-blink',
        )}
      />
      {on && <span className="absolute left-[22%] top-[18%] size-[30%] rounded-full bg-white/60" />}
    </span>
  );
}
