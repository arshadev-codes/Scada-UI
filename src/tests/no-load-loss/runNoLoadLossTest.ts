/**
 * No-Load Loss test — the PLC runs the test, we only start it and watch.
 *
 *   1. Write the dimmer set voltage (D426)
 *   2. Pulse START — the ladder closes C1/C7 and raises the dimmer
 *      (TEST SELECTION M600 is already ON: the page sets it while it is open)
 *   3. Read V1/V2/V3 and I1/I2/I3 every 0.5 s and show them
 *   4. Finished when the voltage went up to the set value and came back to 0
 *
 * The PLC stops the test itself. Our STOP only stops watching.
 */
import { plc } from '@/services/plc';
import { NLL_TAGS, nllAddr, nllStartSet, type NllTagName } from './tags';
import { calculateNoLoadLoss, type NoLoadResult, type Sample } from './calculation';

const READ_EVERY_MS = 500;
const START_PULSE_MS = 300;
const AFTER_STOP_MS = 20_000; // after M140 → STOP, finish when the voltage is gone or after this long
const REACHED = 0.98; // voltage counts as "reached" at 98 % of set
const ZERO_V = 5; // below this the dimmer is "off"

export type NllStage = 'CLOSING' | 'RAMPING' | 'SETTLING' | 'MEASURING' | 'SWITCHING_OFF' | 'DONE' | 'ABORTED';

export interface NllSettings {
  setVoltage: number; // dimmer voltage we want (V)
  guaranteedW: number; // guaranteed no-load loss from the test object (W)
  phases: 1 | 3;
  maxCurrentA: number; // not used yet — no current addresses
}

/** One reading from the PLC. */
export interface NllReading {
  dimmerV: number; // shown on the gauge = average of V1, V2, V3
  v: number[]; // per phase
  i: number[]; // per phase
  p: number[]; // empty until power addresses are given
  frequency: number;
  sample: Sample;
}

export interface NllCallbacks {
  log?: (msg: string) => void;
  onStage?: (stage: NllStage) => void;
  onReading?: (r: NllReading) => void;
  onSetpoint?: (volts: number) => void;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let stopRequested = false;

/** Call this from the STOP button. Only stops watching — the PLC keeps its own logic. */
export function stopNoLoadLossTest() {
  stopRequested = true;
}

/**
 * A PLC read/write error never ends the test: keep trying every 0.5 s until it
 * works. Only the operator's STOP ends it early.
 */
async function keepTrying<T>(fn: () => Promise<T>): Promise<T> {
  for (;;) {
    try {
      return await fn();
    } catch {
      if (stopRequested) throw new Error('Stopped by operator');
      await wait(READ_EVERY_MS);
    }
  }
}

/** Read several tags in one call. */
async function readTags(names: NllTagName[]): Promise<number[]> {
  const values = await keepTrying(() => plc.readValues(names.map((n) => ({ kind: NLL_TAGS[n].kind, address: nllAddr(n) }))));
  return values.map((x) => x ?? 0);
}

/**
 * Write the dimmer set voltage (float32 → D426 low half, D427 high half) and
 * read it back, so the caller can show what the PLC really holds.
 */
export async function writeSetVoltage(volts: number): Promise<number | null> {
  await writeFloat('DIMMER_SET', volts);
  const [back] = await plc.readValues([{ kind: 'float32', address: nllAddr('DIMMER_SET') }]);
  return back;
}

/**
 * Write a decimal number into two D registers (Delta float32).
 * Low half goes in D(n), high half in D(n+1).
 */
async function writeFloat(name: NllTagName, value: number) {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value);
  const high = view.getUint16(0);
  const low = view.getUint16(2);
  await plc.writeRegister(nllAddr(name), low);
  await plc.writeRegister(nllAddr(name) + 1, high);
}

/** Read V1/V2/V3 and I1/I2/I3. */
async function readVoltages(phases: 1 | 3): Promise<NllReading> {
  const [v1, v2, v3, i1, i2, i3] = await readTags(['V1', 'V2', 'V3', 'I1', 'I2', 'I3']);
  const v = phases === 3 ? [v1, v2, v3] : [v1];
  const i = phases === 3 ? [i1, i2, i3] : [i1];
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const avg = mean(v);
  return {
    dimmerV: avg,
    v,
    i,
    p: [],
    frequency: 0,
    sample: { voltage: avg, current: mean(i), power: NaN },
  };
}

/** Result + average voltage of each phase while held at set. */
export type NllOutcome = NoLoadResult & { phaseV: number[] };

export async function runNoLoadLossTest(settings: NllSettings, cb: NllCallbacks = {}): Promise<NllOutcome> {
  const log = cb.log ?? console.log;
  const stage = (s: NllStage) => cb.onStage?.(s);
  stopRequested = false;

  try {
    if (!nllStartSet) throw new Error('NLL START address is not set in src/tests/no-load-loss/tags.ts');
    await keepTrying(() => plc.writeCoil(nllAddr('COMPLETE'), false)); // clear last test's "complete"
    await keepTrying(() => plc.writeCoil(nllAddr('SELECT'), true)); // selection ON again (a finished test turns it off)

    // 1. Set voltage
    const back = await keepTrying(() => writeSetVoltage(settings.setVoltage));
    log(`Set voltage ${settings.setVoltage} V written to D426/D427 · PLC reads back ${back === null ? '?' : back.toFixed(1)} V`);
    cb.onSetpoint?.(settings.setVoltage);

    // 2. Pulse START (OFF → ON → OFF so the ladder sees a rising edge)
    log('Start sent to PLC');
    await keepTrying(async () => {
      await plc.writeCoil(nllAddr('START'), false);
      await plc.writeCoil(nllAddr('START'), true);
      await wait(START_PULSE_MS);
      await plc.writeCoil(nllAddr('START'), false);
    });

    // 3. Watch: voltage goes up to the set value, PLC holds it, then brings it back to 0
    stage('RAMPING');
    let sawReached = false;
    let stopSent = false;
    let stopAt = 0;
    const samples: Sample[] = [];
    const phaseSamples: number[][] = [];

    while (true) {
      if (stopRequested) throw new Error('Stopped by operator');

      const reading = await readVoltages(settings.phases);
      cb.onReading?.(reading);
      const v = reading.dimmerV;

      // PLC says the set voltage is reached (M140 HIGH) → pulse STOP (M611), like Magnetic Balance.
      const [reachedBit] = await keepTrying(() => plc.readValues([{ kind: 'coil', address: nllAddr('REACHED') }]));
      if (reachedBit && !stopSent) {
        stopSent = true;
        stopAt = Date.now();
        sawReached = true;
        await keepTrying(async () => {
          await plc.writeCoil(nllAddr('STOP'), true);
          await wait(START_PULSE_MS);
          await plc.writeCoil(nllAddr('STOP'), false);
        });
        log(`${NLL_TAGS.REACHED.device} HIGH (set voltage reached at ${v.toFixed(1)} V) · ${NLL_TAGS.STOP.device} pulsed`);
      }

      if (v >= settings.setVoltage * REACHED) {
        sawReached = true;
        stage('SETTLING');
        samples.push(reading.sample);
        phaseSamples.push(reading.v);
      }

      if (sawReached && v < ZERO_V) break; // PLC finished
      if (stopSent && Date.now() - stopAt > AFTER_STOP_MS) {
        log(`Voltage still ${v.toFixed(1)} V ${AFTER_STOP_MS / 1000} s after STOP · finishing the test`);
        break;
      }

      await wait(READ_EVERY_MS);
    }

    log('PLC finished the test');
    await keepTrying(() => plc.writeCoil(nllAddr('COMPLETE'), true)); // tells the bench the test is complete
    log(`Test complete · ${NLL_TAGS.COMPLETE.device} set HIGH`);
    stage('DONE');
    // No power addresses yet, so P0 is unknown (NaN).
    const phaseV = (phaseSamples[0] ?? []).map((_, i) => phaseSamples.reduce((s, v) => s + v[i], 0) / phaseSamples.length);
    const result = calculateNoLoadLoss(samples.length ? samples : [{ voltage: 0, current: NaN, power: NaN }], settings.guaranteedW);
    return { ...result, phaseV };
  } catch (error) {
    log(`Test stopped: ${error instanceof Error ? error.message : error}`);
    stage('ABORTED');
    throw error;
  }
}
