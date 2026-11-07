import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { stagger } from '@/components/ui';
import { cn } from '@/lib/format';

interface PageProps {
  children: ReactNode;
  className?: string;
  /** Delay before the first child powers up (after the page transition) */
  delay?: number;
  /** Slide the whole page in from the right (1) or left (−1), e.g. switching tests */
  slide?: number;
}

/** Route-level wrapper: staggers child panels in, slides/fades out on exit. */
export function Page({ children, className, delay = 0.3, slide = 0 }: PageProps) {
  const { show } = stagger(0.07, delay);
  return (
    <motion.div
      variants={{
        hidden: { opacity: slide ? 0 : 1, x: slide * 48 },
        show: { ...show, opacity: 1, x: 0, transition: { ...(show as { transition: object }).transition, duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
      }}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, y: -10, scale: 0.985, transition: { duration: 0.2, ease: 'easeIn' } }}
      className={cn('flex flex-col gap-5', className)}
    >
      {children}
    </motion.div>
  );
}

interface PageHeaderProps {
  code: string;
  title: string;
  subtitle?: ReactNode;
  aside?: ReactNode;
}

/**
 * Screen title in a heavy cut — like a stamped nameplate —
 * uncovered once with a wipe. The step code is already shown by the live bus in
 * the top bar, so it is kept for screen readers only.
 */
export function PageHeader({ code, title, subtitle, aside }: PageHeaderProps) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.3 } } }}
      className="flex flex-wrap items-end justify-between gap-4 pb-1"
    >
      <div className="min-w-0">
        <span className="sr-only">{code}</span>
        <h1 className="title-wipe type-plate font-display text-[34px] leading-[1.05] text-fg md:text-[40px]">{title}</h1>
        {subtitle && <p className="mt-2.5 max-w-[78ch] text-[15px] leading-relaxed text-fg-muted">{subtitle}</p>}
      </div>
      {aside && <div className="flex items-center gap-3">{aside}</div>}
    </motion.div>
  );
}
