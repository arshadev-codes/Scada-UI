import { motion } from 'framer-motion';
import { ResultStamp } from '@/components/ui/ResultStamp';
import { cn } from '@/lib/format';
import { PHASES, checkRound, type MbtResult, type MbtRound, type PhaseIndex } from './calculation';

const fmt = (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? '---.--' : n.toFixed(2));

/** Row label: the energised pair equals the sum of the other two, e.g. "RY = YB + BR". */
const equation = (e: PhaseIndex) => `${PHASES[e]} = ${PHASES.filter((_, i) => i !== e).join(' + ')}`;

/**
 * Magnetic Balance table, same layout as the SCADA screen: one row per
 * energised pair, one column per measured pair. The row being energised
 * shows live readings; finished rows show what the PLC stored.
 */
export function MbtBalanceTable({
  side,
  rounds,
  result,
  live,
}: {
  side: string;
  rounds: Array<MbtRound | undefined>;
  result: MbtResult | null;
  /** Round in progress right now, with its live readings */
  live: { energised: PhaseIndex; v: [number, number, number] } | null;
}) {
  return (
    <div className="overflow-hidden rounded-[6px] border border-line">
      <div className="flex items-center justify-between bg-ink-800 px-4 py-2.5">
        <span className="font-display text-[14px] font-semibold text-fg">{side} side</span>
        {result && <ResultStamp pass={result.pass} small />}
      </div>
      <table className="w-full border-collapse text-center">
        <thead>
          <tr className="bg-ink-750 text-[15px] font-semibold text-fg">
            <th className="w-[28%] border-t border-line px-3 py-2.5 text-left">Energised terminals</th>
            {PHASES.map((p) => (
              <th key={p} className="border-l border-t border-line px-3 py-2.5">
                Phase {p[0]}-{p[1]} measured
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {([0, 1, 2] as const).map((e) => {
            const isLive = live?.energised === e;
            const done = rounds[e];
            const v = isLive ? live!.v : done?.v;
            const check = done && !isLive ? checkRound(done) : null;
            return (
              <tr key={e} className={cn('border-t border-line', isLive && 'bg-amber/[0.07]')}>
                <td className="px-3 py-3 text-left">
                  <div className="flex items-center gap-2.5">
                    {isLive && <span className="size-2 animate-glow rounded-full bg-amber" aria-label="energised now" />}
                    <span className="font-mono text-[20px] font-semibold tracking-tight text-fg">{equation(e)}</span>
                  </div>
                  {check && (
                    <div className={cn('mt-0.5 text-[14px]', check.pass ? 'text-ok' : 'text-fault')}>
                      {check.pass ? '✓' : '✗'} sum {(check.sum * 100).toFixed(1)} % of applied
                    </div>
                  )}
                </td>
                {([0, 1, 2] as const).map((i) => {
                  const applied = i === e;
                  return (
                    <td
                      key={i}
                      className={cn(
                        'border-l border-line px-3 py-3 font-mono text-[22px] font-semibold tabular-nums',
                        !v ? 'text-fg-dim' : applied ? 'bg-accent/15 text-accent' : 'text-fg',
                      )}
                    >
                      <motion.span key={v ? 'v' : 'empty'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="inline-block">
                        {fmt(v?.[i])}
                      </motion.span>
                      {v && (
                        <div className="text-[13px] font-medium text-fg-muted">
                          {applied ? 'applied' : v[e] > 1 ? `${((v[i] / v[e]) * 100).toFixed(1)} %` : ''}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
