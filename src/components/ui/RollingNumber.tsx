import { cn } from '@/lib/format';

/**
 * Number shown on mechanical counter wheels: each digit is a drum that rolls
 * to its new value instead of blinking. Pass the already-formatted text.
 */
export function RollingNumber({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn('inline-flex overflow-hidden leading-none tabular-nums', className)} aria-label={text}>
      {text.split('').map((ch, i) => {
        const d = ch.charCodeAt(0) - 48;
        if (d < 0 || d > 9) {
          return (
            <span key={i} aria-hidden>
              {ch}
            </span>
          );
        }
        return (
          // Key by position from the right, so units stay units when the length changes
          <span key={`d${text.length - i}`} aria-hidden className="relative inline-block h-[1em] w-[0.62em] overflow-hidden">
            <span
              className="absolute inset-x-0 top-0 flex flex-col items-center transition-transform duration-200 ease-out"
              style={{ transform: `translateY(${-d}em)` }}
            >
              {'0123456789'.split('').map((n) => (
                <span key={n} className="h-[1em]">
                  {n}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
