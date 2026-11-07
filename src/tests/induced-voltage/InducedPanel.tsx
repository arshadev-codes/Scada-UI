import { ResultStamp } from '@/components/ui/ResultStamp';
import { cn } from '@/lib/format';
import { PhaseSteps, StickerLog } from '@/tests/shared/StickerLog';
import { IVT_CURRENT_RISE_LIMIT_PCT, type IvtReading, type IvtResult, type IvtRow, type ivtPlan } from './runInducedVoltageTest';

type Plan = ReturnType<typeof ivtPlan>;

export function IvtSteps({ plan, reading }: { plan: Plan; reading: IvtReading | null }) {
  return (
    <PhaseSteps
      current={reading?.phase === 'done' ? null : (reading?.phase ?? null)}
      finished={reading?.phase === 'done' && (reading.rows.length ?? 0) > 0}
      steps={[
        { key: 'connect', label: 'Converter', sub: `run up to ${plan.hz} Hz` },
        { key: 'ramp', label: 'Raise', sub: `0 → ${plan.targetKv} kV` },
        { key: 'hold', label: 'Withstand', sub: `${plan.holdS} s at 2 × Un` },
        { key: 'down', label: 'Lower', sub: 'ramp down · off' },
      ]}
    />
  );
}

export function IvtTable({ plan, reading, result }: { plan: Plan; reading: IvtReading | null; result: IvtResult | null }) {
  const rows = reading?.rows ?? result?.rows ?? [];
  const rise = result && result.maStart > 0 ? ((result.maEnd - result.maStart) / result.maStart) * 100 : null;
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
      <StickerLog<IvtRow>
        rows={rows}
        empty="Readings are logged here every 10 s while the voltage is held"
        tone={(r) => (r.kv / plan.ratedKv > 1.001 ? 'bg-fault' : r.kv > 0 ? 'bg-[var(--live)]' : 'bg-line-strong')}
        columns={[
          { key: 't', label: 'Time', width: '70px', render: (r) => `${r.t.toFixed(0)} s` },
          { key: 'note', label: 'Stage', width: 'minmax(0,1.3fr)', render: (r) => <span className="text-fg-muted">{r.note}</span> },
          { key: 'kv', label: 'HV kV', align: 'right', render: (r) => r.kv.toFixed(2) },
          {
            key: 'x',
            label: '× Un',
            align: 'right',
            render: (r) => <span className={cn(r.kv / plan.ratedKv > 1.001 ? 'text-fault' : 'text-fg')}>{(r.kv / plan.ratedKv).toFixed(2)}</span>,
          },
          { key: 'hz', label: 'Hz', align: 'right', width: '56px', render: (r) => r.hz.toFixed(0) },
          { key: 'ma', label: 'I mA', align: 'right', render: (r) => r.ma.toFixed(1) },
          { key: 'lv', label: 'LV V', align: 'right', render: (r) => Math.round(r.lvV) },
        ]}
      />
      <div className="num flex flex-col gap-1 text-[14px] text-fg">
        <div className="label-tech mb-1 text-[13px] text-fg-dim">Result</div>
        {result ? (
          <>
            <ResultStamp pass={result.pass} />
            <div className="mt-2">
              Applied: {result.targetKv} kV · {result.hz} Hz
            </div>
            <div>Held: {Math.round(result.holdS)} s</div>
            <div>
              Current: {result.maStart.toFixed(1)} → {result.maEnd.toFixed(1)} mA{rise !== null ? ` (${rise >= 0 ? '+' : ''}${rise.toFixed(1)} %)` : ''}
            </div>
            <div className="text-fg-dim">Pass: voltage held {plan.holdS} s, no collapse, current rise ≤ {IVT_CURRENT_RISE_LIMIT_PCT} %</div>
          </>
        ) : (
          <div className="text-fg-dim">Run the test to see the withstand verdict</div>
        )}
      </div>
    </div>
  );
}
