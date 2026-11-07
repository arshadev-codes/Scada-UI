import { ResultStamp } from '@/components/ui/ResultStamp';
import { PhaseSteps, StickerLog } from '@/tests/shared/StickerLog';
import { AVT_JUMP_LIMIT_PCT, AVT_TRIP_MA, type AvtReading, type AvtResult, type AvtRow, type avtPlan } from './runAppliedVoltageTest';

type Plan = ReturnType<typeof avtPlan>;

export function AvtSteps({ plan, reading }: { plan: Plan; reading: AvtReading | null }) {
  return (
    <PhaseSteps
      current={reading?.phase === 'done' ? null : (reading?.phase ?? null)}
      finished={reading?.phase === 'done' && reading.rows.length > 0}
      steps={[
        { key: 'connect', label: 'Connect', sub: 'HV short · LV short + earth' },
        { key: 'ramp', label: 'Raise', sub: `0 → ${plan.testKv} kV` },
        { key: 'hold', label: 'Withstand', sub: `${plan.holdS} s · watch leakage` },
        { key: 'down', label: 'Lower', sub: 'ramp down · discharge' },
      ]}
    />
  );
}

export function AvtTable({ plan, reading, result }: { plan: Plan; reading: AvtReading | null; result: AvtResult | null }) {
  const rows = reading?.rows ?? result?.rows ?? [];
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
      <StickerLog<AvtRow>
        rows={rows}
        empty="Leakage is logged here every 10 s while the test voltage is held"
        tone={(r) => (r.kv > 0 ? 'bg-[#4da3ff]' : 'bg-line-strong')}
        columns={[
          { key: 't', label: 'Time', width: '70px', render: (r) => `${r.t.toFixed(0)} s` },
          { key: 'note', label: 'Stage', width: 'minmax(0,1.4fr)', render: (r) => <span className="text-fg-muted">{r.note}</span> },
          { key: 'kv', label: 'HV kV', align: 'right', render: (r) => r.kv.toFixed(2) },
          { key: 'pct', label: '% level', align: 'right', render: (r) => `${Math.round((r.kv / plan.testKv) * 100)} %` },
          { key: 'leak', label: 'Leak mA', align: 'right', render: (r) => <span className="text-[#4da3ff]">{r.leakMa.toFixed(2)}</span> },
        ]}
      />
      <div className="num flex flex-col gap-1 text-[14px] text-fg">
        <div className="label-tech mb-1 text-[13px] text-fg-dim">Result</div>
        {result ? (
          <>
            <ResultStamp pass={result.pass} />
            <div className="mt-2">
              Applied: {result.testKv} kV · {Math.round(result.holdS)} s
            </div>
            <div>
              Leakage: {result.leakStart.toFixed(2)} → {result.leakEnd.toFixed(2)} mA
            </div>
            <div>Max: {result.leakMax.toFixed(2)} mA</div>
            <div className="text-fg-dim">
              Pass: no flash-over, leakage steady (no jump &gt; {AVT_JUMP_LIMIT_PCT} %), under {AVT_TRIP_MA} mA
            </div>
          </>
        ) : (
          <div className="text-fg-dim">Run the test to see the withstand verdict</div>
        )}
      </div>
    </div>
  );
}
