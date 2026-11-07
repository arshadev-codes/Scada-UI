import { CircleDot } from 'lucide-react';
import { cn } from '@/lib/format';
import { Button } from '@/components/ui';
import { ResultStamp } from '@/components/ui/ResultStamp';
import type { TestObject } from '@/store/types';
import { RATIO_PHASES, RATIO_TOLERANCE_PCT, type TtrResult } from './calculation';
import type { TapMode, TtrPlan, TtrReading } from './runRatioTest';
import { RatioMimic } from './RatioMimic';

const signed = (n: number, d: number) => (Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(d)}` : '—');

/**
 * Voltage Ratio screen body: the bar on top says which tap and what the operator
 * has to do, then the winding cut-away with the live readings and ratio.
 */
export function TtrVisual({
  o,
  plan,
  reading,
  mode,
  onRecord,
}: {
  o: TestObject;
  plan: TtrPlan;
  reading: TtrReading | null;
  mode: TapMode;
  onRecord: () => void;
}) {
  const ti = reading?.tapIndex ?? null;
  const tap = ti !== null ? plan[ti] : null;
  const waiting = !!reading?.waitingForOperator;

  const instruction = reading?.connecting
    ? 'Connecting test leads · checking continuity'
    : !tap
    ? 'Supply off · press START'
    : reading?.recording
      ? 'Recording · hold steady'
      : waiting
        ? `Set tap ${tap.tap} on the transformer, then press Record`
        : mode === 'plc'
          ? `Tap changer moving to tap ${tap.tap}`
          : '';

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-[6px] border border-line">
        {/* title bar */}
        <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5', waiting ? 'bg-amber/[0.08]' : 'bg-ink-800')}>
          <span className="font-display text-[15px] font-semibold text-fg">
            Voltage ratio
            {tap && (
              <>
                {' '}
                · Tap {tap.tap} of {plan.length}
                {tap.nominal && ' (normal)'}
                <span className="text-fg-muted"> · {signed(tap.pct, 2)} %</span>
              </>
            )}
          </span>
          {instruction && <span className={cn('text-[15px]', waiting ? 'font-semibold text-amber' : 'text-fg-muted')}>{instruction}</span>}
          {mode === 'manual' && tap && (
            <Button variant="primary" size="md" className="ml-auto" disabled={!waiting} onClick={onRecord} icon={<CircleDot className="size-4" aria-hidden />}>
              Record tap {tap.tap}
            </Button>
          )}
        </div>

        {/* live demonstration of the test */}
        <div className="border-t border-line bg-ink-900/40 p-4">
          <RatioMimic o={o} plan={plan} reading={reading} />
        </div>

      </div>
    </div>
  );
}

/** Sequence strip: one chip per tap. */
export function TtrSteps({ plan, reading }: { plan: TtrPlan; reading: TtrReading | null }) {
  return (
    <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(plan.length, 9)}, minmax(0, 1fr))` }}>
      {plan.map((t, i) => {
        const row = reading?.rows.find((r) => r.tap === t.tap);
        const active = reading?.tapIndex === i && !row;
        return (
          <li
            key={t.tap}
            className={cn(
              'rounded-[10px] border px-2 py-2.5 text-center transition-colors duration-300',
              active ? 'border-[var(--live)] bg-amber-deep/50 text-amber' : row ? (row.pass ? 'border-ok/35 bg-ok/[0.07] text-ok' : 'border-fault/40 bg-fault/[0.06] text-fault') : 'border-line bg-ink-800 text-fg-dim',
            )}
          >
            <div className="num text-[13px] font-semibold">
              TAP {t.tap}
              {t.nominal && ' ●'}
            </div>
            <div className="num text-[13px]">{signed(t.pct, 1)} %</div>
          </li>
        );
      })}
    </ol>
  );
}

/** Tap-wise table and the verdict. */
export function TtrTable({ o, plan, reading, result }: { o: TestObject; plan: TtrPlan; reading: TtrReading | null; result: TtrResult | null }) {
  const nPh = o.phases === '1' ? 1 : 3;
  const rows = result?.rows ?? reading?.rows ?? [];
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_240px]">
      <table className="num w-full text-[14px]">
        <thead className="text-fg-dim">
          <tr>
            <th className="text-left font-normal">Tap</th>
            <th className="text-right font-normal">HV applied (V)</th>
            <th className="text-right font-normal">LV measured (V)</th>
            <th className="text-right font-normal">Rated ratio</th>
            {Array.from({ length: nPh }, (_, i) => (
              <th key={i} className="text-right font-normal">
                {nPh === 1 ? 'Measured' : RATIO_PHASES[i]}
              </th>
            ))}
            <th className="text-right font-normal">Max error</th>
          </tr>
        </thead>
        <tbody className="text-fg">
          {plan.map((t, i) => {
            const row = rows.find((r) => r.tap === t.tap);
            const active = !row && reading?.tapIndex === i;
            const maxErr = row ? Math.max(...row.errorPct.map(Math.abs)) : null;
            return (
              <tr key={t.tap} className={cn('border-b border-line/50', active && 'text-amber', t.nominal && 'font-semibold')}>
                <td className="py-1">
                  {t.tap} <span className="text-fg-dim">({signed(t.pct, 1)} %)</span>
                  {t.nominal && <span className="text-accent"> normal</span>}
                </td>
                <td className="text-right">{row ? avg(row.hvV).toFixed(1) : '—'}</td>
                <td className="text-right">{row ? avg(row.lvV).toFixed(3) : '—'}</td>
                <td className="text-right">{t.rated.toFixed(3)}</td>
                {Array.from({ length: nPh }, (_, k) => (
                  <td key={k} className="text-right">
                    {row ? row.measured[k].toFixed(3) : '—'}
                  </td>
                ))}
                <td className={cn('text-right', maxErr === null ? 'text-fg-dim' : maxErr <= RATIO_TOLERANCE_PCT ? 'text-ok' : 'text-fault')}>
                  {maxErr === null ? (active ? 'measuring' : '—') : `${maxErr.toFixed(3)} %`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="num flex flex-col gap-1 text-[14px] text-fg">
        <div className="label-tech mb-1 text-[13px] text-fg-dim">Result</div>
        {result ? (
          <>
            <ResultStamp pass={result.pass} />
            <div className="mt-2">
              Taps recorded: {result.rows.length} of {plan.length}
            </div>
            <div className="text-fg-dim">Limit: ratio error within ±{RATIO_TOLERANCE_PCT} % on every tap and phase</div>
          </>
        ) : (
          <div className="text-fg-dim">Ratio = HV voltage ÷ LV voltage, compared with the rated ratio of each tap</div>
        )}
      </div>
    </div>
  );
}
