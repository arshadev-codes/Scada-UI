import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock, Lock } from 'lucide-react';
import type { TestDefinition } from '@/config/tests';
import { totalDuration } from '@/config/tests';
import { Brackets, powerUp } from '@/components/ui';
import { cn, durationLabel } from '@/lib/format';

interface TestCardProps {
  def: TestDefinition;
  /** 1-based position in the run order, or null if not selected */
  order: number | null;
  onToggle: () => void;
}

/** Selectable test tile. The whole card is one toggle button. */
export function TestCard({ def, order, onToggle }: TestCardProps) {
  const selected = order !== null;
  const Icon = def.icon;

  return (
    <motion.article variants={powerUp} className="h-full">
      <button
        type="button"
        onClick={onToggle}
        disabled={!def.available}
        aria-pressed={selected}
        aria-label={`${def.name}${selected ? `, selected, position ${order}` : ''}`}
        data-active={selected ? 'true' : undefined}
        className={cn(
          'group relative flex h-full w-full flex-col rounded-[14px] border bg-ink-850 p-5 text-left shadow-[var(--shadow-panel)] transition-[border-color,box-shadow,transform] duration-200',
          'disabled:cursor-not-allowed disabled:opacity-50',
          selected
            ? 'border-accent/70 shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_14%,transparent),var(--shadow-panel)]'
            : 'border-line hover:-translate-y-0.5 hover:border-line-strong',
        )}
      >
        <Brackets color={selected ? 'border-accent' : 'border-fg-dim'} />

        <div className="flex items-start gap-4">
          <div
            className={cn(
              'grid size-11 shrink-0 place-items-center rounded-[11px] border transition-colors',
              selected ? 'border-accent/40 bg-accent-deep text-accent' : 'border-line bg-ink-800 text-fg-muted group-hover:text-fg',
            )}
          >
            <Icon className="size-5" strokeWidth={1.75} aria-hidden />
          </div>

          <div className="min-w-0 flex-1">
            <div className="num mb-1 text-[13px] text-fg-dim">
              {def.code} · TEST-{String(def.plcCode).padStart(2, '0')}
            </div>
            <h3 className="font-display text-[16px] font-bold leading-snug tracking-[-0.01em] text-fg">
              {def.name}
            </h3>
          </div>

          {/* order badge / checkbox */}
          <div
            aria-hidden
            className={cn(
              'relative grid size-8 shrink-0 place-items-center rounded-full border-2 transition-colors',
              selected ? 'border-accent bg-accent text-[var(--on-accent)]' : 'border-line-strong group-hover:border-fg-dim',
            )}
          >
            {!def.available ? (
              <Lock className="size-3.5 text-fg-dim" />
            ) : (
              <AnimatePresence mode="popLayout" initial={false}>
                {selected ? (
                  <motion.span
                    key={order}
                    className="num text-sm font-bold"
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 26 }}
                  >
                    {order}
                  </motion.span>
                ) : (
                  <Check key="chk" className="size-4 text-fg-dim opacity-0 transition-opacity group-hover:opacity-100" />
                )}
              </AnimatePresence>
            )}
          </div>
        </div>

        <p className="mt-3 flex-1 text-[15px] leading-relaxed text-fg-muted">{def.description}</p>

        <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
          <span className="num flex items-center gap-1.5 text-[13px] text-fg-dim">
            <Clock className="size-3" aria-hidden />
            {durationLabel(totalDuration(def.defaultDurations))}
          </span>
          <span className={cn('text-[13px] font-semibold', selected ? 'text-accent' : 'text-fg-dim')}>
            {selected ? 'Selected' : 'Click to add'}
          </span>
        </div>
      </button>
    </motion.article>
  );
}
