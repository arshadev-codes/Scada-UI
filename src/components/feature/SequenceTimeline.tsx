import { motion, useReducedMotion, type MotionValue } from 'framer-motion';
import { Check, X } from 'lucide-react';
import type { SeqStep } from '@/services/plc';
import type { SequenceDurations } from '@/config/tests';
import { cn } from '@/lib/format';

type NodeState = 'pending' | 'active' | 'done' | 'aborted';

interface StepDef {
  key: 'OUT1' | 'WAIT' | 'OUT2' | 'COMPLETE';
  n: string;
  title: string;
  detail: string[];
  seconds?: number;
}

interface SequenceTimelineProps {
  /** Step currently shown (read back from the PLC, or the run outcome) */
  step: SeqStep;
  /** Step at which the sequence was aborted, if any */
  abortedAt: SeqStep | null;
  durations: SequenceDurations;
  /** 0..1 progress within the active step */
  progress: MotionValue<number>;
}

const ORDER = ['OUT1', 'WAIT', 'OUT2', 'COMPLETE'] as const;

function stateFor(idx: number, step: SeqStep, abortedAt: SeqStep | null): NodeState {
  if (step === 'ABORTED' && abortedAt) {
    const at = ORDER.indexOf(abortedAt as (typeof ORDER)[number]);
    if (idx < at) return 'done';
    if (idx === at) return 'aborted';
    return 'pending';
  }
  if (step === 'COMPLETE') return 'done';
  const cur = ORDER.indexOf(step as (typeof ORDER)[number]);
  if (cur < 0) return 'pending';
  if (idx < cur) return 'done';
  if (idx === cur) return 'active';
  return 'pending';
}

export function SequenceTimeline({ step, abortedAt, durations, progress }: SequenceTimelineProps) {
  const steps: StepDef[] = [
    { key: 'OUT1', n: '01', title: 'Output 1 On', detail: ['Y0 ON', `T1 ${durations.t1}s`, 'Y0 OFF'], seconds: durations.t1 },
    { key: 'WAIT', n: '02', title: 'Wait', detail: ['DELAY', `${durations.wait}s`], seconds: durations.wait },
    { key: 'OUT2', n: '03', title: 'Output 2 On', detail: ['Y1 ON', `T2 ${durations.t2}s`, 'STORE'], seconds: durations.t2 },
    { key: 'COMPLETE', n: '04', title: 'Complete', detail: ['READING', 'LOGGED'] },
  ];

  return (
    <ol className="grid grid-cols-4" aria-label="Test sequence">
      {steps.map((s, i) => {
        const st = stateFor(i, step, abortedAt);
        const nextSt = i < steps.length - 1 ? stateFor(i + 1, step, abortedAt) : null;
        return (
          <li
            key={s.key}
            className="relative flex flex-col items-start pr-4"
            aria-current={st === 'active' ? 'step' : undefined}
          >
            {/* connector to next */}
            {i < steps.length - 1 && (
              <Connector state={st} nextState={nextSt} progress={progress} />
            )}
            <Node state={st} n={s.n} />
            <div className="mt-3 min-w-0">
              <div
                className={cn(
                  'font-display text-[15px] font-semibold uppercase tracking-[0.14em] transition-colors',
                  st === 'active' ? 'text-amber' : st === 'done' ? 'text-fg' : st === 'aborted' ? 'text-fault' : 'text-fg-dim',
                )}
              >
                {s.title}
              </div>
              <div className="num mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px] text-fg-dim">
                {s.detail.map((d, j) => (
                  <span key={j} className="flex items-center gap-1.5">
                    {j > 0 && <span className="text-line-strong">→</span>}
                    <span className={cn(st === 'active' && 'text-fg-muted')}>{d}</span>
                  </span>
                ))}
              </div>
              <span className="sr-only">
                {st === 'done' ? 'completed' : st === 'active' ? 'in progress' : st === 'aborted' ? 'aborted' : 'pending'}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Node({ state, n }: { state: NodeState; n: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative z-10 grid size-11 place-items-center">
      {state === 'active' && !reduce && (
        <>
          <motion.span
            aria-hidden
            className="absolute inset-0 border border-amber"
            animate={{ scale: [1, 1.55], opacity: [0.8, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
          />
          <motion.span
            aria-hidden
            className="absolute -inset-2 bg-amber/25 blur-md"
            animate={{ opacity: [0.3, 0.9, 0.3] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        </>
      )}
      <div
        className={cn(
          'relative grid size-11 place-items-center border transition-colors duration-300',
          state === 'active' && 'border-amber bg-amber text-ink-950',
          state === 'done' && 'border-ok/70 bg-ok/10 text-ok',
          state === 'aborted' && 'border-fault bg-fault/15 text-fault',
          state === 'pending' && 'border-line-strong bg-ink-900 text-fg-dim',
        )}
      >
        {state === 'done' ? (
          <motion.span initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 20 }}>
            <Check className="size-5" strokeWidth={2.5} aria-hidden />
          </motion.span>
        ) : state === 'aborted' ? (
          <X className="size-5" strokeWidth={2.5} aria-hidden />
        ) : (
          <span className="num text-sm font-bold">{n}</span>
        )}
      </div>
    </div>
  );
}

function Connector({
  state,
  nextState,
  progress,
}: {
  state: NodeState;
  nextState: NodeState | null;
  progress: MotionValue<number>;
}) {
  const filled = state === 'done' && nextState !== 'pending';
  return (
    <div aria-hidden className="absolute left-11 right-0 top-[21px] h-[2px] bg-line">
      {state === 'active' ? (
        <motion.div className="absolute inset-0 origin-left bg-amber" style={{ scaleX: progress }} />
      ) : (
        <motion.div
          className={cn('absolute inset-0 origin-left', state === 'aborted' ? 'bg-fault/40' : 'bg-ok/60')}
          initial={false}
          animate={{ scaleX: filled ? 1 : 0 }}
          transition={{ duration: 0.4 }}
        />
      )}
    </div>
  );
}
