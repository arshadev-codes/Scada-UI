import { motion } from 'framer-motion';
import { useId, useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/format';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  sub?: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: ReadonlyArray<SegmentOption<T>>;
  onChange: (value: T) => void;
  label: string;
  /** Hide the label visually but keep it for screen readers */
  hideLabel?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
  /** Keep label casing (e.g. element symbols "Cu", "Al") */
  preserveCase?: boolean;
  className?: string;
}

/** Radio-group style segmented toggle with a sliding indicator. Arrow keys move selection. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  hideLabel,
  disabled,
  size = 'md',
  preserveCase = false,
  className,
}: SegmentedProps<T>) {
  const groupId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (idx + dir + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span id={`${groupId}-lbl`} className={cn('label-tech text-[13px]', hideLabel && 'sr-only')}>
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${groupId}-lbl`}
        aria-disabled={disabled || undefined}
        className={cn(
          'relative grid gap-0.5 rounded-[11px] border border-line bg-ink-750 p-1',
          disabled && 'opacity-50',
        )}
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o, i) => {
          const selected = o.value === value;
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                'relative z-0 flex flex-col items-center justify-center rounded-[8px] font-display font-semibold transition-colors',
                size === 'sm' ? 'h-7 text-[13px]' : 'h-9 text-[14px]',
                selected ? 'text-accent' : 'text-fg-muted hover:text-fg',
                disabled && 'cursor-not-allowed',
              )}
            >
              {selected && (
                <motion.span
                  layoutId={`${groupId}-pill`}
                  className="absolute inset-0 -z-10 rounded-[8px] bg-ink-850 shadow-[0_1px_2px_rgb(22_32_42/0.12),0_2px_8px_-2px_rgb(22_32_42/0.12)] ring-1 ring-accent/25"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              )}
              <span className={cn(selected && 'font-bold', preserveCase && 'normal-case')}>{o.label}</span>
              {o.sub && <span className="num text-[12px] font-normal normal-case tracking-normal opacity-70">{o.sub}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
