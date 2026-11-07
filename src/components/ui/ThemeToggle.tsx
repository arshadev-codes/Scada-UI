import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useThemeStore } from '@/store/themeStore';
import { cn } from '@/lib/format';

interface ThemeToggleProps {
  className?: string;
}

/**
 * Dark / light switch. Where supported, the new theme is revealed as a circle
 * expanding from the button (View Transitions API); otherwise colours cross-fade.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const reduce = useReducedMotion();
  const next = theme === 'dark' ? 'light' : 'dark';

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    const root = document.documentElement;
    if (reduce) {
      toggle();
      return;
    }
    if (typeof document.startViewTransition !== 'function' || document.visibilityState !== 'visible') {
      root.classList.add('theme-fade');
      toggle();
      window.setTimeout(() => root.classList.remove('theme-fade'), 400);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const transition = document.startViewTransition(() => toggle());
    transition.ready
      .then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 650, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
        );
      })
      // An aborted transition (tab hidden, rapid re-click) still applies the theme.
      .catch(() => undefined);
    transition.finished.catch(() => undefined);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={cn(
        'relative grid size-9 place-items-center overflow-hidden rounded-[10px] border border-line bg-ink-850 text-fg-muted transition-colors hover:border-accent/70 hover:text-accent',
        className,
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={theme}
          initial={{ y: 14, rotate: -90, opacity: 0 }}
          animate={{ y: 0, rotate: 0, opacity: 1 }}
          exit={{ y: -14, rotate: 90, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 26 }}
          className="grid place-items-center"
        >
          {theme === 'dark' ? <Moon className="size-4" aria-hidden /> : <Sun className="size-4" aria-hidden />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
