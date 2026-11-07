/**
 * Voltage Ratio test.
 *
 *   1. Pulse START — the PLC applies the test voltage to the HV winding
 *   2. Every 0.5 s read the HV voltage applied and the LV voltage measured (V)
 *   3. For each tap, record the voltages once steady: ratio = HV ÷ LV per phase
 *        Manual tap mode: the operator sets the tap and presses RECORD
 *        PLC tap mode:    the PLC sets the tap; the app waits for TAP to show it
 *   4. Finished after the last tap, or when the PLC sets COMPLETE
 *
 * While TTR_TAGS has empty addresses, DEMO data is played instead, through the
 * same callbacks, so the screen looks exactly as it will with the real meters.
 */
import type { TestObject } from '@/store/types';
import { createRunControl, jitter, READ_EVERY_MS, tagsReady } from '@/tests/shared/runtime';
import { ratedVoltages, tapPositions, type TapInfo } from '@/tests/shared/transformer';
import { TTR_TAGS } from './tags';
import { calculateRatio, ratedRatio, tapRow, type TtrResult, type TtrTapRow } from './calculation';

export type TapMode = 'manual' | 'plc';

export interface TtrReading {
  /** Index into the tap plan being measured */
  tapIndex: number | null;
  /** Manual mode: waiting for the operator to set the tap and press RECORD */
  waitingForOperator: boolean;
  /** Averaging the voltages for this tap */
  recording: boolean;
  /** Test leads being connected and checked, before the supply comes on */
  connecting?: boolean;
  /** Live HV line voltages applied, V */
  hvV: number[];
  /** Live LV line voltages, V */
  lvV: number[];
  /** HV test voltage the supply is set to, V */
  supplyV: number;
  rows: TtrTapRow[];
}

export interface TtrCallbacks {
  log?: (msg: string) => void;
  onReading?: (r: TtrReading) => void;
}

export type TtrPlan = Array<TapInfo & { rated: number }>;

const run = createRunControl();
let recordRequested = false;

export const stopRatioTest = () => run.stop();
/** Operator pressed RECORD for the tap shown (manual tap mode). */
export const recordRatioTap = () => {
  recordRequested = true;
};
export const ttrUsesPlc = () => tagsReady(TTR_TAGS);

const RECORD_SAMPLES = 4; // readings averaged per tap
const CONNECT_MS = 5200; // leads connected + continuity checked before the supply comes on

/** Tap list with rated ratios, as shown before the test starts. */
export function ttrPlan(o: TestObject): TtrPlan {
  const v = ratedVoltages(o);
  return tapPositions(o).map((t) => ({ ...t, rated: ratedRatio(v.hv || 11000, v.lv || 440, t.pct) }));
}

/** HV test voltage applied for the ratio test, V (3-phase bench supply). */
export const TTR_APPLIED_HV = 415;
export const ttrSupplyV = (_o: TestObject) => TTR_APPLIED_HV;

const mean = (xs: number[][], i: number) => xs.reduce((s, x) => s + x[i], 0) / xs.length;

export async function runRatioTest(o: TestObject, mode: TapMode, cb: TtrCallbacks = {}): Promise<TtrResult> {
  const log = cb.log ?? console.log;
  run.reset();
  recordRequested = false;
  const plan = ttrPlan(o);
  const nPh = o.phases === '1' ? 1 : 3;
  const supplyV = ttrSupplyV(o);
  const rows: TtrTapRow[] = [];

  // Where the voltages come from: the PLC, or the demo model.
  const source = ttrUsesPlc() ? plcSource(nPh) : demoSource(plan, nPh, supplyV);

  const emit = (tapIndex: number | null, live: { hv: number[]; lv: number[] }, extra: Partial<TtrReading> = {}) =>
    cb.onReading?.({
      tapIndex,
      waitingForOperator: false,
      recording: false,
      hvV: live.hv,
      lvV: live.lv,
      supplyV,
      rows: [...rows],
      ...extra,
    });

  const record = async (ti: number) => {
    const samples: { hv: number[]; lv: number[] }[] = [];
    while (samples.length < RECORD_SAMPLES) {
      run.check();
      const live = await source.read(ti);
      samples.push(live);
      emit(ti, live, { recording: true });
      await run.sleep(READ_EVERY_MS);
    }
    const t = plan[ti];
    const hv = Array.from({ length: nPh }, (_, i) => mean(samples.map((s) => s.hv), i));
    const lv = Array.from({ length: nPh }, (_, i) => mean(samples.map((s) => s.lv), i));
    const row = tapRow(t, t.rated, hv, lv);
    rows.push(row);
    log(`Tap ${t.tap} · ratio ${row.measured.map((m) => m.toFixed(3)).join(' / ')} · rated ${t.rated.toFixed(3)} · ${row.pass ? 'within' : 'OUTSIDE'} ±0.5 %`);
  };

  try {
    emit(null, { hv: [], lv: [] }, { connecting: true });
    log('Connecting test leads · H1–H3 to HV 1U 1V 1W · X1–X3 to LV 2u 2v 2w');
    await run.sleep(CONNECT_MS);
    log('Leads connected · continuity OK');
    log(`${source.demo ? 'DEMO · ' : ''}Test voltage on HV · ${supplyV} V · tap mode ${mode === 'manual' ? 'MANUAL' : 'PLC'}`);
    await source.start();

    for (let ti = 0; ti < plan.length; ti++) {
      const t = plan[ti];
      if (mode === 'manual') {
        log(`Set tap ${t.tap}${t.nominal ? ' (normal)' : ''}, then press RECORD`);
        recordRequested = false;
        while (!recordRequested) {
          run.check();
          emit(ti, await source.read(ti), { waitingForOperator: true });
          await run.sleep(READ_EVERY_MS);
        }
      } else {
        while ((await source.tap(ti)) !== t.tap) {
          run.check();
          emit(ti, await source.read(ti));
          await run.sleep(READ_EVERY_MS);
        }
        log(`PLC set tap ${t.tap}`);
        for (let k = 0; k < 4; k++) {
          // let the voltages settle after the tap change
          run.check();
          emit(ti, await source.read(ti));
          await run.sleep(READ_EVERY_MS);
        }
      }
      await record(ti);
      if (mode === 'plc' && (await source.complete())) break;
    }
    emit(null, { hv: [], lv: [] });
    log('All taps recorded');
    return calculateRatio(rows);
  } catch (error) {
    // Stopped: drop the live state so the drawing stops showing voltage; keep recorded taps.
    emit(null, { hv: [], lv: [] });
    log(`Test stopped: ${error instanceof Error ? error.message : error}`);
    throw error;
  }
}

interface Source {
  demo: boolean;
  start: () => Promise<void>;
  read: (tapIndex: number) => Promise<{ hv: number[]; lv: number[] }>;
  /** Tap the PLC is on (PLC tap mode) */
  tap: (tapIndex: number) => Promise<number>;
  complete: () => Promise<boolean>;
}

function plcSource(nPh: number): Source {
  return {
    demo: false,
    start: () => run.pulse(TTR_TAGS.START),
    read: async () => {
      const [h1, h2, h3, l1, l2, l3] = await run.read(TTR_TAGS, ['HV_RY', 'HV_YB', 'HV_BR', 'LV_RY', 'LV_YB', 'LV_BR']);
      return { hv: [h1, h2, h3].slice(0, nPh), lv: [l1, l2, l3].slice(0, nPh) };
    },
    tap: async () => (await run.read(TTR_TAGS, ['TAP']))[0],
    complete: async () => Boolean((await run.read(TTR_TAGS, ['COMPLETE']))[0]),
  };
}

/** Demo: HV held at the test voltage, LV = HV ÷ (rated ratio × a small per-phase error). */
function demoSource(plan: TtrPlan, nPh: number, supplyV: number): Source {
  let startedAt = 0;
  const err = plan.map(() => Array.from({ length: nPh }, () => 1 + jitter(0.0012)));
  let demoTap = 0;
  let askedAt = 0;
  return {
    demo: true,
    start: async () => {
      startedAt = Date.now();
    },
    read: async (ti) => {
      const ramp = 1 - Math.exp(-(Date.now() - startedAt) / 900); // variac coming up
      const hv = Array.from({ length: nPh }, (_, i) => supplyV * ramp * (1 + [0, 0.0015, -0.001][i]) * (1 + jitter(0.00005)));
      const lv = hv.map((v, i) => v / (plan[ti].rated * err[ti][i]));
      return { hv, lv };
    },
    tap: async (ti) => {
      // the "PLC" reaches the next tap about 1.5 s after it is due
      if (demoTap !== plan[ti].tap) {
        if (!askedAt) askedAt = Date.now();
        if (Date.now() - askedAt > 1500) {
          demoTap = plan[ti].tap;
          askedAt = 0;
        }
      }
      return demoTap;
    },
    complete: async () => false,
  };
}
