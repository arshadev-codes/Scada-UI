import { motion } from 'framer-motion';
import { FileText, ListPlus } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTestDefinition } from '@/config/tests';
import { useAppStore } from '@/store/appStore';
import type { RunStatus } from '@/store/types';
import { cn } from '@/lib/format';

/** Tab the indicator was on before this page mounted, so it can slide from there. */
let lastIndex: number | null = null;
/** +1 = moved right, −1 = moved left. Read by the execution page for its slide-in. */
export let switchDirection = 0;

const DOT: Record<RunStatus, string> = {
  pending: 'bg-line-strong',
  running: 'bg-amber animate-glow',
  completed: 'bg-ok',
  aborted: 'bg-fault',
};

/**
 * Tab strip on the execution page: jump between the selected tests.
 * Locked while a test is running so the PLC is never left unwatched.
 */
export function TestSwitcher({ current, locked }: { current: string; locked: boolean }) {
  const navigate = useNavigate();
  const selection = useAppStore((s) => s.selection);
  const runs = useAppStore((s) => s.runs);
  const results = useAppStore((s) => s.results);

  const n = selection.length;
  const idx = selection.findIndex((s) => s.testId === current);
  const from = lastIndex !== null && lastIndex < n ? lastIndex : idx;
  useEffect(() => {
    lastIndex = idx;
    switchDirection = 0;
  }, [idx]);

  const verdict = (id: string): boolean | undefined =>
    id === 'no-load' ? results.nll?.pass : id === 'magnetic-balance' ? (results.mbt?.result?.pass ?? undefined) : undefined;

  const go = (i: number) => {
    if (i === idx || locked) return;
    switchDirection = i > idx ? 1 : -1;
    navigate(`/test/${selection[i].testId}`);
  };

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: -8 }, show: { opacity: 1, y: 0 } }}
      className="flex items-stretch gap-2 print:hidden"
    >
      <div
        role="tablist"
        aria-label="Switch test"
        className="relative grid min-w-0 flex-1 overflow-hidden rounded-[12px] border border-line bg-ink-850/85 backdrop-blur-[2px]"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        <motion.div
          aria-hidden
          className="absolute inset-y-0 border-b-2 border-accent bg-accent/[0.09]"
          style={{ width: `${100 / n}%` }}
          initial={{ left: `${(from * 100) / n}%` }}
          animate={{ left: `${(idx * 100) / n}%` }}
          transition={{ type: 'spring', stiffness: 320, damping: 32, delay: 0.15 }}
        >
          <div className="absolute inset-x-0 bottom-0 h-6 bg-linear-to-t from-accent/25 to-transparent" />
        </motion.div>

        {selection.map((s, i) => {
          const def = getTestDefinition(s.testId);
          const active = i === idx;
          const status = runs[s.testId]?.status ?? 'pending';
          const pass = verdict(s.testId);
          const Icon = def?.icon;
          return (
            <button
              key={s.testId}
              role="tab"
              type="button"
              aria-selected={active}
              disabled={locked && !active}
              onClick={() => go(i)}
              title={locked && !active ? 'Stop the running test first' : def?.name}
              className={cn(
                'group relative flex min-w-0 items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
                i > 0 && 'border-l border-line',
                active ? 'text-fg' : 'text-fg-muted hover:bg-ink-800/60 hover:text-fg',
                'disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              {Icon && (
                <Icon
                  className={cn('size-4 shrink-0 transition-transform group-hover:scale-110', active ? 'text-accent' : 'text-fg-dim')}
                  strokeWidth={1.8}
                  aria-hidden
                />
              )}
              <span className="min-w-0">
                <span className="num block text-[13px] text-fg-dim">
                  {String(i + 1).padStart(2, '0')} · {def?.code}
                </span>
                <span className="label-tech block truncate text-[13px] text-current">{def?.name}</span>
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                {pass !== undefined && (
                  <span className={cn('num text-[12px]', pass ? 'text-ok' : 'text-fault')}>{pass ? 'PASS' : 'FAIL'}</span>
                )}
                <span className={cn('size-2 rounded-full', DOT[status])} aria-label={status} />
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => navigate('/test-selection')}
        disabled={locked}
        title="Add or remove tests"
        className="grid w-12 shrink-0 place-items-center rounded-[12px] border border-line bg-ink-850/85 text-fg-muted transition-colors hover:border-accent/60 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ListPlus className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => navigate('/report')}
        disabled={locked}
        title="Test report"
        className="grid w-12 shrink-0 place-items-center rounded-[12px] border border-line bg-ink-850/85 text-fg-muted transition-colors hover:border-accent/60 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        <FileText className="size-4" aria-hidden />
      </button>
    </motion.div>
  );
}
