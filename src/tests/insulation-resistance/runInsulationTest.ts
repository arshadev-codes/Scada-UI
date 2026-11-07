/**
 * Insulation Resistance test (megger).
 *
 *   1. Pulse START — the PLC connects the megger to HV–LV and applies DC
 *   2. Readings are taken at 15 s, 60 s and 600 s; DAI and PI follow
 *   3. The PLC discharges the winding and moves on to HV–E, then LV–E
 *   4. Finished when the PLC sets COMPLETE
 *
 * While IR_TAGS has empty addresses, DEMO data is played instead, through the
 * same callbacks. The demo runs the 10 minutes about 40× faster.
 */
import type { TestObject } from '@/store/types';
import { createRunControl, jitter, READ_EVERY_MS, tagsReady } from '@/tests/shared/runtime';
import { ratedVoltages } from '@/tests/shared/transformer';
import { IR_TAGS } from './tags';
import { IR_PAIRS, IR_POINTS, calculateInsulation, formatMohm, irTestVoltage, pairResult, type IrPairResult, type IrResult } from './calculation';

export interface IrPoints {
  r15: number | null;
  r60: number | null;
  r600: number | null;
}

export interface IrReading {
  /** Pair under test (index into IR_PAIRS), null when idle */
  pairIndex: number | null;
  /** Test seconds since voltage applied */
  elapsed: number;
  /** Live output voltage / target, V */
  voltage: number;
  testV: number;
  /** Live resistance, MΩ */
  r: number;
  /** Captured readings per pair */
  points: IrPoints[];
  /** Demo runs faster than real time; 1 for the real megger */
  speed: number;
  /** Discharging the winding after a pair */
  discharging: boolean;
}

export interface IrCallbacks {
  log?: (msg: string) => void;
  onReading?: (r: IrReading) => void;
}

const run = createRunControl();
export const stopInsulationTest = () => run.stop();
export const irUsesPlc = () => tagsReady(IR_TAGS);

/** Test voltage per pair: HV–LV and HV–E at the HV voltage, LV–E at the LV voltage. */
export function irPlan(o: TestObject): Array<{ pair: (typeof IR_PAIRS)[number]; testV: number }> {
  const v = ratedVoltages(o);
  const hv = irTestVoltage(v.hv || 11000);
  const lv = irTestVoltage(v.lv || 440);
  return IR_PAIRS.map((pair) => ({ pair, testV: pair === 'LV–E' ? lv : hv }));
}

const emptyPoints = (): IrPoints => ({ r15: null, r60: null, r600: null });

export async function runInsulationTest(o: TestObject, cb: IrCallbacks = {}): Promise<IrResult> {
  const log = cb.log ?? console.log;
  run.reset();
  const plan = irPlan(o);
  const points = plan.map(emptyPoints);
  try {
    if (irUsesPlc()) await fromPlc(plan, points, cb, log);
    else await demo(plan, points, cb, log);
    const pairs: IrPairResult[] = plan.map((p, i) => pairResult(p.pair, p.testV, { r15: points[i].r15 ?? 0, r60: points[i].r60 ?? 0, r600: points[i].r600 ?? 0 }));
    pairs.forEach((p) => log(`${p.pair} · DAI ${p.dai.toFixed(2)} · PI ${p.pi.toFixed(2)} · ${p.pass ? 'OK' : 'LOW'}`));
    return calculateInsulation(pairs);
  } catch (error) {
    // Stopped: drop the live state (otherwise the last energised frame stays on
    // screen and the leads keep animating); keep what was already captured.
    cb.onReading?.({ pairIndex: null, elapsed: 0, voltage: 0, testV: 0, r: 0, points: points.map((p) => ({ ...p })), speed: 1, discharging: false });
    log(`Test stopped: ${error instanceof Error ? error.message : error}`);
    throw error;
  }
}

const KEY = { 15: 'r15', 60: 'r60', 600: 'r600' } as const;

function capture(p: IrPoints, elapsed: number, r: number, label: string, log: (m: string) => void) {
  for (const s of IR_POINTS) {
    const k = KEY[s];
    if (p[k] === null && elapsed >= s) {
      p[k] = r;
      const f = formatMohm(r);
      log(`${label} · ${s} s = ${f.value} ${f.unit}`);
    }
  }
}

async function fromPlc(plan: ReturnType<typeof irPlan>, points: IrPoints[], cb: IrCallbacks, log: (m: string) => void) {
  log('START sent to PLC');
  await run.pulse(IR_TAGS.START);
  for (;;) {
    run.check();
    const [pair, elapsed, r, v, complete] = await run.read(IR_TAGS, ['PAIR', 'ELAPSED', 'RESISTANCE', 'VOLTAGE', 'COMPLETE']);
    const i = pair >= 1 && pair <= 3 ? pair - 1 : null;
    if (i !== null && r > 0) capture(points[i], elapsed, r, plan[i].pair, log);
    cb.onReading?.({
      pairIndex: i,
      elapsed,
      voltage: v,
      testV: i !== null ? plan[i].testV : 0,
      r,
      points: points.map((p) => ({ ...p })),
      speed: 1,
      discharging: false,
    });
    if (complete) break;
    await run.sleep(READ_EVERY_MS);
  }
  log('PLC reports IR complete');
}

/** Demo: R(t) = R∞ · (1 − 0.75 · e^(−t/150 s)) → DAI ≈ 1.5, PI ≈ 2 for good insulation. */
async function demo(plan: ReturnType<typeof irPlan>, points: IrPoints[], cb: IrCallbacks, log: (m: string) => void) {
  const SPEED = 40;
  const STEP_MS = 100;
  const rInf = [15000, 11000, 6500].map((r) => r * (1 + jitter(0.2))); // MΩ
  const snap = (extra: Partial<IrReading> & Pick<IrReading, 'pairIndex' | 'elapsed' | 'voltage' | 'testV' | 'r'>): IrReading => ({
    points: points.map((p) => ({ ...p })),
    speed: SPEED,
    discharging: false,
    ...extra,
  });

  log(`DEMO · 10 min per pair shown ${SPEED}× faster`);
  for (let i = 0; i < plan.length; i++) {
    const { pair, testV } = plan[i];
    log(`${pair} · applying ${testV} V DC`);
    for (let t = 0; t <= 600; t += (STEP_MS / 1000) * SPEED) {
      run.check();
      const voltage = testV * (1 - Math.exp(-t / 2.5));
      const r = rInf[i] * (1 - 0.75 * Math.exp(-t / 150)) * (1 + jitter(0.004));
      capture(points[i], t, r, pair, log);
      cb.onReading?.(snap({ pairIndex: i, elapsed: t, voltage, testV, r }));
      await run.sleep(STEP_MS);
    }
    capture(points[i], 600, rInf[i] * (1 - 0.75 * Math.exp(-4)), pair, log);
    log(`${pair} · discharging winding`);
    for (let k = 10; k >= 0; k--) {
      run.check();
      cb.onReading?.(snap({ pairIndex: i, elapsed: 600, voltage: (testV * k) / 10, testV, r: 0, discharging: true }));
      await run.sleep(80);
    }
  }
  cb.onReading?.(snap({ pairIndex: null, elapsed: 0, voltage: 0, testV: 0, r: 0 }));
}
