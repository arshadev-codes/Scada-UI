import { Panel } from '@/components/ui';
import { cn } from '@/lib/format';
import { ResultStamp } from '@/components/ui/ResultStamp';
import type { NoLoadResult } from './calculation';
import type { NllReading, NllStage } from './runNoLoadLossTest';

const STEPS: Array<{ stage: NllStage; label: string }> = [
  { stage: 'CLOSING', label: 'Close C1 + C7' },
  { stage: 'RAMPING', label: 'Ramp 5 V/s' },
  { stage: 'SETTLING', label: 'Settle 10 s' },
  { stage: 'MEASURING', label: 'Measure' },
  { stage: 'SWITCHING_OFF', label: 'Switch off' },
];

/** Step strip shown in the Sequence panel. */
export function NoLoadLossSteps({ stage }: { stage: NllStage | null }) {
  const current = STEPS.findIndex((s) => s.stage === stage);
  const done = stage === 'DONE';
  return (
    <div className="flex flex-col gap-3">
      <ol className="grid grid-cols-5 gap-2">
        {STEPS.map((s, i) => {
          const active = i === current;
          const passed = done || (current >= 0 && i < current);
          return (
            <li
              key={s.stage}
              className={cn(
                'rounded-[10px] border px-3 py-2.5 text-center transition-colors duration-300',
                active ? 'border-[var(--live)] bg-amber-deep/50 text-amber' : passed ? 'border-ok/35 bg-ok/[0.07] text-ok' : 'border-line bg-ink-800 text-fg-dim',
              )}
            >
              <div className="num text-[13px]">{i + 1}</div>
              <div className="label-tech text-[13px]">{s.label}</div>
            </li>
          );
        })}
      </ol>
      {stage === 'ABORTED' && <div className="label-tech text-[13px] text-fault">Test stopped by operator</div>}
    </div>
  );
}

const fmt = (n: number | undefined, d = 1) => (n === undefined || !Number.isFinite(n) ? '--' : n.toFixed(d));

/** Live per-phase readings + final result. */
export function NoLoadLossPanel({
  reading,
  result,
  ratedLvA,
}: {
  reading: NllReading | null;
  result: NoLoadResult | null;
  ratedLvA: number | null;
}) {
  const i0Pct = result && ratedLvA ? (result.current / ratedLvA) * 100 : undefined;

  return (
    <Panel tag="NLL-01" title="No-Load Loss" bodyClassName="grid gap-6 p-4 md:grid-cols-2">
      {/* Live readings */}
      <div>
        <div className="label-tech mb-2 text-[13px] text-fg-dim">Live readings</div>
        <table className="num w-full text-[14px]">
          <thead className="text-fg-dim">
            <tr>
              <th className="text-left font-normal">Phase</th>
              <th className="text-right font-normal">V</th>
              <th className="text-right font-normal">A</th>
              <th className="text-right font-normal">W</th>
            </tr>
          </thead>
          <tbody className="text-fg">
            {(reading?.v ?? [undefined]).map((_, i) => (
              <tr key={i}>
                <td>L{i + 1}</td>
                <td className="text-right">{fmt(reading?.v[i])}</td>
                <td className="text-right">{fmt(reading?.i[i], 3)}</td>
                <td className="text-right">{fmt(reading?.p[i])}</td>
              </tr>
            ))}
            <tr className="border-t border-line">
              <td>Total</td>
              <td className="text-right">{fmt(reading?.sample.voltage)}</td>
              <td className="text-right">{fmt(reading?.sample.current, 3)}</td>
              <td className="text-right">{fmt(reading?.sample.power)}</td>
            </tr>
          </tbody>
        </table>
        <div className="num mt-2 text-[13px] text-fg-dim">
          Dimmer {fmt(reading?.dimmerV)} V · {fmt(reading?.frequency, 2)} Hz
        </div>
      </div>

      {/* Result */}
      <div>
        <div className="label-tech mb-2 text-[13px] text-fg-dim">Result</div>
        {result ? (
          <div className="num flex flex-col gap-1 text-[14px] text-fg">
            <div>
              <ResultStamp pass={result.pass} />
            </div>
            <div>Measured P0: {fmt(result.p0)} W</div>
            <div>Guaranteed: {fmt(result.guaranteed)} W</div>
            <div>Limit (+15 %): {fmt(result.limit)} W</div>
            <div>Voltage: {fmt(result.voltage)} V</div>
            <div>
              No-load current I0: {fmt(result.current, 3)} A{i0Pct !== undefined && ` (${fmt(i0Pct, 2)} % of rated)`}
            </div>
          </div>
        ) : (
          <div className="num text-[14px] text-fg-dim">Run the test to see P0 and PASS / FAIL</div>
        )}
      </div>
    </Panel>
  );
}

