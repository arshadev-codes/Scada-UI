import { cn } from '@/lib/format';
import { ResultStamp } from '@/components/ui/ResultStamp';
import { DAI_MIN, PI_MIN, formatMohm, type IrResult } from './calculation';
import type { IrReading, irPlan } from './runInsulationTest';

type Plan = ReturnType<typeof irPlan>;

/** Sequence strip: one step per insulation pair. */
export function IrSteps({ plan, reading }: { plan: Plan; reading: IrReading | null }) {
  return (
    <ol className="grid grid-cols-3 gap-2">
      {plan.map((p, i) => {
        const done = reading?.points[i]?.r600 != null;
        const active = reading?.pairIndex === i && !done;
        return (
          <li key={p.pair} className={cn('rounded-[10px] border px-3 py-2.5 text-center transition-colors duration-300', active ? 'border-[var(--live)] bg-amber-deep/50 text-amber' : done ? 'border-ok/35 bg-ok/[0.07] text-ok' : 'border-line bg-ink-800 text-fg-dim')}>
            <div className="num text-[13px]">{p.testV} V DC</div>
            <div className="label-tech text-[13px]">{p.pair}</div>
          </li>
        );
      })}
    </ol>
  );
}

export function IrTable({ plan, reading, result }: { plan: Plan; reading: IrReading | null; result: IrResult | null }) {
  const cell = (v: number | null | undefined) => {
    const f = formatMohm(v);
    return f.value === '—' ? '—' : `${f.value} ${f.unit}`;
  };
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
      <table className="num w-full text-[14px]">
        <thead className="text-fg-dim">
          <tr>
            <th className="text-left font-normal">Insulation</th>
            <th className="text-right font-normal">Test V</th>
            <th className="text-right font-normal">15 s</th>
            <th className="text-right font-normal">60 s</th>
            <th className="text-right font-normal">600 s</th>
            <th className="text-right font-normal">DAI</th>
            <th className="text-right font-normal">PI</th>
          </tr>
        </thead>
        <tbody className="text-fg">
          {plan.map((p, i) => {
            const pts = reading?.points[i];
            const res = result?.pairs[i];
            const active = reading?.pairIndex === i && !res;
            return (
              <tr key={p.pair} className={cn(active && 'text-amber')}>
                <td>{p.pair}</td>
                <td className="text-right">{p.testV} V</td>
                <td className="text-right">{cell(res?.r15 ?? pts?.r15)}</td>
                <td className="text-right">{cell(res?.r60 ?? pts?.r60)}</td>
                <td className="text-right">{cell(res?.r600 ?? pts?.r600)}</td>
                <td className={cn('text-right', res && (res.dai >= DAI_MIN ? 'text-ok' : 'text-fault'))}>{res ? res.dai.toFixed(2) : '—'}</td>
                <td className={cn('text-right', res && (res.pi >= PI_MIN ? 'text-ok' : 'text-fault'))}>{res ? res.pi.toFixed(2) : '—'}</td>
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
            <div className="mt-2">DAI = R60 / R15 ≥ {DAI_MIN}</div>
            <div>PI = R600 / R60 ≥ {PI_MIN}</div>
          </>
        ) : (
          <div className="text-fg-dim">Run the test to see DAI, PI and PASS / FAIL</div>
        )}
      </div>
    </div>
  );
}
