import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  type HTMLMotionProps,
} from 'framer-motion';
import { forwardRef, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@/lib/format';

type Variant = 'primary' | 'danger' | 'ghost' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'xl';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  size?: Size;
  /** Magnetic pull toward the cursor (primary actions). */
  magnetic?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-[var(--on-accent)] font-bold border-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_6px_16px_-8px_var(--color-accent)] hover:bg-accent-soft hover:border-accent-soft disabled:bg-ink-700 disabled:shadow-none disabled:text-fg-dim disabled:border-line',
  danger:
    'bg-fault text-white border-fault shadow-[inset_0_1px_0_rgb(255_255_255/0.2)] hover:brightness-110 disabled:bg-ink-700 disabled:shadow-none disabled:text-fg-dim disabled:border-line',
  outline:
    'bg-ink-850 text-fg border-line-strong hover:border-accent hover:text-accent disabled:text-fg-dim disabled:hover:border-line-strong',
  ghost: 'bg-transparent text-fg-muted border-transparent hover:bg-ink-750 hover:text-fg disabled:text-fg-dim',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-[9px]',
  md: 'h-10 px-4 text-[14px] gap-2 rounded-[10px]',
  lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-[12px]',
  xl: 'h-16 px-6 text-[17px] gap-3 rounded-[14px]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', size = 'md', magnetic = false, icon, className, children, disabled, onMouseMove, onMouseLeave, ...rest },
  ref,
) {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 250, damping: 18, mass: 0.4 });
  const y = useSpring(my, { stiffness: 250, damping: 18, mass: 0.4 });
  const pull = magnetic && !reduce && !disabled;

  const handleMove = (e: MouseEvent<HTMLButtonElement>) => {
    if (pull) {
      const r = e.currentTarget.getBoundingClientRect();
      mx.set((e.clientX - (r.left + r.width / 2)) * 0.18);
      my.set((e.clientY - (r.top + r.height / 2)) * 0.28);
    }
    onMouseMove?.(e);
  };
  const handleLeave = (e: MouseEvent<HTMLButtonElement>) => {
    mx.set(0);
    my.set(0);
    onMouseLeave?.(e);
  };

  return (
    <motion.button
      ref={ref}
      type="button"
      disabled={disabled}
      style={pull ? { x, y } : undefined}
      whileTap={disabled || reduce ? undefined : { scale: 0.97 }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={cn(
        'relative inline-flex select-none items-center whitespace-nowrap justify-center border font-display font-semibold tracking-[-0.005em] transition-[background-color,border-color,color,box-shadow] duration-150',
        'disabled:cursor-not-allowed',
        'focus-visible:outline-offset-[3px]',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </motion.button>
  );
});
