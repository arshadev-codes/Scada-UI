import { motion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/format';
import { powerUp } from './motion';

interface PanelProps extends Omit<HTMLMotionProps<'section'>, 'title'> {
  /** Technical tag shown at top-left, e.g. "PNL-01" */
  tag?: string;
  title?: ReactNode;
  /** Right-aligned header content */
  aside?: ReactNode;
  /** Highlight the frame (e.g. energised state) */
  active?: boolean;
  tone?: 'default' | 'amber' | 'fault' | 'ok';
  bodyClassName?: string;
  edge?: boolean;
  children?: ReactNode;
}

const toneBorder: Record<NonNullable<PanelProps['tone']>, string> = {
  default: 'border-line',
  amber: 'border-amber/50',
  fault: 'border-fault/50',
  ok: 'border-ok/45',
};

/** Small status pip before the title for non-default tones. */
const tonePip: Record<NonNullable<PanelProps['tone']>, string> = {
  default: '',
  amber: 'bg-[var(--live)]',
  fault: 'bg-fault',
  ok: 'bg-ok',
};

/**
 * Panel: white glaze surface on the porcelain page. The title sits inside
 * the panel in the semi-wide cut; while `active` (energised) the panel lifts
 * and a light keeps running round its edge, like current in a conductor.
 */
export function Panel({
  tag,
  title,
  aside,
  active,
  tone = 'default',
  className,
  bodyClassName,
  edge: _edge = true,
  children,
  ...rest
}: PanelProps) {
  const t = active && tone === 'default' ? 'amber' : tone;
  return (
    <motion.section
      variants={powerUp}
      data-active={active ? 'true' : undefined}
      className={cn(
        'relative overflow-hidden rounded-[14px] border bg-ink-850 shadow-[var(--shadow-panel)] transition-[box-shadow,border-color] duration-500',
        toneBorder[t],
        active && 'live-ring shadow-[var(--shadow-live)]',
        className,
      )}
      {...rest}
    >
      {(tag || title || aside) && (
        <header className="flex min-h-[52px] items-center gap-3 border-b border-line/80 px-5 py-3">
          {tonePip[t] && <span aria-hidden className={cn('size-2 shrink-0 rounded-full', tonePip[t], active && 'animate-[glow_1.4s_ease-in-out_infinite]')} />}
          {title && <h2 className="font-display text-[16px] font-bold leading-tight tracking-[-0.01em] text-fg">{title}</h2>}
          {tag && <span className="num text-[12.5px] text-fg-dim">{tag}</span>}
          {aside && <div className="ml-auto flex items-center gap-3 text-[13px] text-fg-muted">{aside}</div>}
        </header>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </motion.section>
  );
}
