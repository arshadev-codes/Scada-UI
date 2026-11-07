import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type { LogEntry, LogLevel } from '@/hooks/useSequenceLog';
import { clockTime, cn } from '@/lib/format';

const levelClass: Record<LogLevel, string> = {
  info: 'text-fg-muted',
  cmd: 'text-phase-b',
  ok: 'text-ok',
  warn: 'text-amber',
  fault: 'text-fault',
};

const levelTag: Record<LogLevel, string> = {
  info: 'INF',
  cmd: 'CMD',
  ok: 'OK ',
  warn: 'PWR',
  fault: 'FLT',
};

export function EventLog({ entries, className }: { entries: LogEntry[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  return (
    <div
      ref={ref}
      role="log"
      aria-live="polite"
      aria-label="Event log"
      tabIndex={0}
      className={cn('num h-56 overflow-y-auto bg-ink-950/60 px-4 py-3 text-[14px] leading-[1.65]', className)}
    >
      {entries.length === 0 && <div className="text-fg-dim">— no events —</div>}
      {entries.map((e) => (
        <motion.div
          key={e.id}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className="flex gap-4 whitespace-pre"
        >
          <span className="text-fg-dim">{clockTime(e.ts)}</span>
          <span className={cn('opacity-70', levelClass[e.level])}>{levelTag[e.level]}</span>
          <span className={levelClass[e.level]}>{e.text}</span>
        </motion.div>
      ))}
      <div className="flex gap-4 text-fg-dim">
        <span className="invisible">00:00:00</span>
        <span className="animate-blink text-amber">▌</span>
      </div>
    </div>
  );
}
