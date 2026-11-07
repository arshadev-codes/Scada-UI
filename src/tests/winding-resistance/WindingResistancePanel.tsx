import { cn } from '@/lib/format';
import { ResultStamp } from '@/components/ui/ResultStamp';
import { IMBALANCE_LIMIT_PCT, formatOhms, type WrmResult } from './calculation';
import type { WrmMeasurement, WrmReading } from './runWindingResistanceTest';

/** Sequence strip: one step per terminal pair. */
export function WrmSteps({ list, reading }: { list: WrmMeasurement[]; reading: WrmReading | null }) {
  return (
    <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))` }}>
      {list.map((m, i) => {
        const done = reading?.values[i] != null;
        const active = reading?.active === i && !done;
        return (
          <li key={i} className={cn('rounded-[10px] border px-3 py-2.5 text-center transition-colors duration-300', active ? 'border-[var(--live)] bg-amber-deep/50 text-amber' : done ? 'border-ok/35 bg-ok/[0.07] text-ok' : 'border-line bg-ink-800 text-fg-dim')}>
            <div className="num text-[13px]">{m.side}</div>
            <div className="label-tech text-[13px]">{m.pair}</div>
          </li>
        );
      })}
    </ol>
  );
}

/** Measured / corrected table and the verdict. */
export function WrmTable({ list, reading, result }: { list: WrmMeasurement[]; reading: WrmReading | null; result: WrmResult | null }) {
  const sides = (['HV', 'LV'] as const).map((side) => ({ side, rows: list.map((m, i) => ({ m, i })).filter((x) => x.m.side === side) }));
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
      <table className="num w-full text-[14px]">
        <thead className="text-fg-dim">
          <tr>
            <th className="text-left font-normal">Pair</th>
            <th className="text-right font-normal">Measured</th>
            <th className="text-right font-normal">At 75 °C</th>
            <th className="text-right font-normal">Status</th>
          </tr>
        </thead>
        {sides.map(({ side, rows }) => {
          const res = result ? result[side === 'HV' ? 'hv' : 'lv'] : null;
          return (
            <tbody key={side} className="text-fg">
              <tr>
                <td colSpan={4} className="label-tech pt-2 text-[13px] text-accent">
                  {side} winding
                </td>
              </tr>
              {rows.map(({ m, i }, k) => {
                const v = reading?.values[i] ?? null;
                const f = formatOhms(v);
                const f75 = formatOhms(res?.r75[k]);
                const active = reading?.active === i && v === null;
                return (
                  <tr key={i} className={cn(active && 'text-amber')}>
                    <td>{m.pair}</td>
                    <td className="text-right">{v === null ? '—' : `${f.value} ${f.unit}`}</td>
                    <td className="text-right">{res ? `${f75.value} ${f75.unit}` : '—'}</td>
                    <td className={cn('text-right', v !== null ? 'text-ok' : active ? 'text-amber' : 'text-fg-dim')}>
                      {v !== null ? 'LOCKED' : active ? 'SETTLING' : 'WAIT'}
                    </td>
                  </tr>
                );
              })}
              {res && (
                <tr className="border-t border-line">
                  <td>Imbalance</td>
                  <td colSpan={2} className="text-right">
                    {res.imbalancePct.toFixed(2)} %
                  </td>
                  <td className={cn('text-right', res.pass ? 'text-ok' : 'text-fault')}>{res.pass ? 'OK' : 'HIGH'}</td>
                </tr>
              )}
            </tbody>
          );
        })}
      </table>
      <div className="num flex flex-col gap-1 text-[14px] text-fg">
        <div className="label-tech mb-1 text-[13px] text-fg-dim">Result</div>
        {result ? (
          <>
            <ResultStamp pass={result.pass} />
            <div className="mt-2">Winding temperature: {result.tempC.toFixed(1)} °C</div>
            <div>HV average (75 °C): {formatOhms(result.hv.avg75).value} {formatOhms(result.hv.avg75).unit}</div>
            <div>LV average (75 °C): {formatOhms(result.lv.avg75).value} {formatOhms(result.lv.avg75).unit}</div>
            <div className="text-fg-dim">Limit: imbalance ≤ {IMBALANCE_LIMIT_PCT} % per winding</div>
          </>
        ) : (
          <div className="text-fg-dim">Run the test to see R at 75 °C and PASS / FAIL</div>
        )}
      </div>
    </div>
  );
}
