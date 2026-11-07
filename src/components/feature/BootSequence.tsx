import { useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/format';

export interface BootLine {
  text: string;
  /** Status suffix printed after the dotted leader */
  status?: string;
  tone?: 'ok' | 'amber' | 'muted';
}

interface BootSequenceProps {
  lines: readonly BootLine[];
  onDone?: () => void;
  charMs?: number;
  /** Jump straight to the end (operator pressed a key / clicked) */
  skip?: boolean;
  className?: string;
}

const toneClass = { ok: 'text-ok', amber: 'text-amber', muted: 'text-fg-dim' } as const;

/** Types out lines like a POST / boot console. */
export function BootSequence({ lines, onDone, charMs = 18, skip = false, className }: BootSequenceProps) {
  const reduce = useReducedMotion();
  const [lineIdx, setLineIdx] = useState(reduce ? lines.length : 0);
  const [charIdx, setCharIdx] = useState(0);

  useEffect(() => {
    if (skip) setLineIdx(lines.length);
  }, [skip, lines.length]);

  useEffect(() => {
    if (lineIdx >= lines.length) {
      const id = setTimeout(() => onDone?.(), reduce ? 0 : 250);
      return () => clearTimeout(id);
    }
    const current = lines[lineIdx].text;
    if (charIdx < current.length) {
      const id = setTimeout(() => setCharIdx((c) => c + 1), charMs);
      return () => clearTimeout(id);
    }
    // pause at end of line, longer for the "thinking" ones
    const id = setTimeout(() => {
      setLineIdx((l) => l + 1);
      setCharIdx(0);
    }, lines[lineIdx].status ? 260 : 120);
    return () => clearTimeout(id);
  }, [lineIdx, charIdx, lines, charMs, onDone, reduce]);

  return (
    <div className={cn('num space-y-1 text-[14px] leading-5', className)} aria-live="polite">
      {lines.map((l, i) => {
        if (i > lineIdx) return null;
        const done = i < lineIdx;
        const text = done ? l.text : l.text.slice(0, charIdx);
        return (
          <div key={i} className="flex gap-2 whitespace-pre text-fg-muted">
            <span className="text-fg-dim">{String(i).padStart(2, '0')}</span>
            <span>{text}</span>
            {done && l.status && (
              <>
                <span className="min-w-4 flex-1 overflow-hidden text-fg-dim/50">{'.'.repeat(64)}</span>
                <span className={toneClass[l.tone ?? 'ok']}>{l.status}</span>
              </>
            )}
            {!done && <span className="animate-blink text-amber">▌</span>}
          </div>
        );
      })}
    </div>
  );
}
