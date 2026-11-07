import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Activity, ArrowRight, AudioWaveform, Flag, Flame, Lock, Play, Sigma, Timer, TriangleAlert, Zap } from 'lucide-react';
import { motion as m, useTransform, type MotionValue } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Page, PageHeader } from '@/components/layout/Page';
import { LinkIndicator } from '@/components/layout/LinkIndicator';
import { EventLog } from '@/components/feature/EventLog';
import { MetricCard } from '@/components/feature/MetricCard';
import { VariacGauge, niceMax } from '@/components/feature/VariacGauge';
import { ReadingTile } from '@/components/feature/PhaseMeter';
import { SequenceTimeline } from '@/components/feature/SequenceTimeline';
import { TransformerVisual } from '@/components/feature/TransformerVisual';
import { TestSwitcher, switchDirection } from '@/components/feature/TestSwitcher';
import { Button, Lamp, Panel, TextField, powerUp, stagger } from '@/components/ui';
import { StartCountdown } from '@/components/ui/StartCountdown';
import { StopMushroom } from '@/components/ui/StopMushroom';
import { connectionLabel, getTestDefinition, totalDuration, type SequenceDurations } from '@/config/tests';
import { plc, startSequence, stopSequence, type AnalogReadings, type SeqStep } from '@/services/plc';
import { useAppStore } from '@/store/appStore';
import { usePlcStore } from '@/store/plcStore';
import { useSequenceLog } from '@/hooks/useSequenceLog';
import { useStepClock } from '@/hooks/useStepClock';
import { useAnalogHistory } from '@/hooks/useAnalogHistory';
import { energisedRatedCurrent, toNumber, variacSetpoint } from '@/lib/electrical';
import { Brackets } from '@/components/ui';
import { cn, mmss } from '@/lib/format';
import {
  runNoLoadLossTest,
  stopNoLoadLossTest,
  writeSetVoltage,
  type NllOutcome,
  type NllReading,
  type NllStage,
} from '@/tests/no-load-loss/runNoLoadLossTest';
import { NoLoadLossPanel, NoLoadLossSteps } from '@/tests/no-load-loss/NoLoadLossPanel';
import {
  runMagneticBalanceTest,
  stopMagneticBalanceTest,
  type MbtReading,
  type MbtStage,
} from '@/tests/magnetic-balance/runMagneticBalanceTest';
import { PHASES, type MbtResult, type MbtRound, type PhaseIndex } from '@/tests/magnetic-balance/calculation';
import { MagneticBalanceCore, MagneticBalanceSteps } from '@/tests/magnetic-balance/MagneticBalancePanel';
import { MbtBalanceTable } from '@/tests/magnetic-balance/MbtBalanceTable';
import { MBT_TAGS } from '@/tests/magnetic-balance/tags';
import { NLL_TAGS, nllStartSet } from '@/tests/no-load-loss/tags';
import { applySelectionBits } from '@/services/plc/selectionBits';

/**
 * Local controller phase. The PLC owns the actual sequence; this only tracks
 * whether *this page* has a sequence in flight so stale PLC state from a
 * previous test is never mistaken for this one.
 */
type Phase = 'idle' | 'starting' | 'running' | 'stopping' | 'done';

const START_TIMEOUT_MS = 3000;
/** R / Y / B phase colours for the phase dials. */
const PHASE_COLOR = ['var(--color-phase-r)', 'var(--color-phase-y)', 'var(--color-phase-b)'] as const;
/** After No-Load Loss completes and the screen switches, Magnetic Balance starts after this many seconds. */
const AUTO_START_SECS = 10;

type DurationKey = keyof SequenceDurations;
const DURATION_FIELDS: Array<{ key: DurationKey; label: string; min: number; tag: string }> = [
  { key: 't1', label: 'T1', min: 1, tag: 'D110' },
  { key: 'wait', label: 'Wait', min: 0, tag: 'D111' },
  { key: 't2', label: 'T2', min: 1, tag: 'D112' },
];

function validateDuration(raw: string, min: number): string | undefined {
  if (raw.trim() === '') return 'REQUIRED';
  const n = Number(raw);
  if (!Number.isInteger(n)) return 'WHOLE SECONDS';
  if (n < min) return `MIN ${min}`;
  if (n > 3600) return 'MAX 3600';
  return undefined;
}

export function TestExecutionPage() {
  const { testId = '' } = useParams();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const def = getTestDefinition(testId);

  const testObject = useAppStore((s) => s.testObject);
  const selection = useAppStore((s) => s.selection);
  const run = useAppStore((s) => s.runs[testId]);
  const setRunDurations = useAppStore((s) => s.setRunDurations);
  const markRunStarted = useAppStore((s) => s.markRunStarted);
  const markRunEnded = useAppStore((s) => s.markRunEnded);
  const saved = useAppStore((s) => s.results);
  const saveResults = useAppStore((s) => s.saveResults);

  const status = usePlcStore((s) => s.status);
  const online = status?.link === 'ONLINE';

  const [phase, setPhase] = useState<Phase>('idle');
  /** START pressed: on-screen 3-2-1 before the test actually starts */
  const [countdown, setCountdown] = useState(false);
  /** Why the last run was aborted, shown on screen */
  const [abortReason, setAbortReason] = useState<string | null>(null);
  /** "Test completed" banner, e.g. when the PLC pulses M612 */
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  /** Seconds for the start countdown: 3 when START is pressed, AUTO_START_SECS when started automatically */
  const [countdownSecs, setCountdownSecs] = useState(3);
  const location = useLocation();
  const [abortedAt, setAbortedAt] = useState<SeqStep | null>(null);
  /** True once the START pulse has actually been written — arms the ack watchdog. */
  const [ackPending, setAckPending] = useState(false);
  const [draft, setDraft] = useState<Record<DurationKey, string>>(() => ({
    t1: String(run?.durations.t1 ?? def?.defaultDurations.t1 ?? 10),
    wait: String(run?.durations.wait ?? def?.defaultDurations.wait ?? 3),
    t2: String(run?.durations.t2 ?? def?.defaultDurations.t2 ?? 5),
  }));
  const lastRunningStep = useRef<SeqStep | null>(null);
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;

  const { entries, push } = useSequenceLog();
  const clock = useStepClock();
  const { history, peaks } = useAnalogHistory();
  /** Last readings taken while energised — shown (as HOLD) once the source drops. */
  const [held, setHeld] = useState<AnalogReadings | null>(null);

  // No-Load Loss runs from our software (not the PLC sequence).
  const isNll = def?.id === 'no-load';
  const [nllStage, setNllStage] = useState<NllStage | null>(null);
  const [nllReading, setNllReading] = useState<NllReading | null>(null);
  const [nllSetpoint, setNllSetpoint] = useState(0);
  const [nllResult, setNllResult] = useState<NllOutcome | null>(saved.nll ?? null);
  /** Last 60 NLL readings, for the per-phase sparklines. */
  const [nllHistory, setNllHistory] = useState<NllReading[]>([]);
  useEffect(() => {
    if (nllReading) setNllHistory((h) => [...h.slice(-59), nllReading]);
  }, [nllReading]);

  // Magnetic Balance also runs from our software: three rounds, one phase each.
  const isMbt = def?.id === 'magnetic-balance';
  const [mbtRound, setMbtRound] = useState<PhaseIndex | null>(null);
  const [mbtStage, setMbtStage] = useState<MbtStage | null>(null);
  const [mbtReading, setMbtReading] = useState<MbtReading | null>(null);
  const [mbtRounds, setMbtRounds] = useState<Array<MbtRound | undefined>>(() => (saved.mbt?.rounds ?? []).map((r) => r ?? undefined));
  const [mbtResult, setMbtResult] = useState<MbtResult | null>(saved.mbt?.result ?? null);
  /** Highest applied voltage seen: the PLC picks the MBT voltage, so the gauge scales to it. */
  const [mbtPeak, setMbtPeak] = useState(0);
  /** Finished round picked in the step strip to look at again. */
  const [mbtView, setMbtView] = useState<PhaseIndex | null>(null);

  const index = selection.findIndex((s) => s.testId === testId);
  const nextTest = index >= 0 ? selection[index + 1] : undefined;
  const busy = phase === 'starting' || phase === 'running' || phase === 'stopping';

  const durationErrors = useMemo(() => {
    const e: Partial<Record<DurationKey, string>> = {};
    for (const f of DURATION_FIELDS) {
      const msg = validateDuration(draft[f.key], f.min);
      if (msg) e[f.key] = msg;
    }
    return e;
  }, [draft]);
  const durationsValid = Object.keys(durationErrors).length === 0;
  const durations: SequenceDurations = run?.durations ?? def?.defaultDurations ?? { t1: 0, wait: 0, t2: 0 };

  // Initial log lines (guarded so StrictMode's double effect doesn't duplicate them).
  const introLogged = useRef(false);
  useEffect(() => {
    if (introLogged.current || !def || !run) return;
    introLogged.current = true;
    push(`TEST ${index + 1}/${selection.length} LOADED · ${def.code} · ${run.side} ENERGISED`, 'info');
    push(`OBJECT ${testObject?.serialNo ?? '?'} · ${testObject?.ratedPowerKva ?? '?'} kVA`, 'info');
  }, [def, run, index, selection.length, testObject, push]);

  // React to status frames read back from the PLC.
  useEffect(() => {
    if (!status || isNll || isMbt) return; // NLL / MBT are tracked by their own runners
    if (status.running) lastRunningStep.current = status.step;
    if (status.out1 && status.analog.variacV > 1) setHeld(status.analog);
    const inFlight = phase === 'running' || phase === 'stopping';

    if (inFlight && status.link !== 'ONLINE') {
      setPhase('done');
      setAbortedAt(lastRunningStep.current ?? 'OUT1');
      markRunEnded(testId, 'aborted');
      push('LINK LOST DURING SEQUENCE · RUN MARKED ABORTED', 'fault');
      return;
    }
    if (phase === 'starting' && status.running) {
      setPhase('running');
      setAckPending(false);
      setAbortedAt(null);
      markRunStarted(testId);
      return;
    }
    // The PLC is the source of truth: if it reports a running sequence for
    // *this* test (D100 matches) that we did not expect — e.g. a late START
    // ack — track it so the run record reflects reality. STOP and the output
    // lamps follow raw read-back regardless.
    if ((phase === 'idle' || phase === 'done') && status.running && status.testSelect === def?.plcCode) {
      setPhase('running');
      setAbortedAt(null);
      markRunStarted(testId);
      push('PLC REPORTS SEQUENCE RUNNING · TRACKING', 'warn');
      return;
    }
    if (inFlight && !status.running) {
      setPhase('done');
      if (status.step === 'COMPLETE') {
        markRunEnded(testId, 'completed');
      } else {
        setAbortedAt(lastRunningStep.current ?? 'OUT1');
        markRunEnded(testId, 'aborted');
      }
    }
  }, [status, phase, testId, def?.plcCode, isNll, isMbt, markRunStarted, markRunEnded, push]);

  // Watchdog: once START is written, the PLC must report running in time.
  // On timeout, send STOP so a late start can't leave outputs energised.
  useEffect(() => {
    if (phase !== 'starting' || !ackPending) return;
    const id = setTimeout(() => {
      if (phaseRef.current !== 'starting') return;
      setPhase('idle');
      setAckPending(false);
      push('NO START ACKNOWLEDGE FROM PLC · SENDING STOP', 'fault');
      void stopSequence(plc).catch(() => undefined);
    }, START_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [phase, ackPending, push]);

  // Contactor "clunk": the screen gives a small jolt the moment the supply closes.
  const wasEnergised = useRef(false);
  const energisedNow = isMbt ? !!(busy && mbtReading?.on) : isNll ? !!(status?.contactors.c1 && status?.contactors.c7) : !!status?.out1;
  useEffect(() => {
    if (energisedNow && !wasEnergised.current && !reduce) {
      document.getElementById('main')?.animate(
        [{ transform: 'translate(0,0)' }, { transform: 'translate(-3px,1px)' }, { transform: 'translate(3px,-1px)' }, { transform: 'translate(-1px,0)' }, { transform: 'translate(0,0)' }],
        { duration: 260, easing: 'ease-out' },
      );
    }
    wasEnergised.current = energisedNow;
  }, [energisedNow, reduce]);

  // Selection bit of the test on screen is ON, the others OFF (M600 NLL, M606 MBT).
  useEffect(() => {
    if (!online) return;
    void applySelectionBits([testId])
      .then(() => {
        const bit = isMbt ? MBT_TAGS.SELECT.device : isNll ? NLL_TAGS.SELECT.device : null;
        if (bit) push(`TEST SELECTION ON · ${bit}`, 'cmd');
      })
      .catch(() => push('COULD NOT WRITE TEST SELECTION BITS', 'fault'));
  }, [testId, isMbt, isNll, online, push]);

  // No-Load Loss: write the set voltage (D426/D427) when the screen opens; log what the PLC reads back.
  const lvSet = toNumber(testObject?.lvVoltageV ?? '') ?? 0;
  useEffect(() => {
    if (!isNll || !online || lvSet <= 0) return;
    writeSetVoltage(lvSet)
      .then((back) =>
        push(
          `SET VOLTAGE ${lvSet} V → D426/D427 · PLC READS ${back === null ? '?' : back.toFixed(1)} V`,
          back !== null && Math.abs(back - lvSet) < 0.5 ? 'ok' : 'fault',
        ),
      )
      .catch(() => push('WRITING SET VOLTAGE TO D426/D427 FAILED', 'fault'));
  }, [isNll, online, lvSet, push]);

  // Arrived from a finished No-Load Loss: start Magnetic Balance by itself after an AUTO_START_SECS countdown.
  const autoStart = !!(location.state as { autoStart?: boolean } | null)?.autoStart;
  useEffect(() => {
    if (!autoStart || !isMbt || !online || busy) return;
    navigate(location.pathname, { replace: true, state: null }); // only once, not again on refresh
    setCountdownSecs(AUTO_START_SECS);
    setCountdown(true);
    push(`AUTO START · MAGNETIC BALANCE IN ${AUTO_START_SECS} S`, 'cmd');
  }, [autoStart, isMbt, online, busy, navigate, location.pathname, push]);

  // After No-Load Loss completes (M602 HIGH), move on to Magnetic Balance by itself.
  const [autoNext, setAutoNext] = useState<number | null>(null);
  const hasMbt = selection.some((s) => s.testId === 'magnetic-balance');
  useEffect(() => {
    if (autoNext === null) return;
    if (autoNext <= 0) {
      navigate('/test/magnetic-balance', { state: { autoStart: true } });
      return;
    }
    const id = setTimeout(() => setAutoNext((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(id);
  }, [autoNext, navigate]);

  // Safety: leaving the page mid-sequence drops the outputs.
  useEffect(
    () => () => {
      if (phaseRef.current === 'running' || phaseRef.current === 'starting') {
        stopNoLoadLossTest();
        if (isMbt) stopMagneticBalanceTest();
        void stopSequence(plc).catch(() => undefined);
      }
    },
    [],
  );

  if (!def || !run) return null;

  const plannedSet = testObject ? variacSetpoint(testObject, run.side, def.otherWinding) : 0;
  const mbtSupported = testObject?.phases !== '1';
  const mbtPrefix = ''; // labels are line pairs RY / YB / BR
  const mbtLive = isMbt && busy && !!mbtReading?.on;
  // Core view: live round while running, otherwise the picked (or last) finished round.
  const mbtShown: PhaseIndex | null = busy
    ? mbtRound
    : (mbtView ?? ([2, 1, 0] as const).find((p) => mbtRounds[p]) ?? null);
  const mbtShownV = busy ? (mbtReading?.v ?? null) : mbtShown !== null ? (mbtRounds[mbtShown]?.v ?? null) : null;

  const plcRunning = !!status?.running;
  const canStop = (busy || plcRunning) && phase !== 'stopping';

  const startNoLoadLoss = async () => {
    if (!testObject) return;
    setAbortReason(null);
    const setVoltage = toNumber(testObject.lvVoltageV) ?? 0;
    const guaranteedW = toNumber(testObject.guaranteedNoLoadLossW) ?? 0;
    const ratedLvA = energisedRatedCurrent(testObject, 'LV');
    setPhase('running');
    setAbortedAt(null);
    setNllResult(null);
    setNllReading(null);
    setNllHistory([]);
    markRunStarted(testId);
    push(`NLL START · SET ${setVoltage} V · GUARANTEED ${guaranteedW} W`, 'cmd');
    try {
      const result = await runNoLoadLossTest(
        {
          setVoltage,
          guaranteedW,
          phases: testObject.phases === '1' ? 1 : 3,
          // No-load current is normally under 3 % of rated — 10 % means something is wrong.
          maxCurrentA: ratedLvA ? ratedLvA * 0.1 : Infinity,
        },
        {
          log: (msg) => push(msg.toUpperCase(), 'info'),
          onStage: setNllStage,
          onReading: setNllReading,
          onSetpoint: setNllSetpoint,
        },
      );
      setNllResult(result);
      saveResults({ nll: result });
      markRunEnded(testId, 'completed');
      if (hasMbt) setAutoNext(3);
      push(`NLL ${result.pass ? 'PASS' : 'FAIL'} · P0 ${result.p0.toFixed(1)} W`, result.pass ? 'info' : 'fault');
    } catch (e) {
      setAbortReason(e instanceof Error ? e.message : String(e));
      setAbortedAt('OUT1');
      markRunEnded(testId, 'aborted');
    } finally {
      releaseSelection(NLL_TAGS.SELECT.device);
      setPhase('done');
    }
  };

  /** Test over (completed OR aborted): its selection bit goes LOW; report if the PLC keeps it ON. */
  const releaseSelection = (bit: string) => {
    applySelectionBits([])
      .then((stuck) =>
        stuck.length
          ? push(`${bit} STILL ON IN THE PLC AFTER WRITING 0 · THE LADDER IS HOLDING IT`, 'fault')
          : push(`TEST OVER · ${bit} LOW`, 'cmd'),
      )
      .catch(() => push(`COULD NOT SET ${bit} LOW`, 'fault'));
  };

  const startMagneticBalance = async () => {
    setAbortReason(null);
    setDoneMsg(null);
    setPhase('running');
    setAbortedAt(null);
    setMbtResult(null);
    setMbtReading(null);
    setMbtRounds([]);
    setMbtView(null);
    setMbtPeak(0);
    saveResults({ mbt: { rounds: [], result: null } });
    markRunStarted(testId);
    push(`MBT START · ${MBT_TAGS.SELECT.device} ON · M610 PULSE · PLC RUNS RY, YB, BR`, 'cmd');
    const rounds: Array<MbtRound | null> = [null, null, null];
    try {
      const result = await runMagneticBalanceTest({
        log: (msg) => push(msg.toUpperCase(), 'info'),
        onRound: setMbtRound,
        onStage: setMbtStage,
        onReading: (r) => {
          setMbtReading(r);
          setMbtPeak((p) => Math.max(p, r.v[r.round]));
        },
        onRoundDone: (r) => {
          rounds[r.energised] = r;
          saveResults({ mbt: { rounds: [...rounds], result: null } });
          setMbtRounds(rounds.map((x) => x ?? undefined));
        },
      });
      setMbtResult(result);
      saveResults({ mbt: { rounds, result } });
      markRunEnded(testId, 'completed');
      setDoneMsg(`Magnetic Balance test completed · ${MBT_TAGS.COMPLETE.device} received from the PLC`);
      push(`MAGNETIC BALANCE TEST COMPLETED · ${result.pass ? 'PASS' : 'FAIL'}`, result.pass ? 'ok' : 'fault');
    } catch (e) {
      setAbortReason(e instanceof Error ? e.message : String(e));
      setAbortedAt('OUT1');
      markRunEnded(testId, 'aborted');
    } finally {
      releaseSelection(MBT_TAGS.SELECT.device);
      setPhase('done');
    }
  };

  const onStart = async () => {
    if (isMbt) {
      if (!busy && online && mbtSupported) void startMagneticBalance();
      return;
    }
    if (isNll) {
      if (!busy && online) void startNoLoadLoss();
      return;
    }
    if (!durationsValid || busy || plcRunning || !online) return;
    const d: SequenceDurations = { t1: Number(draft.t1), wait: Number(draft.wait), t2: Number(draft.t2) };
    setRunDurations(testId, d);
    setAbortedAt(null);
    lastRunningStep.current = null;
    setPhase('starting');
    setAckPending(false);
    setHeld(null);
    push(`CMD WRITE D100=${def.plcCode} D101=${run.side === 'HV' ? 1 : 0} D110=${d.t1} D111=${d.wait} D112=${d.t2} D113=${plannedSet}`, 'cmd');
    try {
      await startSequence(plc, { testCode: def.plcCode, side: run.side, durations: d, variacSetV: plannedSet });
      push('CMD START → M100 PULSE', 'cmd');
      setAckPending(true);
    } catch (e) {
      setPhase('idle');
      push(`START FAILED · ${e instanceof Error ? e.message.toUpperCase() : 'UNKNOWN'}`, 'fault');
    }
  };

  const onStop = async () => {
    if (!canStop) return;
    setPhase('stopping');
    if (isMbt) {
      push('CMD STOP → M611 PULSE', 'cmd');
      stopMagneticBalanceTest();
      return;
    }
    if (isNll) {
      push('CMD STOP · SWITCHING OFF', 'cmd');
      stopNoLoadLossTest();
      return;
    }
    push('CMD STOP → M101 PULSE', 'cmd');
    try {
      await stopSequence(plc);
    } catch (e) {
      push(`STOP FAILED · ${e instanceof Error ? e.message.toUpperCase() : 'UNKNOWN'}`, 'fault');
    }
  };

  const goNext = () => navigate(nextTest ? `/test/${nextTest.testId}` : '/summary');

  // What the visuals show.
  const plcStep: SeqStep = status?.step ?? 'IDLE';
  const viewStep: SeqStep =
    phase === 'running' || phase === 'stopping'
      ? plcStep
      : phase === 'done' || phase === 'idle'
        ? run.status === 'completed'
          ? 'COMPLETE'
          : run.status === 'aborted'
            ? 'ABORTED'
            : 'IDLE'
        : 'IDLE';
  // Output indicators always mirror the raw read-back, regardless of page state.
  const energised = isMbt ? mbtLive : isNll ? !!(status?.contactors.c1 && status?.contactors.c7) : !!status?.out1;
  const capturing = !!status?.out2;

  const liveAnalog = status?.analog;
  const showHeld = !status?.out1 && held !== null;
  const analog = showHeld ? held : liveAnalog;
  const variacV = isMbt
    ? mbtReading && busy
      ? mbtReading.v[mbtReading.round]
      : 0
    : isNll
      ? (nllReading?.dimmerV ?? 0)
      : (liveAnalog?.variacV ?? 0);
  const nllAvgI = online && nllReading?.i.length ? nllReading.i.reduce((a, b) => a + b, 0) / nllReading.i.length : 0;
  /** Current dials share one full scale: a round number above the highest current seen this run. */
  const nllMaxI = niceMax(Math.max(0, ...nllHistory.flatMap((r) => r.i)) * 1.25, 0.1);
  const mbtSet = Math.round(mbtPeak) || 230;
  const gaugeSet = isMbt
    ? mbtSet
    : isNll
    ? busy
      ? nllSetpoint
      : plannedSet
    : busy && liveAnalog?.variacSetV
      ? liveAnalog.variacSetV
      : plannedSet;
  const ratedI = testObject ? energisedRatedCurrent(testObject, run.side) : null;
  const guaranteeW =
    def.id === 'no-load'
      ? toNumber(testObject?.guaranteedNoLoadLossW ?? '')
      : def.id === 'load-loss'
        ? toNumber(testObject?.guaranteedLoadLossW ?? '')
        : null;
  const reading = (v: number | undefined) => (online && v !== undefined ? v : null);
  const nominalHz = Number(testObject?.frequency ?? 50);

  const stepCaption: Record<SeqStep, string> = {
    IDLE: phase === 'starting' ? 'Arming…' : 'Ready',
    OUT1: 'T1 · Energised',
    WAIT: 'Wait · De-energised',
    OUT2: 'T2 · Capture',
    COMPLETE: 'Complete',
    ABORTED: 'Aborted',
    FAULT: 'PLC Fault',
  };
  const draftTotal = durationsValid ? Number(draft.t1) + Number(draft.wait) + Number(draft.t2) : null;

  return (
    <Page slide={switchDirection}>
      <PageHeader
        code={`STEP 03 / EXECUTION · SEQ / ${def.code}`}
        title={def.name}
        subtitle={
          <>
            Object <span className="num text-fg">{testObject?.serialNo}</span> · {connectionLabel(run.side, def.otherWinding)} ·{' '}
            {testObject?.ratedPowerKva} kVA {testObject?.hvVoltageKv} kV / {testObject?.lvVoltageV} V
          </>
        }
        aside={
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="label-tech text-[12px] text-fg-dim">Test</div>
              <div className="num text-xl text-fg">
                {index + 1}
                <span className="text-fg-dim"> / {selection.length}</span>
              </div>
            </div>
            <div className="flex gap-1" aria-hidden>
              {selection.map((s, i) => (
                <span
                  key={s.testId}
                  className={cn(
                    'h-6 w-1.5',
                    i < index ? 'bg-ok/70' : i === index ? 'bg-accent-grad' : 'bg-line-strong',
                  )}
                />
              ))}
            </div>
          </div>
        }
      />

      <TestSwitcher current={testId} locked={busy} />

      {/* Test completed (Magnetic Balance: M612 from the PLC) */}
      <AnimatePresence>
        {doneMsg && phase === 'done' && run?.status === 'completed' && (
          <motion.div
            key="done-msg"
            role="status"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-4 rounded-[8px] border border-ok/60 bg-ok/[0.08] px-4 py-3"
          >
            <span className="grid size-9 place-items-center rounded-full border-2 border-ok text-lg font-bold text-ok">✓</span>
            <div className="min-w-0 flex-1 font-semibold text-ok">{doneMsg}</div>
            <Button variant="outline" size="md" onClick={() => setDoneMsg(null)}>
              OK
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* No-Load Loss complete → switching to Magnetic Balance */}
      <AnimatePresence>
        {autoNext !== null && autoNext > 0 && (
          <motion.div
            key="auto-next"
            role="status"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-4 rounded-[8px] border border-ok/60 bg-ok/[0.08] px-4 py-3"
          >
            <span className="grid size-9 place-items-center rounded-full border-2 border-ok font-display text-lg font-bold text-ok tabular-nums">
              {autoNext}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-ok">No-Load Loss complete · {NLL_TAGS.COMPLETE.device} HIGH</div>
              <div className="text-[15px] text-fg-muted">Switching to Magnetic Balance in {autoNext} s</div>
            </div>
            <Button variant="outline" size="md" onClick={() => setAutoNext(null)}>
              Stay here
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Energised hazard banner */}
      <AnimatePresence>
        {energised && (
          <motion.div
            key="hazard"
            role="alert"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="relative overflow-hidden rounded-[12px] border border-amber/50 bg-amber-deep/40"
          >
            <div className="hatch absolute inset-0" aria-hidden />
            <motion.div
              aria-hidden
              className="absolute inset-0 bg-amber/10"
              animate={reduce ? undefined : { opacity: [0.2, 0.8, 0.2] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
            <div className="relative flex items-center gap-3 px-4 py-2">
              <TriangleAlert className="size-4 text-amber" aria-hidden />
              <span className="label-tech text-amber">Danger · {run.side} winding energised · keep clear of test bay</span>
              <span className="num ml-auto text-[13px] text-amber">
                {isMbt ? `${PHASES[mbtRound ?? 0]} ENERGISED` : isNll ? 'C1 + C7 CLOSED' : 'K1 CLOSED · Y0 = 1'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sequence timeline */}
      <Panel
        tag="SEQ-01"
        title="Sequence"
        active={energised}
        aside={
          <span className="num text-[13px] text-fg-dim">
            PLC STEP <span className={cn(status?.running ? 'text-amber' : 'text-fg-muted')}>{plcStep}</span>
          </span>
        }
        bodyClassName="px-6 py-6"
      >
        {isMbt ? (
          <MagneticBalanceSteps
            round={mbtRound}
            stage={mbtStage}
            rounds={mbtRounds}
            result={mbtResult}
            viewing={mbtShown}
            onView={setMbtView}
          />
        ) : isNll ? (
          <NoLoadLossSteps stage={nllStage} />
        ) : (
          <SequenceTimeline step={viewStep} abortedAt={abortedAt} durations={durations} progress={clock.progress} />
        )}
      </Panel>

      {/* No-Load Loss: per-phase panel meter, voltage + current */}
      {isNll && (
        <Panel tag="PH-01" title="Phase Readings" active={energised} bodyClassName="grid grid-cols-2 gap-px bg-line p-0! md:grid-cols-3 2xl:grid-cols-6 [&>*]:bg-ink-850">
          {(['V1', 'V2', 'V3'] as const).map((tag, n) => {
            const vMax = niceMax(gaugeSet > 0 ? gaugeSet * 1.2 : 500);
            return (
              <ReadingTile
                key={tag}
                device={NLL_TAGS[tag].device}
                label={`Voltage ${tag}`}
                value={online ? (nllReading?.v[n] ?? 0) : 0}
                unit="V"
                decimals={vMax >= 2000 ? 0 : 1}
                color={PHASE_COLOR[n]}
                live={energised}
                intDigits={String(Math.floor(vMax)).length}
              />
            );
          })}
          {(['I1', 'I2', 'I3'] as const).map((tag, n) => (
            <ReadingTile
              key={tag}
              device={NLL_TAGS[tag].device}
              label={`Current ${tag}`}
              value={online ? (nllReading?.i[n] ?? 0) : 0}
              unit="A"
              decimals={3}
              color={PHASE_COLOR[n]}
              live={energised}
              intDigits={String(Math.floor(nllMaxI)).length}
            />
          ))}
        </Panel>
      )}

      <motion.div variants={stagger(0.07, 0)} className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)] hd:grid-cols-[290px_minmax(0,1fr)_310px] 2xl:grid-cols-[340px_minmax(0,1fr)_380px]">
        {/* Variac gauge */}
        <Panel
          tag="VAR-01"
          title="Variac"
          active={energised}
          aside={<span className={cn('num text-[13px]', energised ? 'text-amber' : 'text-fg-dim')}>{energised ? 'OUTPUT ON' : 'OUTPUT OFF'}</span>}
          bodyClassName="flex flex-col items-center justify-center px-4 py-5"
        >
          {isNll ? (
            <div className="flex w-full flex-col gap-6">
              <VariacGauge value={variacV} setpoint={gaugeSet} live={energised} label="Average voltage" />
              <VariacGauge value={nllAvgI} setpoint={0} live={energised} unit="A" label="Average current" max={nllMaxI} decimals={3} />
            </div>
          ) : (
            <VariacGauge value={variacV} setpoint={gaugeSet} live={energised} />
          )}
        </Panel>

        {/* Outputs + SLD */}
        <Panel tag="IO-01" title="Outputs & Test Object" active={energised} bodyClassName="flex flex-col gap-4 p-0">
          <div className="grid grid-cols-2 gap-px border-b border-line bg-line md:grid-cols-4 hd:grid-cols-2 2xl:grid-cols-4 [&>*]:bg-ink-850">
            {isMbt ? (
              <>
                {PHASES.map((p, i) => (
                  <OutputLamp
                    key={p}
                    label={`${mbtPrefix}${p}`}
                    sub={mbtLive && mbtRound === i ? 'SUPPLIED' : 'METER'}
                    on={mbtLive && mbtRound === i}
                    color="amber"
                    pulse
                  />
                ))}
              </>
            ) : isNll ? (
              <>
                <OutputLamp label="C1" sub="SUPPLY" on={!!status?.contactors.c1} color="amber" pulse />
                <OutputLamp label="C7" sub="LV SIDE" on={!!status?.contactors.c7} color="amber" pulse />
                <OutputLamp label="RUN" sub="NLL TEST" on={busy} color="amber" />
              </>
            ) : (
              <>
                <OutputLamp label="OUT 1" sub="Y0 · ENERGISE" on={energised} color="amber" pulse />
                <OutputLamp label="OUT 2" sub="Y1 · CAPTURE" on={capturing} color="amber" pulse />
                <OutputLamp label="RUN" sub="M110 · SEQUENCE" on={!!status?.running} color="amber" />
              </>
            )}
            <div className="flex flex-col justify-center gap-1.5 px-4 py-3">
              <LinkIndicator />
              <span className="num text-[13px] text-fg-dim">HB {status?.heartbeat ?? 0}</span>
            </div>
          </div>
          <div className="px-4 pb-4">
            {isMbt ? (
              <div className="flex flex-col gap-5">
                <MagneticBalanceCore energised={mbtShown} v={mbtShownV} appliedSet={mbtSet} live={mbtLive} prefix={mbtPrefix} />
                <MbtBalanceTable
                  side={run.side}
                  rounds={mbtRounds}
                  result={mbtResult}
                  live={mbtLive && mbtReading ? { energised: mbtReading.round, v: mbtReading.v } : null}
                />
              </div>
            ) : (
              <TransformerVisual
                out1={energised}
                variacV={variacV}
                side={run.side}
                otherWinding={def.otherWinding}
                phases={testObject?.phases ?? '3'}
                serial={testObject?.serialNo}
                kva={testObject?.ratedPowerKva}
              />
            )}
          </div>
        </Panel>

        {/* Controls */}
        <Panel
          tag="CTL-01"
          title="Control"
          tone={phase === 'stopping' ? 'fault' : 'default'}
          className="lg:col-span-2 hd:col-span-1"
          aside={busy ? <Lock className="size-3.5 text-amber" aria-label="Presets locked" /> : null}
          bodyClassName="flex flex-col gap-4"
        >
          {isMbt ? (
            <div className="num grid grid-cols-3 gap-3 text-[13px] text-fg-dim">
              <div>
                APPLIED<div className="text-lg text-fg">{mbtPeak > 5 ? `${mbtSet} V` : 'PLC'}</div>
              </div>
              <div>
                ROUNDS<div className="whitespace-nowrap text-base text-fg">RY·YB·BR</div>
              </div>
              <div>
                WINDING<div className="text-lg text-fg">{run.side}</div>
              </div>
            </div>
          ) : isNll ? (
            <div className="num grid grid-cols-3 gap-3 text-[13px] text-fg-dim">
              <div>
                SET VOLTAGE<div className="text-lg text-fg">{testObject?.lvVoltageV || '--'} V</div>
              </div>
              <div>
                RAMP<div className="text-lg text-fg">5 V/s</div>
              </div>
              <div>
                GUARANTEED<div className="text-lg text-fg">{testObject?.guaranteedNoLoadLossW || '--'} W</div>
              </div>
            </div>
          ) : (
          <fieldset disabled={busy} className="grid grid-cols-3 gap-3">
            <legend className="label-tech mb-2 flex w-full items-center justify-between text-[13px]">
              <span>Presets [s]</span>
              <span className="num normal-case tracking-normal text-fg-dim">{busy ? 'LOCKED · RUNNING' : 'EDITABLE'}</span>
            </legend>
            {DURATION_FIELDS.map((f) => (
              <TextField
                key={f.key}
                label={f.label}
                unit={f.tag}
                value={draft[f.key]}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value.replace(/[^\d]/g, '') }))}
                inputMode="numeric"
                mono
                maxLength={4}
                error={durationErrors[f.key]}
                disabled={busy}
                className="text-lg"
              />
            ))}
          </fieldset>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="primary"
              size="xl"
              onClick={() => {
                setCountdownSecs(3);
                setCountdown(true);
              }}
              disabled={countdown || busy || !online || (isMbt ? !mbtSupported : isNll ? !nllStartSet : plcRunning || !durationsValid)}
              icon={<Play className="size-5 fill-current" aria-hidden />}
              className="w-full"
            >
              {run.status === 'completed' || run.status === 'aborted' ? 'Re-run' : 'Start'}
            </Button>
            <StartCountdown
              open={countdown}
              seconds={countdownSecs}
              title={def.name}
              onDone={() => {
                setCountdown(false);
                void onStart();
              }}
              onCancel={() => {
                setCountdown(false);
                push('START CANCELLED BY OPERATOR', 'warn');
              }}
            />
            <StopMushroom onPress={() => void onStop()} disabled={!canStop} label={phase === 'stopping' ? '…' : 'Stop'} />
          </div>

          <div className="num min-h-5 text-[13px]" aria-live="polite">
            {!online ? (
              <span className="text-fault">PLC LINK NOT ONLINE · START INHIBITED</span>
            ) : phase === 'starting' ? (
              <span className="text-amber">WRITING PRESETS · AWAITING START ACK…</span>
            ) : phase === 'running' ? (
              <span className="text-amber">
                {isMbt ? `MBT ${mbtRounds.filter(Boolean).length}/3 ROUNDS DONE · ${mbtStage === 'ENERGISED' ? `${PHASES[mbtRound ?? 0]} ON` : 'WAITING FOR PLC'}` : isNll ? `NLL ${nllStage ?? ''}` : 'SEQUENCE RUNNING'} · STOP
                ALWAYS AVAILABLE
              </span>
            ) : isMbt ? (
              mbtSupported ? (
                <span className="text-fg-dim">1-PH SUPPLY · ONE LIMB AT A TIME · PRESS START</span>
              ) : (
                <span className="text-fault">MAGNETIC BALANCE NEEDS A 3-PHASE TRANSFORMER</span>
              )
            ) : isNll ? (
              nllStartSet ? (
                <span className="text-fg-dim">HV OPEN · LV SUPPLIED · PRESS START</span>
              ) : (
                <span className="text-fault">NLL START ADDRESS NOT SET · ADD IT IN tests/no-load-loss/tags.ts</span>
              )
            ) : !durationsValid ? (
              <span className="text-fault">CHECK PRESET VALUES</span>
            ) : (
              <span className="text-fg-dim">
                TOTAL {draftTotal !== null ? mmss(draftTotal) : '--:--'} · DEFAULT {mmss(totalDuration(def.defaultDurations))}
              </span>
            )}
          </div>

          <AnimatePresence>
            {phase === 'done' && (
              <motion.div
                key="next"
                variants={powerUp}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0 }}
                className={cn(
                  'flex items-center gap-3 border p-3',
                  run.status === 'completed' ? 'border-ok/50 bg-ok/[0.06]' : 'border-fault/50 bg-fault/[0.06]',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className={cn('label-tech text-[13px]', run.status === 'completed' ? 'text-ok' : 'text-fault')}>
                    {run.status === 'completed' ? 'Test completed' : 'Test stopped'}
                  </div>
                  {run.status === 'aborted' && abortReason && (
                    <div className="mt-0.5 text-[14px] text-fault">{abortReason}</div>
                  )}
                  <div className="num truncate text-[13px] text-fg-dim">
                    {nextTest ? `NEXT · ${getTestDefinition(nextTest.testId)?.name.toUpperCase()}` : 'LAST TEST IN SEQUENCE'}
                  </div>
                </div>
                <Button
                  variant={run.status === 'completed' ? 'primary' : 'outline'}
                  size="md"
                  magnetic
                  onClick={goNext}
                  icon={nextTest ? <ArrowRight className="size-4" aria-hidden /> : <Flag className="size-4" aria-hidden />}
                  autoFocus
                >
                  {nextTest ? 'Next Test' : 'Finish'}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </Panel>
      </motion.div>

      {isNll && (
        <NoLoadLossPanel
          reading={nllReading}
          result={nllResult}
          ratedLvA={testObject ? energisedRatedCurrent(testObject, 'LV') : null}
        />
      )}


      {/* Live measurement cards */}
      {!isNll && (
      <motion.section variants={stagger(0.06, 0)} aria-label="Live measurements" className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          icon={Activity}
          label="Variac Voltage"
          code="D130 · V"
          value={reading(analog?.variacV)}
          unit="V"
          decimals={gaugeSet >= 2000 ? 0 : 1}
          history={history.variacV}
          reference={gaugeSet > 0 ? { value: gaugeSet, label: `SET ${gaugeSet} V` } : null}
          peak={peaks.variacV}
          live={energised}
          held={showHeld}
        />
        <MetricCard
          icon={Zap}
          label="Line Current"
          code="D132 · A"
          value={reading(analog?.currentA)}
          unit="A"
          decimals={2}
          history={history.currentA}
          reference={ratedI ? { value: ratedI, label: `IN ${run.side} ${ratedI.toFixed(1)} A` } : null}
          peak={peaks.currentA}
          live={energised}
          held={showHeld}
        />
        <MetricCard
          icon={Flame}
          label="Active Power"
          code="D134 · kW"
          value={reading(analog ? analog.powerW / 1000 : undefined)}
          unit="kW"
          decimals={2}
          history={history.powerW}
          reference={guaranteeW ? { value: guaranteeW / 1000, label: `GUAR ${(guaranteeW / 1000).toFixed(2)} kW` } : null}
          peak={peaks.powerW / 1000}
          live={energised}
          held={showHeld}
          footer={<div className="num text-[12px] text-fg-dim">NO GUARANTEE FOR {def.code}</div>}
        />
        <MetricCard
          icon={AudioWaveform}
          label="Frequency"
          code="D136 · Hz"
          value={reading(analog?.frequencyHz)}
          unit="Hz"
          decimals={2}
          history={history.frequencyHz}
          live={energised}
          held={showHeld}
          footer={
            <div className="num text-[12px] text-fg-dim">
              NOM {nominalHz} Hz · DEV{' '}
              <span className="text-fg-muted">{analog && analog.frequencyHz > 0 ? (analog.frequencyHz - nominalHz).toFixed(3) : '--'}</span>
            </div>
          }
        />
        <MetricCard
          icon={Sigma}
          label="Power Factor"
          code="D138 · cos φ"
          value={reading(analog?.powerFactor)}
          unit="cos φ"
          decimals={3}
          history={history.powerFactor}
          live={energised}
          held={showHeld}
          footer={
            <div className="num text-[12px] text-fg-dim">
              φ{' '}
              <span className="text-fg-muted">
                {analog && analog.powerFactor > 0 ? `${((Math.acos(Math.min(1, analog.powerFactor)) * 180) / Math.PI).toFixed(1)}°` : '--'}
              </span>{' '}
              · LAGGING
            </div>
          }
        />
        <StepCard
          caption={stepCaption[busy ? plcStep : viewStep]}
          remainingMs={clock.remainingMs}
          progress={clock.progress}
          running={busy && !!status?.running}
          total={draftTotal}
          energised={energised}
        />
      </motion.section>
      )}

      <Panel tag="LOG-01" title="Event Log" bodyClassName="p-0" aside={<span className="num text-[13px] text-fg-dim">{entries.length} EVT</span>}>
        <EventLog entries={entries} />
      </Panel>
    </Page>
  );
}

function OutputLamp({
  label,
  sub,
  on,
  color,
  pulse,
}: {
  label: string;
  sub: string;
  on: boolean;
  color: 'amber' | 'ok';
  pulse?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Lamp on={on} color={color} size="lg" pulse={pulse} label={label} />
      <div className="min-w-0">
        <div className={cn('font-display text-sm font-semibold tracking-[0.14em]', on ? 'text-amber' : 'text-fg')}>{label}</div>
        <div className="num truncate text-[13px] text-fg-dim">{sub}</div>
      </div>
    </div>
  );
}

/** Step countdown card — same shell as MetricCard, driven by the rAF step clock. */
function StepCard({
  caption,
  remainingMs,
  progress,
  running,
  total,
  energised,
}: {
  caption: string;
  remainingMs: MotionValue<number>;
  progress: MotionValue<number>;
  running: boolean;
  total: number | null;
  energised: boolean;
}) {
  const secs = useTransform(remainingMs, (ms) => (ms / 1000).toFixed(1));
  return (
    <m.div
      variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
      data-active={running ? 'true' : undefined}
      whileHover={{ y: -3 }}
      className={cn(
        'edge-light relative overflow-hidden border bg-ink-850/90 p-4',
        energised ? 'border-amber/40' : 'border-line hover:border-accent/50',
      )}
    >
      <Brackets color={running ? 'border-accent' : 'border-fg-dim'} />
      <div className="flex items-center gap-2.5">
        <div className={cn('grid size-8 place-items-center border', running ? 'border-accent/60 bg-accent/10 text-accent' : 'border-line-strong text-accent')}>
          <Timer className="size-4" strokeWidth={1.8} aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="label-tech truncate text-[13px] text-fg">Step Timer</div>
          <div className="num truncate text-[12px] text-fg-dim">{caption.toUpperCase()}</div>
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        {running ? (
          <m.span className="num text-[30px] font-medium leading-none text-fg">{secs}</m.span>
        ) : (
          <span className="num text-[30px] font-medium leading-none text-fg-dim">{total !== null ? mmss(total) : '--'}</span>
        )}
        <span className="num text-xs text-fg-dim">{running ? 's left' : 'total'}</span>
      </div>
      <div className="mt-5 h-1.5 overflow-hidden bg-ink-700">
        <m.div className="h-full w-full origin-left bg-accent-grad" style={{ scaleX: running ? progress : 0 }} />
      </div>
      <div className="num mt-2 text-[12px] text-fg-dim">{running ? 'STEP PROGRESS' : 'PRESS START TO RUN'}</div>
    </m.div>
  );
}
