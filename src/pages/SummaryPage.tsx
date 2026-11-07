import { motion } from 'framer-motion';
import { CheckCircle2, CircleDashed, FilePlus2, ListRestart, Printer, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Page, PageHeader } from '@/components/layout/Page';
import { Button, CountUp, Panel, powerUp, stagger } from '@/components/ui';
import { getTestDefinition } from '@/config/tests';
import { useAppStore } from '@/store/appStore';
import type { RunStatus, TestObject } from '@/store/types';
import { ratedCurrents } from '@/lib/electrical';
import { clockTime, cn, durationLabel, isoDate } from '@/lib/format';

const statusView: Record<RunStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  completed: { label: 'Completed', cls: 'text-ok border-ok/50 bg-ok/[0.07]', Icon: CheckCircle2 },
  aborted: { label: 'Aborted', cls: 'text-fault border-fault/50 bg-fault/[0.07]', Icon: XCircle },
  running: { label: 'Interrupted', cls: 'text-accent border-accent/50 bg-accent/[0.07]', Icon: CircleDashed },
  pending: { label: 'Not run', cls: 'text-fg-dim border-line-strong', Icon: CircleDashed },
};

function Info({ k, v, unit }: { k: string; v: string; unit?: string }) {
  return (
    <div className="border-b border-line py-2">
      <dt className="label-tech text-[12px] text-fg-dim">{k}</dt>
      <dd className="num mt-0.5 break-words text-[15px] text-fg">
        {v || '—'} {v && unit && <span className="text-[13px] text-fg-dim">{unit}</span>}
      </dd>
    </div>
  );
}

function objectRows(o: TestObject): Array<[string, string, string?]> {
  const c = ratedCurrents(o);
  return [
    ['Customer', o.customerName],
    ['Job / Order', o.jobNo],
    ['Serial no.', o.serialNo],
    ['Manufacturer', o.manufacturer],
    ['Year', o.yearOfManufacture],
    ['Rated power', o.ratedPowerKva, 'kVA'],
    ['HV / LV', `${o.hvVoltageKv} kV / ${o.lvVoltageV} V`],
    ['Rated current HV / LV', `${c.hv?.toFixed(2) ?? '—'} / ${c.lv?.toFixed(2) ?? '—'}`, 'A'],
    ['Phases / Freq.', `${o.phases}-PH / ${o.frequency} Hz`],
    ['Vector group', o.vectorGroup],
    ['Impedance', o.impedancePct, '%'],
    ['Cooling', o.cooling === 'DRY' ? 'Dry type' : o.cooling],
    ['Winding HV / LV', `${o.windingHv} / ${o.windingLv}`],
    ['Tap changer', o.tapChanger === 'NONE' ? 'None' : `${o.tapChanger} ${o.tapMinPct}% / +${o.tapMaxPct}% · ${o.tapCount} pos · nom ${o.nominalTap}`],
    ['Guar. NLL', o.guaranteedNoLoadLossW, 'W'],
    ['Guar. LL @75°C', o.guaranteedLoadLossW, 'W'],
    ['Ambient', o.ambientTempC, '°C'],
    ['Standard', o.standard],
  ];
}

export function SummaryPage() {
  const navigate = useNavigate();
  const testObject = useAppStore((s) => s.testObject);
  const selection = useAppStore((s) => s.selection);
  const runs = useAppStore((s) => s.runs);
  const startNewObject = useAppStore((s) => s.startNewObject);

  const ordered = selection.map((s) => runs[s.testId]).filter((r) => r !== undefined);
  const count = (st: RunStatus) => ordered.filter((r) => r.status === st).length;

  if (!testObject) return null;

  return (
    <Page>
      <PageHeader
        code="STEP 04 / SUMMARY"
        title="Test Summary"
        subtitle={
          <>
            <span className="num text-fg">{testObject.serialNo}</span> · tested by{' '}
            <span className="num text-fg">{testObject.testedBy}</span> on <span className="num text-fg">{testObject.testDate}</span>
          </>
        }
        aside={
          <Button size="md" variant="primary" magnetic onClick={() => navigate('/report')} icon={<Printer className="size-4" aria-hidden />}>
            Print Report
          </Button>
        }
      />

      <motion.div variants={stagger(0.08, 0)} className="grid grid-cols-3 gap-5 lg:grid-cols-4">
        {(
          [
            ['Executed', ordered.length, 'text-fg'],
            ['Completed', count('completed'), 'text-ok'],
            ['Aborted', count('aborted'), 'text-fault'],
          ] as const
        ).map(([label, n, cls]) => (
          <Panel key={label} edge={false} bodyClassName="px-5 py-4">
            <div className="label-tech text-[13px]">{label}</div>
            <CountUp value={n} className={cn('mt-1 block text-4xl font-medium', cls)} />
          </Panel>
        ))}
        <Panel edge={false} className="col-span-3 lg:col-span-1" bodyClassName="px-5 py-4">
          <div className="label-tech text-[13px]">Report date</div>
          <div className="num mt-1 text-2xl text-fg">{isoDate()}</div>
        </Panel>
      </motion.div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel tag="RUN-LOG" title="Executed Tests" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {['#', 'Test', 'Side', 'Presets T1 / W / T2', 'Start', 'End', 'Elapsed', 'Status'].map((h) => (
                    <th key={h} scope="col" className="label-tech px-4 py-2.5 text-[12px] font-semibold text-fg-dim">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <motion.tbody variants={stagger(0.06, 0.1)}>
                {ordered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="num px-4 py-10 text-center text-[13px] text-fg-dim">
                      NO TESTS IN THIS SESSION
                    </td>
                  </tr>
                )}
                {ordered.map((r, i) => {
                  const def = getTestDefinition(r.testId);
                  const v = statusView[r.status];
                  const elapsed = r.startedAt && r.endedAt ? Math.round((r.endedAt - r.startedAt) / 1000) : null;
                  return (
                    <motion.tr key={r.testId} variants={powerUp} className="border-b border-line last:border-0">
                      <td className="num px-4 py-3 text-sm text-fg-dim">{String(i + 1).padStart(2, '0')}</td>
                      <td className="px-4 py-3">
                        <div className="text-[15px] text-fg">{def?.name ?? r.testId}</div>
                        <div className="num text-[13px] text-fg-dim">SEQ / {def?.code}</div>
                      </td>
                      <td className="num px-4 py-3 text-sm text-fg">{r.side}</td>
                      <td className="num px-4 py-3 text-sm text-fg-muted">
                        {r.durations.t1} / {r.durations.wait} / {r.durations.t2} s
                      </td>
                      <td className="num px-4 py-3 text-sm text-fg">{r.startedAt ? clockTime(r.startedAt) : '--:--:--'}</td>
                      <td className="num px-4 py-3 text-sm text-fg">{r.endedAt ? clockTime(r.endedAt) : '--:--:--'}</td>
                      <td className="num px-4 py-3 text-sm text-fg-muted">{elapsed !== null ? durationLabel(elapsed) : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center gap-1.5 border px-2 py-1', v.cls)}>
                          <v.Icon className="size-3.5" aria-hidden />
                          <span className="label-tech text-[13px] text-current">{v.label}</span>
                        </span>
                      </td>
                    </motion.tr>
                  );
                })}
              </motion.tbody>
            </table>
          </div>
        </Panel>

        <Panel tag="DUT" title="Test Object">
          <dl className="grid grid-cols-2 gap-x-5">
            {objectRows(testObject).map(([k, v, u]) => (
              <Info key={k} k={k} v={v} unit={u} />
            ))}
          </dl>
        </Panel>
      </div>

      <motion.div variants={powerUp} className="flex flex-wrap justify-end gap-3 print:hidden">
        <Button
          variant="outline"
          size="lg"
          onClick={() => navigate('/test-selection')}
          icon={<ListRestart className="size-4" aria-hidden />}
        >
          Run more tests
        </Button>
        <Button
          variant="primary"
          size="lg"
          magnetic
          onClick={() => {
            startNewObject();
            navigate('/test-object');
          }}
          icon={<FilePlus2 className="size-4" aria-hidden />}
        >
          Next test object
        </Button>
      </motion.div>
    </Page>
  );
}
