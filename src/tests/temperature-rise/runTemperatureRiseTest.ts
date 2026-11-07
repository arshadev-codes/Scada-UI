/**
 * Temperature Rise (heat run) test, short-circuit method, IEC 60076-2.
 *
 *   1. LV shorted, the variac drives the HV current that injects the TOTAL
 *      losses (no-load + load loss) until the top oil stops rising (< 1 K/h)
 *   2. Current dropped to rated for 1 hour so the winding-to-oil gradient settles
 *   3. Temperatures are logged every N minutes (operator's choice):
 *      ambient, top oil, bottom oil, HV and LV winding
 *   4. PASS when top-oil rise ≤ 60 K and average winding rise ≤ 65 K
 *
 * While TRT_TAGS has empty addresses, DEMO data is played instead with the
 * clock compressed (one test minute every 0.2 s).
 */
import type { TestObject } from '@/store/types';
import { createRunControl, jitter, READ_EVERY_MS, tagsReady } from '@/tests/shared/runtime';
import { demoCurrents } from '@/tests/shared/transformer';
import { toNumber } from '@/lib/electrical';
import { TRT_TAGS } from './tags';

export type TrtPhase = 'connect' | 'total' | 'rated' | 'done';

export interface TrtTemps {
  ambient: number;
  topOil: number;
  bottomOil: number;
  hvWdg: number;
  lvWdg: number;
}

export interface TrtRow extends TrtTemps {
  id: number;
  min: number;
  currentA: number;
  lossKw: number;
  phase: TrtPhase;
}

export interface TrtReading extends TrtTemps {
  phase: TrtPhase;
  min: number;
  currentA: number;
  ratedA: number;
  lossKw: number;
  /** Top-oil rise rate over the last hour, K/h */
  oilRate: number;
  rows: TrtRow[];
}

export interface TrtResult {
  ambient: number;
  topOilRise: number;
  hvRise: number;
  lvRise: number;
  pass: boolean;
  durationMin: number;
  intervalMin: number;
  rows: TrtRow[];
}

export interface TrtCallbacks {
  log?: (msg: string) => void;
  onReading?: (r: TrtReading) => void;
}

export const TRT_LIMITS = { topOil: 60, winding: 65 };
export const TRT_STABLE_K_PER_H = 1;
export const TRT_INTERVALS = [2, 5, 10, 15, 30] as const;
export type TrtInterval = (typeof TRT_INTERVALS)[number];
/** Demo: real milliseconds per test minute. */
export const TRT_DEMO_MS_PER_MIN = 200;

const run = createRunControl();
export const stopTemperatureRiseTest = () => run.stop();
export const trtUsesPlc = () => tagsReady(TRT_TAGS);

export function trtPlan(o: TestObject) {
  const kva = toNumber(o.ratedPowerKva) ?? 100;
  const p0 = toNumber(o.guaranteedNoLoadLossW) ?? kva * 2.6;
  const pk = toNumber(o.guaranteedLoadLossW) ?? kva * 12;
  const ratedA = demoCurrents(o).hv;
  return {
    ratedA,
    totalA: ratedA * Math.sqrt((p0 + pk) / pk),
    totalKw: (p0 + pk) / 1000,
    ratedKw: pk / 1000,
    ambient: toNumber(o.ambientTempC) ?? 30,
  };
}

export async function runTemperatureRiseTest(o: TestObject, intervalMin: number, cb: TrtCallbacks = {}): Promise<TrtResult> {
  const log = cb.log ?? console.log;
  const plan = trtPlan(o);
  const rows: TrtRow[] = [];
  run.reset();
  const cold: TrtTemps = { ambient: plan.ambient, topOil: plan.ambient, bottomOil: plan.ambient, hvWdg: plan.ambient, lvWdg: plan.ambient };
  try {
    cb.onReading?.({ ...cold, phase: 'connect', min: 0, currentA: 0, ratedA: plan.ratedA, lossKw: 0, oilRate: 0, rows: [] });
    log('LV shorted · thermocouples on top oil, bottom oil, ambient · WTI on HV / LV');
    await run.sleep(2400);
    const r = trtUsesPlc() ? await fromPlc(plan, intervalMin, rows, cb, log) : await demo(plan, intervalMin, rows, cb, log);
    const last = rows[rows.length - 1] ?? { ...cold };
    cb.onReading?.({ ...last, phase: 'done', min: r.durationMin, currentA: 0, ratedA: plan.ratedA, lossKw: 0, oilRate: 0, rows: [...rows] });
    return r;
  } catch (error) {
    const last = rows[rows.length - 1] ?? cold;
    cb.onReading?.({ ...last, phase: 'done', min: 0, currentA: 0, ratedA: plan.ratedA, lossKw: 0, oilRate: 0, rows: [...rows] });
    log(`Test stopped: ${error instanceof Error ? error.message : error}`);
    throw error;
  }
}

type Plan = ReturnType<typeof trtPlan>;

function verdict(rows: TrtRow[], totalEnd: TrtRow | undefined, intervalMin: number): TrtResult {
  const end = rows[rows.length - 1];
  const amb = end?.ambient ?? 0;
  // oil rise from the end of total losses; winding rise = oil + gradient at rated current
  const oilRef = totalEnd ?? end;
  const topOilRise = (oilRef?.topOil ?? amb) - (oilRef?.ambient ?? amb);
  const avgOilRise = ((oilRef?.topOil ?? amb) + (oilRef?.bottomOil ?? amb)) / 2 - (oilRef?.ambient ?? amb);
  const endAvgOil = end ? (end.topOil + end.bottomOil) / 2 : amb;
  const hvRise = avgOilRise + ((end?.hvWdg ?? amb) - endAvgOil);
  const lvRise = avgOilRise + ((end?.lvWdg ?? amb) - endAvgOil);
  return {
    ambient: amb,
    topOilRise,
    hvRise,
    lvRise,
    pass: topOilRise <= TRT_LIMITS.topOil && hvRise <= TRT_LIMITS.winding && lvRise <= TRT_LIMITS.winding,
    durationMin: end?.min ?? 0,
    intervalMin,
    rows,
  };
}

async function fromPlc(plan: Plan, intervalMin: number, rows: TrtRow[], cb: TrtCallbacks, log: (m: string) => void): Promise<TrtResult> {
  log('START sent to PLC');
  await run.pulse(TRT_TAGS.START);
  let id = 0;
  let next = 0;
  let totalEnd: TrtRow | undefined;
  const history: Array<[number, number]> = [];
  for (;;) {
    run.check();
    const [min, ambient, topOil, bottomOil, hvWdg, lvWdg, currentA, lossKw, ratedPhase, complete] = await run.read(TRT_TAGS, [
      'ELAPSED_MIN',
      'AMBIENT',
      'TOP_OIL',
      'BOTTOM_OIL',
      'HV_WDG',
      'LV_WDG',
      'CURRENT',
      'LOSS_KW',
      'RATED_PHASE',
      'COMPLETE',
    ]);
    const phase: TrtPhase = ratedPhase ? 'rated' : 'total';
    history.push([min, topOil - ambient]);
    while (history.length > 2 && history[0][0] < min - 60) history.shift();
    const oilRate = history.length > 1 ? ((history[history.length - 1][1] - history[0][1]) / Math.max(1, min - history[0][0])) * 60 : 0;
    const temps = { ambient, topOil, bottomOil, hvWdg, lvWdg };
    if (min >= next || complete) {
      rows.push({ id: id++, min, currentA, lossKw, phase, ...temps });
      next = (Math.floor(min / intervalMin) + 1) * intervalMin;
    }
    if (phase === 'rated' && !totalEnd) {
      totalEnd = rows[rows.length - 1];
      log('Oil stabilised · rated current for 1 h');
    }
    cb.onReading?.({ ...temps, phase, min, currentA, ratedA: plan.ratedA, lossKw, oilRate, rows: [...rows] });
    if (complete) break;
    await run.sleep(READ_EVERY_MS * 4);
  }
  log('PLC reports heat run complete');
  return verdict(rows, totalEnd, intervalMin);
}

/**
 * Demo thermal model: top-oil rise follows 1 − e^(−t/τ) (τ = 150 min) toward
 * ~52 K, bottom oil ~55 % of that, windings sit a gradient above the average
 * oil (HV 17 K, LV 15 K at rated current, ∝ I^1.6) with τ = 8 min.
 */
async function demo(plan: Plan, intervalMin: number, rows: TrtRow[], cb: TrtCallbacks, log: (m: string) => void): Promise<TrtResult> {
  const TAU_OIL = 150;
  const TAU_WDG = 8;
  const OIL_FINAL = 52 * (1 + jitter(0.03));
  const G = { hv: 17 * (1 + jitter(0.04)), lv: 15 * (1 + jitter(0.04)) };
  const DT = 0.5; // test minutes per step
  let id = 0;
  let min = 0;
  let oil = 0; // top-oil rise, K
  let gHv = 0;
  let gLv = 0;
  let next = 0;
  let totalEnd: TrtRow | undefined;
  const history: Array<[number, number]> = [];
  let phase: TrtPhase = 'total';
  let ratedStart = 0;

  log(`DEMO · injecting total losses ${plan.totalKw.toFixed(2)} kW · ${plan.totalA.toFixed(2)} A on HV (time ×${Math.round(60000 / TRT_DEMO_MS_PER_MIN)})`);
  for (;;) {
    run.check();
    const amb = plan.ambient + 0.8 * Math.sin(min / 90) + jitter(0.01);
    const currentA = phase === 'total' ? plan.totalA : plan.ratedA;
    const lossKw = phase === 'total' ? plan.totalKw : plan.ratedKw;
    const oilTarget = phase === 'total' ? OIL_FINAL : OIL_FINAL * Math.pow(plan.ratedKw / plan.totalKw, 0.8);
    const k = Math.pow(currentA / plan.ratedA, 1.6);
    oil += (oilTarget - oil) * (DT / TAU_OIL);
    gHv += (G.hv * k - gHv) * (DT / TAU_WDG);
    gLv += (G.lv * k - gLv) * (DT / TAU_WDG);
    const bottom = oil * 0.55;
    const avgOil = (oil + bottom) / 2;
    const temps: TrtTemps = {
      ambient: amb,
      topOil: amb + oil + jitter(0.05),
      bottomOil: amb + bottom + jitter(0.05),
      hvWdg: amb + avgOil + gHv + jitter(0.06),
      lvWdg: amb + avgOil + gLv + jitter(0.06),
    };
    history.push([min, oil]);
    while (history.length > 2 && history[0][0] < min - 60) history.shift();
    const oilRate = ((history[history.length - 1][1] - history[0][1]) / Math.max(1, min - history[0][0])) * 60;

    if (min >= next) {
      rows.push({ id: id++, min, currentA, lossKw, phase, ...temps });
      next += intervalMin;
    }
    cb.onReading?.({ ...temps, phase, min, currentA, ratedA: plan.ratedA, lossKw, oilRate, rows: [...rows] });

    if (phase === 'total' && min >= 180 && oilRate < TRT_STABLE_K_PER_H) {
      if (rows[rows.length - 1]?.min !== min) rows.push({ id: id++, min, currentA, lossKw, phase, ...temps });
      totalEnd = rows[rows.length - 1];
      next = min + intervalMin;
      log(`${(min / 60).toFixed(1)} h · top oil rising ${oilRate.toFixed(2)} K/h (< ${TRT_STABLE_K_PER_H}) · stable at +${oil.toFixed(1)} K`);
      log(`Current reduced to rated ${plan.ratedA.toFixed(2)} A for 1 h`);
      phase = 'rated';
      ratedStart = min;
    } else if (phase === 'rated' && min - ratedStart >= 60) {
      if (rows[rows.length - 1]?.min !== min) rows.push({ id: id++, min, currentA, lossKw, phase, ...temps });
      log('Rated-current hour complete · supply off');
      break;
    }
    min += DT;
    await run.sleep(TRT_DEMO_MS_PER_MIN * DT);
  }
  return verdict(rows, totalEnd, intervalMin);
}
