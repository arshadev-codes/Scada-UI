/**
 * Screens for the instrument tests: Winding Resistance, Voltage Ratio and
 * Insulation Resistance. They share one shell (header, sequence strip, the
 * test's drawing, controls, results, event log, next test); each test only
 * supplies its drawing, table and runner.
 *
 * Each runner reads the PLC when its tags.ts addresses are filled in, and plays
 * DEMO data otherwise. Both go through the same callbacks, so the screen is
 * identical either way; the DEMO / PLC badge says which one is running.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Flag, Play, TriangleAlert } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Page, PageHeader } from '@/components/layout/Page';
import { LinkIndicator } from '@/components/layout/LinkIndicator';
import { EventLog } from '@/components/feature/EventLog';
import { TestSwitcher, switchDirection } from '@/components/feature/TestSwitcher';
import { Button, Panel, Segmented, powerUp, stagger } from '@/components/ui';
import { StartCountdown } from '@/components/ui/StartCountdown';
import { StopMushroom } from '@/components/ui/StopMushroom';
import { connectionLabel, getTestDefinition } from '@/config/tests';
import { useAppStore } from '@/store/appStore';
import { usePlcStore } from '@/store/plcStore';
import { useSequenceLog, type LogLevel } from '@/hooks/useSequenceLog';
import { cn } from '@/lib/format';
import type { TestObject } from '@/store/types';
import { WrmSteps, WrmTable } from '@/tests/winding-resistance/WindingResistancePanel';
import { WrmVisual } from '@/tests/winding-resistance/WrmBench';
import {
  runWindingResistanceTest,
  stopWindingResistanceTest,
  wrmMeasurements,
  wrmTestCurrent,
  wrmUsesPlc,
  type WrmReading,
} from '@/tests/winding-resistance/runWindingResistanceTest';
import type { WrmResult } from '@/tests/winding-resistance/calculation';
import { TtrSteps, TtrTable, TtrVisual } from '@/tests/ratio/RatioPanel';
import { recordRatioTap, runRatioTest, stopRatioTest, ttrPlan, ttrSupplyV, ttrUsesPlc, type TapMode, type TtrReading } from '@/tests/ratio/runRatioTest';
import type { TtrResult } from '@/tests/ratio/calculation';
import { IrSteps, IrTable } from '@/tests/insulation-resistance/InsulationPanel';
import { IrVisual } from '@/tests/insulation-resistance/IrMeggerVisual';
import { irPlan, irUsesPlc, runInsulationTest, stopInsulationTest, type IrReading } from '@/tests/insulation-resistance/runInsulationTest';
import type { IrResult } from '@/tests/insulation-resistance/calculation';
import { VariacGauge, niceMax } from '@/components/feature/VariacGauge';
import { WithstandTimer } from '@/tests/shared/StickerLog';
import { IvtSteps, IvtTable } from '@/tests/induced-voltage/InducedPanel';
import { IvtVisual } from '@/tests/induced-voltage/InducedVisual';
import { ivtPlan, ivtUsesPlc, runInducedVoltageTest, stopInducedVoltageTest, type IvtReading, type IvtResult } from '@/tests/induced-voltage/runInducedVoltageTest';
import { AvtSteps, AvtTable } from '@/tests/applied-voltage/AppliedPanel';
import { AvtVisual } from '@/tests/applied-voltage/AppliedVisual';
import { AVT_TRIP_MA, avtPlan, avtUsesPlc, runAppliedVoltageTest, stopAppliedVoltageTest, type AvtReading, type AvtResult } from '@/tests/applied-voltage/runAppliedVoltageTest';
import { TrtSteps, TrtTable } from '@/tests/temperature-rise/HeatRunPanel';
import { HeatRunVisual } from '@/tests/temperature-rise/HeatRunVisual';
import {
  TRT_DEMO_MS_PER_MIN,
  TRT_INTERVALS,
  runTemperatureRiseTest,
  stopTemperatureRiseTest,
  trtPlan,
  trtUsesPlc,
  type TrtInterval,
  type TrtReading,
  type TrtResult,
} from '@/tests/temperature-rise/runTemperatureRiseTest';

/** Tests that use this screen instead of TestExecutionPage. */
export const INSTRUMENT_TESTS = ['winding-resistance', 'ratio', 'insulation-resistance', 'induced-voltage', 'applied-voltage', 'temperature-rise'] as const;

export function InstrumentTestPage() {
  const { testId = '' } = useParams();
  const o = useAppStore((s) => s.testObject);
  if (!o) return null;
  if (testId === 'winding-resistance') return <WindingResistancePage o={o} />;
  if (testId === 'ratio') return <RatioPage o={o} />;
  if (testId === 'induced-voltage') return <InducedVoltagePage o={o} />;
  if (testId === 'applied-voltage') return <AppliedVoltagePage o={o} />;
  if (testId === 'temperature-rise') return <TemperatureRisePage o={o} />;
  return <InsulationPage o={o} />;
}

type Push = (text: string, level?: LogLevel) => void;

// ── Winding Resistance ──────────────────────────────────────────────────────

function WindingResistancePage({ o }: { o: TestObject }) {
  const saved = useAppStore((s) => s.results.wrm ?? null);
  const saveResults = useAppStore((s) => s.saveResults);
  const [reading, setReading] = useState<WrmReading | null>(null);
  const [result, setResult] = useState<WrmResult | null>(saved);
  const list = wrmMeasurements(o);
  const shownReading = reading ?? (saved ? { active: null, liveR: 0, current: 0, setCurrent: 0, settle: 0, values: [...saved.hv.r, ...saved.lv.r], tempC: saved.tempC } : null);

  return (
    <InstrumentShell
      testId="winding-resistance"
      demo={!wrmUsesPlc()}
      live={reading?.active != null && reading.current > 0.05}
      visualTag="WRM-01"
      visualTitle="Micro-Ohmmeter · HV / LV Supply"
      steps={<WrmSteps list={list} reading={shownReading} />}
      visual={<WrmVisual o={o} list={list} reading={reading} />}
      table={<WrmTable list={list} reading={shownReading} result={result} />}
      facts={[
        ['HV CURRENT', `${wrmTestCurrent(o, 'HV')} A`],
        ['LV CURRENT', `${wrmTestCurrent(o, 'LV')} A`],
        ['PAIRS', String(list.length)],
      ]}
      run={async (push: Push) => {
        setReading(null);
        setResult(null);
        const r = await runWindingResistanceTest(o, { log: (m) => push(m), onReading: setReading });
        setResult(r);
        saveResults({ wrm: r });
        return r.pass;
      }}
      stop={stopWindingResistanceTest}
    />
  );
}

// ── Voltage Ratio ───────────────────────────────────────────────────────────

function RatioPage({ o }: { o: TestObject }) {
  const stored = useAppStore((s) => s.results.ttr ?? null);
  // results saved by the earlier TTR-meter version have no voltages; ignore them
  const saved = stored?.rows.every((r) => Array.isArray(r.hvV)) ? stored : null;
  const saveResults = useAppStore((s) => s.saveResults);
  const [reading, setReading] = useState<TtrReading | null>(null);
  const [result, setResult] = useState<TtrResult | null>(saved);
  const [chosenMode, setMode] = useState<TapMode>('manual');
  const demo = !ttrUsesPlc();
  // Demo data: the whole test runs by itself and the taps change automatically.
  const mode: TapMode = demo ? 'plc' : chosenMode;
  const plan = ttrPlan(o);
  const shownReading: TtrReading | null =
    reading ?? (saved ? { tapIndex: null, waitingForOperator: false, recording: false, hvV: [], lvV: [], supplyV: ttrSupplyV(o), rows: saved.rows } : null);
  const nominal = plan.find((t) => t.nominal) ?? plan[0];

  return (
    <InstrumentShell
      testId="ratio"
      demo={demo}
      live={reading?.tapIndex != null && (reading.lvV[0] ?? 0) > 1}
      visualTag="TTR-01"
      visualTitle="Test Voltage on HV · LV Measured"
      steps={<TtrSteps plan={plan} reading={shownReading} />}
      visual={<TtrVisual o={o} plan={plan} reading={shownReading} mode={mode} onRecord={recordRatioTap} />}
      table={<TtrTable o={o} plan={plan} reading={shownReading} result={result} />}
      facts={[
        ['TAPS', String(plan.length)],
        ['HV APPLIED', `${ttrSupplyV(o)} V`],
        ['NORMAL RATIO', nominal ? nominal.rated.toFixed(3) : '—'],
      ]}
      controls={(busy) =>
        demo ? null : (
        <Segmented
          label="Tap change"
          value={mode}
          onChange={setMode}
          disabled={busy}
          size="sm"
          options={[
            { value: 'manual', label: 'Manual', sub: 'Operator sets tap' },
            { value: 'plc', label: 'PLC', sub: 'PLC sets tap' },
          ]}
        />
        )
      }
      run={async (push: Push) => {
        setReading(null);
        setResult(null);
        const r = await runRatioTest(o, mode, { log: (m) => push(m), onReading: setReading });
        setResult(r);
        saveResults({ ttr: r });
        return r.pass;
      }}
      stop={stopRatioTest}
    />
  );
}

// ── Insulation Resistance ───────────────────────────────────────────────────

function InsulationPage({ o }: { o: TestObject }) {
  const saved = useAppStore((s) => s.results.ir ?? null);
  const saveResults = useAppStore((s) => s.saveResults);
  const [reading, setReading] = useState<IrReading | null>(null);
  const [result, setResult] = useState<IrResult | null>(saved);
  const plan = irPlan(o);
  const shownReading =
    reading ??
    (saved
      ? { pairIndex: null, elapsed: 0, voltage: 0, testV: 0, r: 0, points: saved.pairs.map((p) => ({ r15: p.r15, r60: p.r60, r600: p.r600 })), speed: 1, discharging: false }
      : null);

  return (
    <InstrumentShell
      testId="insulation-resistance"
      demo={!irUsesPlc()}
      live={reading?.pairIndex != null && reading.voltage > 1}
      visualTag="IRT-01"
      visualTitle="Megger on the Transformer"
      steps={<IrSteps plan={plan} reading={shownReading} />}
      visual={<IrVisual o={o} plan={plan} reading={reading} />}
      table={<IrTable plan={plan} reading={shownReading} result={result} />}
      facts={[
        ['HV TEST', `${plan[0].testV} V DC`],
        ['LV TEST', `${plan[2].testV} V DC`],
        ['DURATION', '10 min / pair'],
      ]}
      run={async (push: Push) => {
        setReading(null);
        setResult(null);
        const r = await runInsulationTest(o, { log: (m) => push(m), onReading: setReading });
        setResult(r);
        saveResults({ ir: r });
        return r.pass;
      }}
      stop={stopInsulationTest}
    />
  );
}

// ── Induced Overvoltage ─────────────────────────────────────────────────────

function InducedVoltagePage({ o }: { o: TestObject }) {
  const saved = useAppStore((s) => s.results.ivt ?? null);
  const saveResults = useAppStore((s) => s.saveResults);
  const [reading, setReading] = useState<IvtReading | null>(null);
  const [result, setResult] = useState<IvtResult | null>(saved);
  const plan = ivtPlan(o);
  const shown: IvtReading | null = reading ?? (saved ? { phase: 'done', kv: 0, hz: 0, ma: 0, lvV: 0, holdS: saved.holdS, rows: saved.rows } : null);
  const on = !!reading && reading.phase !== 'done';
  const kv = on ? reading.kv : 0;
  const live = kv > 0.05;

  return (
    <InstrumentShell
      testId="induced-voltage"
      demo={!ivtUsesPlc()}
      live={live}
      hazard={kv > plan.ratedKv ? `Overvoltage ${(kv / plan.ratedKv).toFixed(2)} × rated on HV · keep clear of the bay` : 'High voltage on HV terminals · keep clear of the bay'}
      visualTag="IVT-01"
      visualTitle={`Frequency Converter · Variac · Step-up → HV (${plan.hz} Hz)`}
      steps={<IvtSteps plan={plan} reading={shown} />}
      visual={<IvtVisual o={o} reading={reading} />}
      table={<IvtTable plan={plan} reading={shown} result={result} />}
      facts={[
        ['RATED HV', `${plan.ratedKv} kV`],
        ['TEST', `${plan.targetKv} kV`],
        ['HOLD', `${plan.holdS} s @ ${plan.hz} Hz`],
      ]}
      controls={() => (
        <>
          <VariacGauge value={kv} setpoint={plan.targetKv} live={live} unit="kV" label="Applied on HV" max={niceMax(plan.targetKv * 1.15)} decimals={2} bandFrom={plan.ratedKv} bandLabel="Un" />
          <WithstandTimer elapsed={reading?.holdS ?? saved?.holdS ?? 0} total={plan.holdS} active={reading?.phase === 'hold'} label="Withstand at 2 × Un" />
          <div className="num grid grid-cols-2 gap-3 text-[13px] text-fg-dim">
            <div>
              TEST CURRENT
              <div className="text-base text-fg">{(on ? reading.ma : 0).toFixed(1)} mA</div>
            </div>
            <div>
              LV INDUCED
              <div className="text-base text-fg">{Math.round(on ? reading.lvV : 0)} V</div>
            </div>
          </div>
        </>
      )}
      run={async (push: Push) => {
        setReading(null);
        setResult(null);
        const r = await runInducedVoltageTest(o, { log: (m) => push(m), onReading: setReading });
        setResult(r);
        saveResults({ ivt: r });
        return r.pass;
      }}
      stop={stopInducedVoltageTest}
    />
  );
}

// ── Applied Voltage ─────────────────────────────────────────────────────────

function AppliedVoltagePage({ o }: { o: TestObject }) {
  const saved = useAppStore((s) => s.results.avt ?? null);
  const saveResults = useAppStore((s) => s.saveResults);
  const [reading, setReading] = useState<AvtReading | null>(null);
  const [result, setResult] = useState<AvtResult | null>(saved);
  const plan = avtPlan(o);
  const shown: AvtReading | null = reading ?? (saved ? { phase: 'done', kv: 0, leakMa: 0, holdS: saved.holdS, rows: saved.rows } : null);
  const on = !!reading && reading.phase !== 'done';
  const kv = on ? reading.kv : 0;
  const live = kv > 0.05;

  return (
    <InstrumentShell
      testId="applied-voltage"
      demo={!avtUsesPlc()}
      live={live}
      hazard={`${plan.testKv} kV on HV · LV and tank earthed · keep clear of the bay`}
      visualTag="AVT-01"
      visualTitle="Variac · HV Test Set → HV · LV + Tank to Earth"
      steps={<AvtSteps plan={plan} reading={shown} />}
      visual={<AvtVisual o={o} reading={reading} />}
      table={<AvtTable plan={plan} reading={shown} result={result} />}
      facts={[
        ['UM CLASS', `${plan.um} kV`],
        ['TEST', `${plan.testKv} kV`],
        ['HOLD', `${plan.holdS} s @ ${plan.hz} Hz`],
      ]}
      controls={() => (
        <>
          <VariacGauge value={kv} setpoint={plan.testKv} live={live} unit="kV" label="HV → LV + earth" max={niceMax(plan.testKv * 1.15)} decimals={2} />
          <WithstandTimer elapsed={reading?.holdS ?? saved?.holdS ?? 0} total={plan.holdS} active={reading?.phase === 'hold'} label="Withstand" />
          <div className="num grid grid-cols-2 gap-3 text-[13px] text-fg-dim">
            <div>
              LEAKAGE
              <div className="text-base text-[#4da3ff]">{(on ? reading.leakMa : 0).toFixed(2)} mA</div>
            </div>
            <div>
              TRIP AT
              <div className="text-base text-fg">{AVT_TRIP_MA} mA</div>
            </div>
          </div>
        </>
      )}
      run={async (push: Push) => {
        setReading(null);
        setResult(null);
        const r = await runAppliedVoltageTest(o, { log: (m) => push(m), onReading: setReading });
        setResult(r);
        saveResults({ avt: r });
        return r.pass;
      }}
      stop={stopAppliedVoltageTest}
    />
  );
}

// ── Temperature Rise ────────────────────────────────────────────────────────

function TemperatureRisePage({ o }: { o: TestObject }) {
  const saved = useAppStore((s) => s.results.trt ?? null);
  const saveResults = useAppStore((s) => s.saveResults);
  const [reading, setReading] = useState<TrtReading | null>(null);
  const [result, setResult] = useState<TrtResult | null>(saved);
  const [interval, setLogInterval] = useState<TrtInterval>((saved?.intervalMin as TrtInterval | undefined) ?? 10);
  const demo = !trtUsesPlc();
  const plan = trtPlan(o);
  const last = saved?.rows[saved.rows.length - 1];
  const shown: TrtReading | null =
    reading ?? (saved && last ? { ...last, phase: 'done', min: saved.durationMin, currentA: 0, ratedA: plan.ratedA, lossKw: 0, oilRate: 0, rows: saved.rows } : null);
  const live = !!reading && (reading.phase === 'total' || reading.phase === 'rated');

  return (
    <InstrumentShell
      testId="temperature-rise"
      demo={demo}
      live={live}
      hazard="Heat run in progress · HV energised, LV shorted · keep clear"
      visualTag="TRT-01"
      visualTitle="Heat Run · Winding & Oil Temperatures"
      steps={<TrtSteps reading={shown} />}
      visual={<HeatRunVisual o={o} reading={shown} />}
      table={<TrtTable reading={shown} result={result} intervalMin={interval} />}
      facts={[
        ['TOTAL LOSS', `${plan.totalKw.toFixed(2)} kW`],
        ['TEST I', `${plan.totalA.toFixed(2)} A`],
        ['RATED I', `${plan.ratedA.toFixed(2)} A`],
      ]}
      controls={(busy) => (
        <>
          <Segmented
            label="Log every"
            value={String(interval)}
            onChange={(v) => setLogInterval(Number(v) as TrtInterval)}
            disabled={busy}
            size="sm"
            options={TRT_INTERVALS.map((m) => ({ value: String(m), label: `${m} min` }))}
          />
          <VariacGauge
            value={live ? reading.currentA : 0}
            setpoint={+(reading?.phase === 'rated' ? plan.ratedA : plan.totalA).toFixed(2)}
            live={live}
            unit="A"
            label={reading?.phase === 'rated' ? 'HV current · rated' : 'HV current · total losses'}
            max={niceMax(plan.totalA * 1.2, 1)}
            decimals={2}
            bandFrom={plan.ratedA}
            bandLabel="Ir"
          />
          {demo && (
            <div className="num text-[12.5px] text-fg-dim">
              DEMO clock: 1 test minute = {TRT_DEMO_MS_PER_MIN / 1000} s · a real heat run takes 8–12 h
            </div>
          )}
        </>
      )}
      run={async (push: Push) => {
        setReading(null);
        setResult(null);
        const r = await runTemperatureRiseTest(o, interval, { log: (m) => push(m), onReading: setReading });
        setResult(r);
        saveResults({ trt: r });
        return r.pass;
      }}
      stop={stopTemperatureRiseTest}
    />
  );
}

// ── Shared shell ────────────────────────────────────────────────────────────

type Phase = 'idle' | 'running' | 'stopping' | 'done';

function InstrumentShell({
  testId,
  demo,
  live,
  hazard,
  visualTag,
  visualTitle,
  steps,
  visual,
  table,
  facts,
  controls,
  run,
  stop,
}: {
  testId: string;
  /** Running on demo data (tags.ts addresses still empty) */
  demo: boolean;
  /** Test voltage / current is applied right now */
  live: boolean;
  /** Warning shown in the hazard strip while live */
  hazard?: string;
  visualTag: string;
  visualTitle: string;
  steps: ReactNode;
  visual: ReactNode;
  table: ReactNode;
  facts: Array<[string, string]>;
  /** Extra settings in the Control panel; `busy` locks them while running */
  controls?: (busy: boolean) => ReactNode;
  /** Runs the test; resolves with PASS (true) / FAIL (false) */
  run: (push: Push) => Promise<boolean>;
  stop: () => void;
}) {
  const navigate = useNavigate();
  const def = getTestDefinition(testId)!;
  const o = useAppStore((s) => s.testObject)!;
  const selection = useAppStore((s) => s.selection);
  const runState = useAppStore((s) => s.runs[testId]);
  const markRunStarted = useAppStore((s) => s.markRunStarted);
  const markRunEnded = useAppStore((s) => s.markRunEnded);
  const online = usePlcStore((s) => s.status?.link === 'ONLINE');
  const { entries, push } = useSequenceLog();

  const [phase, setPhase] = useState<Phase>(runState?.status === 'completed' || runState?.status === 'aborted' ? 'done' : 'idle');
  const [countdown, setCountdown] = useState(false);
  const [stopReason, setStopReason] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<boolean | null>(null);

  const index = selection.findIndex((s) => s.testId === testId);
  const nextTest = index >= 0 ? selection[index + 1] : undefined;
  const busy = phase === 'running' || phase === 'stopping';
  const canStart = !busy && (demo || online);

  const start = async () => {
    setPhase('running');
    setStopReason(null);
    setVerdict(null);
    markRunStarted(testId);
    push(`${def.code} START${demo ? ' · DEMO DATA (PLC addresses not set yet)' : ''}`, 'cmd');
    try {
      const pass = await run(push);
      setVerdict(pass);
      markRunEnded(testId, 'completed');
      push(`${def.code} ${pass ? 'PASS' : 'FAIL'}`, pass ? 'ok' : 'fault');
    } catch (error) {
      setStopReason(error instanceof Error ? error.message : String(error));
      markRunEnded(testId, 'aborted');
      push(`${def.code} STOPPED`, 'warn');
    }
    setPhase('done');
  };

  const onStop = () => {
    if (!busy) return;
    setPhase('stopping');
    push('STOP PRESSED', 'cmd');
    stop();
  };

  const goNext = () => navigate(nextTest ? `/test/${nextTest.testId}` : '/summary');

  // Leaving the screen stops a running test (its runner would keep going otherwise).
  useEffect(() => stop, [stop]);

  return (
    <Page slide={switchDirection}>
      <PageHeader
        code={`STEP 03 / EXECUTION · ${def.code}`}
        title={def.name}
        subtitle={
          <>
            Object <span className="num text-fg">{o.serialNo}</span> · {connectionLabel(runState?.side ?? def.defaultSide, def.otherWinding)} · {o.ratedPowerKva} kVA{' '}
            {o.hvVoltageKv} kV / {o.lvVoltageV} V · {o.vectorGroup}
          </>
        }
        aside={
          <div className="flex items-center gap-4">
            <span
              className={cn(
                'num rounded-full border px-3 py-1 text-[13px] font-semibold',
                demo ? 'border-amber/60 text-amber' : 'border-ok/60 text-ok',
              )}
              title={demo ? `Fill in the addresses in src/tests/…/tags.ts to read the PLC` : 'Reading the PLC'}
            >
              {demo ? 'Demo data' : 'PLC data'}
            </span>
            <div className="text-right">
              <div className="label-tech text-[12px] text-fg-dim">Test</div>
              <div className="num text-xl text-fg">
                {index + 1}
                <span className="text-fg-dim"> / {selection.length}</span>
              </div>
            </div>
          </div>
        }
      />

      <TestSwitcher current={testId} locked={busy} />

      <AnimatePresence>
        {live && (
          <motion.div
            key="hazard"
            role="alert"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="relative overflow-hidden rounded-[12px] border border-amber/50 bg-amber-deep/40"
          >
            <div className="hatch absolute inset-0" aria-hidden />
            <div className="relative flex items-center gap-3 px-4 py-2">
              <TriangleAlert className="size-4 text-amber" aria-hidden />
              <span className="text-[14px] font-semibold text-amber">
                {hazard ?? (testId === 'insulation-resistance' ? 'High DC voltage on terminals · keep clear' : 'Test source connected · do not touch the terminals')}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Panel tag="SEQ-01" title="Sequence" active={live} bodyClassName="px-6 py-6">
        {steps}
      </Panel>

      <motion.div variants={stagger(0.07, 0)} className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel
          tag={visualTag}
          title={visualTitle}
          active={live}
          aside={<span className={cn('num text-[13px]', live ? 'text-amber' : 'text-fg-dim')}>{live ? 'SOURCE ON' : 'SOURCE OFF'}</span>}
          bodyClassName="p-4"
        >
          {visual}
        </Panel>

        <Panel tag="CTL-01" title="Control" tone={phase === 'stopping' ? 'fault' : 'default'} bodyClassName="flex flex-col gap-4">
          <div className="num grid grid-cols-3 gap-3 text-[13px] text-fg-dim">
            {facts.map(([k, v]) => (
              <div key={k}>
                {k}
                <div className="truncate text-base text-fg">{v}</div>
              </div>
            ))}
          </div>
          {controls?.(busy)}
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="primary"
              size="xl"
              onClick={() => setCountdown(true)}
              disabled={countdown || !canStart}
              icon={<Play className="size-5 fill-current" aria-hidden />}
              className="w-full"
            >
              {phase === 'done' ? 'Re-run' : 'Start'}
            </Button>
            <StartCountdown
              open={countdown}
              seconds={3}
              title={def.name}
              onDone={() => {
                setCountdown(false);
                void start();
              }}
              onCancel={() => {
                setCountdown(false);
                push('START CANCELLED BY OPERATOR', 'warn');
              }}
            />
            <StopMushroom onPress={onStop} disabled={!busy || phase === 'stopping'} label={phase === 'stopping' ? '…' : 'Stop'} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <LinkIndicator />
            <span className="num text-[13px]">
              {busy ? (
                <span className="text-amber">{def.code} RUNNING · STOP ALWAYS AVAILABLE</span>
              ) : !demo && !online ? (
                <span className="text-fault">PLC LINK NOT ONLINE · START INHIBITED</span>
              ) : demo ? (
                <span className="text-fg-dim">DEMO · NO PLC NEEDED · PRESS START</span>
              ) : (
                <span className="text-fg-dim">PRESS START</span>
              )}
            </span>
          </div>

          <AnimatePresence>
            {phase === 'done' && (
              <motion.div
                key="next"
                variants={powerUp}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0 }}
                className={cn('flex items-center gap-3 border p-3', runState?.status === 'completed' ? 'border-ok/50 bg-ok/[0.06]' : 'border-fault/50 bg-fault/[0.06]')}
              >
                <div className="min-w-0 flex-1">
                  <div className={cn('label-tech text-[13px]', runState?.status === 'completed' ? 'text-ok' : 'text-fault')}>
                    {runState?.status === 'completed' ? `Test completed${verdict === null ? '' : verdict ? ' · PASS' : ' · FAIL'}` : 'Test stopped'}
                  </div>
                  {stopReason && <div className="mt-0.5 text-[14px] text-fault">{stopReason}</div>}
                  <div className="num truncate text-[13px] text-fg-dim">
                    {nextTest ? `NEXT · ${getTestDefinition(nextTest.testId)?.name.toUpperCase()}` : 'LAST TEST IN SEQUENCE'}
                  </div>
                </div>
                <Button
                  variant={runState?.status === 'completed' ? 'primary' : 'outline'}
                  size="md"
                  onClick={goNext}
                  icon={nextTest ? <ArrowRight className="size-4" aria-hidden /> : <Flag className="size-4" aria-hidden />}
                >
                  {nextTest ? 'Next Test' : 'Finish'}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </Panel>
      </motion.div>

      <Panel tag="RES-01" title="Results" bodyClassName="p-4">
        {table}
      </Panel>

      <Panel tag="LOG-01" title="Event Log" bodyClassName="p-0" aside={<span className="num text-[13px] text-fg-dim">{entries.length} EVT</span>}>
        <EventLog entries={entries} />
      </Panel>
    </Page>
  );
}
