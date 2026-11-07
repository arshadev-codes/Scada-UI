import { motion } from 'framer-motion';
import { Check, LogOut } from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/appStore';
import { usePlcStore } from '@/store/plcStore';
import { useClock } from '@/hooks/useClock';
import { clockTime, cn, isoDate } from '@/lib/format';
import { LinkIndicator } from './LinkIndicator';
import { PlcModeSwitch } from './PlcModeSwitch';
import { ThemeToggle } from '@/components/ui';

interface StepDef {
  n: string;
  label: string;
  to: string;
  match: (path: string) => boolean;
  enabled: boolean;
}

export function TopBar() {
  const now = useClock();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const operator = useAppStore((s) => s.operator);
  const testObject = useAppStore((s) => s.testObject);
  const selection = useAppStore((s) => s.selection);
  const runs = useAppStore((s) => s.runs);
  const logout = useAppStore((s) => s.logout);
  const running = usePlcStore((s) => s.status?.running ?? false);
  // a test is energised somewhere → the bus is live
  const live = useAppStore((s) => Object.values(s.runs).some((r) => r.status === 'running')) || running;

  const hasRuns = Object.keys(runs).length > 0;
  const firstTest = selection[0]?.testId;
  const steps: StepDef[] = [
    { n: '01', label: 'Test Object', to: '/test-object', match: (p) => p === '/test-object', enabled: true },
    { n: '02', label: 'Test Selection', to: '/test-selection', match: (p) => p === '/test-selection', enabled: !!testObject },
    {
      n: '03',
      label: 'Execution',
      to: firstTest ? `/test/${firstTest}` : '/test-selection',
      match: (p) => p.startsWith('/test/'),
      enabled: !!testObject && hasRuns && !!firstTest,
    },
    { n: '04', label: 'Summary', to: '/summary', match: (p) => p === '/summary', enabled: hasRuns },
  ];

  const activeIndex = steps.findIndex((s) => s.match(pathname));

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink-900/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1680px] items-center gap-7 px-5">
        <div className="flex items-center gap-3.5">
          <img src="/logo.png" alt="Company logo" className="logo-ink h-8 w-auto" />
          <div className="h-8 w-px bg-line" aria-hidden />
          <div className="leading-none">
            <div className="type-plate font-display text-[17px] text-fg">TTB-01</div>
            <div className="mt-1 text-[12.5px] font-medium text-fg-dim">Transformer test bench</div>
          </div>
        </div>

        {/* Live bus: the procedure as a copper busbar, steps as its terminals */}
        <nav aria-label="Test procedure" className="flex min-w-0 flex-1 items-center">
          <ol className="flex items-center">
            {steps.map((s, i) => {
              const active = i === activeIndex;
              const done = activeIndex >= 0 && i < activeIndex;
              const reached = activeIndex >= 0 && i <= activeIndex;
              const disabled = !s.enabled || running;
              return (
                <li key={s.n} className="flex items-center">
                  {i > 0 && (
                    <span aria-hidden className="relative mx-2.5 h-[3px] w-8 overflow-hidden rounded-full bg-line-strong/50 xl:w-14">
                      <motion.span
                        className="absolute inset-0 origin-left rounded-full bg-accent"
                        initial={false}
                        animate={{ scaleX: reached ? 1 : 0 }}
                        transition={{ duration: 0.6, ease: [0.65, 0, 0.35, 1], delay: reached ? 0.1 * i : 0 }}
                      />
                      {live && reached && <span className="bus-live absolute inset-0" />}
                    </span>
                  )}
                  <NavLink
                    to={s.to}
                    aria-current={active ? 'step' : undefined}
                    aria-disabled={disabled || undefined}
                    tabIndex={disabled ? -1 : undefined}
                    onClick={(e) => disabled && e.preventDefault()}
                    className={cn(
                      'group flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 transition-colors',
                      active ? 'text-fg' : disabled ? 'cursor-not-allowed text-fg-dim/60' : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    <span
                      className={cn(
                        'num relative grid size-7 place-items-center rounded-full border-2 text-[13px] font-bold transition-colors duration-300',
                        done && 'border-accent bg-accent text-white',
                        active && (live ? 'border-[var(--live)] bg-ink-850 text-fg' : 'border-accent bg-ink-850 text-accent'),
                        !done && !active && 'border-line-strong bg-ink-850 text-fg-dim',
                      )}
                    >
                      {done ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : i + 1}
                      {active && (
                        <motion.span
                          layoutId="bus-active"
                          aria-hidden
                          className={cn('absolute -inset-[5px] rounded-full border', live ? 'border-[var(--live)]/50' : 'border-accent/30')}
                          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        />
                      )}
                    </span>
                    <span className={cn('hidden text-[14px] lg:inline', active ? 'font-semibold' : 'font-medium')}>{s.label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="flex items-center gap-5">
          <ThemeToggle />
          <PlcModeSwitch />
          <LinkIndicator />
          <div className="hidden h-7 w-px bg-line md:block" />
          <div className="hidden text-right leading-none md:block">
            <div className="num text-[17px] font-semibold text-fg">{clockTime(now)}</div>
            <div className="num mt-1 text-[12.5px] text-fg-dim">{isoDate(now)}</div>
          </div>
          <div className="h-7 w-px bg-line" />
          <div className="flex items-center gap-3">
            <div className="text-right leading-none">
              <div className="text-[12px] font-medium text-fg-dim">Operator</div>
              <div className="num mt-1 text-[15px] font-semibold text-fg">{operator?.id ?? '—'}</div>
            </div>
            <button
              type="button"
              disabled={running}
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="grid size-9 place-items-center rounded-[10px] border border-line bg-ink-850 text-fg-muted transition-colors hover:border-fault/60 hover:text-fault disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Log out"
              title={running ? 'Stop the test before logging out' : 'Log out'}
            >
              <LogOut className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
