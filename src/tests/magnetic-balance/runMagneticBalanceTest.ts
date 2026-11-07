/**
 * Magnetic Balance test — the PLC runs it, we start it and watch.
 *
 *   1. Make sure MB TEST SELECTION is ON (the page already sets it) and pulse START (M610)
 *   2. The PLC does 3 rounds, each one energising one pair (RY, YB or BR)
 *   3. Every 0.5 s we read the live meter, plus the contactor feedback that
 *      says which pair (RY / YB / BR) the supply is switched across. Without
 *      that feedback the pair with the highest voltage is taken instead.
 *      A round is over when the supply is switched off again
 *   4. Then we read what the PLC stored for that round (D408…D424)
 *   5. The test is complete ONLY when the PLC pulses MB TEST COMPLETE (M612). The
 *      pulse is short, so the bridge counts it for us (read kind 'edges').
 *      There are no timeouts: until M612 (or the operator's STOP) we keep watching.
 *
 * STOP pulses TEST STOP (M611), so the PLC switches off.
 */
import { plc } from '@/services/plc';
import { MBT_TAGS, PAIR_TAGS, ROUND_TAGS, hasPairFeedback, mbtAddr, type MbtTagName } from './tags';
import { PHASES, calculateMagneticBalance, type MbtResult, type MbtRound, type PhaseIndex } from './calculation';

const READ_EVERY_MS = 500;
const PULSE_MS = 300;
const ZERO_V = 5; // below this the supply is "off"
const PLATEAU = 0.97; // meter samples within 3 % of the peak are averaged (fallback only)

export type MbtStage = 'WAITING' | 'ENERGISED' | 'DONE' | 'ABORTED';

export interface MbtReading {
  /** Pair the supply is across (RY = 0, YB = 1, BR = 2) */
  round: PhaseIndex;
  /** Supply is on right now */
  on: boolean;
  /** Where `round` came from: the PLC's contactor bits, or a guess from the highest voltage */
  source: 'contactor' | 'voltage';
  v: [number, number, number];
}

export interface MbtCallbacks {
  log?: (msg: string) => void;
  onRound?: (round: PhaseIndex) => void;
  onStage?: (stage: MbtStage) => void;
  onReading?: (r: MbtReading) => void;
  onRoundDone?: (round: MbtRound) => void;
}

type V3 = [number, number, number];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const argmax = (v: V3) => (v[0] >= v[1] && v[0] >= v[2] ? 0 : v[1] >= v[2] ? 1 : 2) as PhaseIndex;

let stopRequested = false;

/** Call this from the STOP button: tells the PLC to stop (M611) and stops watching. */
export function stopMagneticBalanceTest() {
  stopRequested = true;
  void pulse('STOP').catch(() => undefined);
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

async function pulse(name: MbtTagName) {
  await plc.writeCoil(mbtAddr(name), false);
  await plc.writeCoil(mbtAddr(name), true);
  await wait(PULSE_MS);
  await plc.writeCoil(mbtAddr(name), false);
}

async function read3(names: readonly [MbtTagName, MbtTagName, MbtTagName]): Promise<V3> {
  const values = await keepTrying(() => plc.readValues(names.map((n) => ({ kind: MBT_TAGS[n].kind, address: mbtAddr(n) }))));
  return values.map((x) => x ?? 0) as V3;
}

/** Meter average while held at the peak — used only if the PLC registers did not change. */
function meterAverage(samples: V3[]): V3 {
  const total = samples.reduce<V3>((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]);
  const e = argmax(total);
  const peak = Math.max(...samples.map((v) => v[e]));
  const held = samples.filter((v) => v[e] >= peak * PLATEAU);
  return [0, 1, 2].map((i) => held.reduce((s, v) => s + v[i], 0) / held.length) as V3;
}

export async function runMagneticBalanceTest(cb: MbtCallbacks = {}): Promise<MbtResult> {
  const log = cb.log ?? console.log;
  const stage = (s: MbtStage) => cb.onStage?.(s);
  stopRequested = false;

  try {
    // What the PLC registers hold before we start, to tell new values from old ones.
    const before = await Promise.all(ROUND_TAGS.map(read3));
    const completeCount = async () =>
      (await keepTrying(() => plc.readValues([{ kind: MBT_TAGS.COMPLETE.kind, address: mbtAddr('COMPLETE') }])))[0] ?? 0;
    const completeBefore = await completeCount();

    // 1. Select MBT and pulse START
    log('MB TEST SELECTION on, start sent to PLC');
    await keepTrying(() => plc.writeCoil(mbtAddr('SELECT'), true));
    await keepTrying(() => pulse('START'));
    stage('WAITING');

    // 2. Watch the meter: each round the voltage goes up, holds, and drops to 0
    const rounds: Array<MbtRound | undefined> = [];
    let roundNo = 0;
    let samples: V3[] = [];
    let lastPair: PhaseIndex = 0;

    /** Round over: take the values the PLC stored for it. */
    const finishRound = async () => {
      const slot = Math.min(roundNo, ROUND_TAGS.length - 1);
      const stored = await read3(ROUND_TAGS[slot]);
      const changed = stored.some((x, i) => x !== before[slot][i]) && stored.some((x) => x > ZERO_V);
      const values = changed ? stored : meterAverage(samples);
      if (!changed) log(`Round ${roundNo + 1}: PLC registers unchanged, using meter average`);

      // The pair the PLC switched (from feedback), else the highest reading
      const round: MbtRound = { energised: hasPairFeedback ? lastPair : argmax(values), v: values };
      rounds[round.energised] = round;
      cb.onRoundDone?.(round);
      const [a, b, c] = values.map((x) => x.toFixed(1));
      log(`Round ${roundNo + 1} done · RY ${a} V · YB ${b} V · BR ${c} V`);

      roundNo++;
      samples = [];
      stage('WAITING');
    };

    while (true) {
      if (stopRequested) throw new Error('Stopped by operator');

      // MB TEST COMPLETE (M612) pulsed by the PLC → the test is done.
      if ((await completeCount()) > completeBefore) {
        if (samples.length) await finishRound();
        log(`${MBT_TAGS.COMPLETE.device} HIGH · Magnetic Balance test completed`);
        // Reset the completion bit so it is LOW for the next test
        await keepTrying(() => plc.writeCoil(mbtAddr('COMPLETE'), false));
        log(`${MBT_TAGS.COMPLETE.device} reset to LOW`);
        break;
      }

      const v = await read3(['V1', 'V2', 'V3']);
      const k = hasPairFeedback ? await read3(PAIR_TAGS) : null;
      const kOn = k ? k.findIndex((x) => x > 0) : -1;
      const top = kOn >= 0 ? (kOn as PhaseIndex) : argmax(v);
      const on = k ? kOn >= 0 : v[top] > ZERO_V;
      cb.onReading?.({ round: top, on, source: k ? 'contactor' : 'voltage', v });

      if (on) {
        if (!samples.length) {
          stage('ENERGISED');
          log(`Round ${roundNo + 1} · ${PHASES[top]} energised`);
        }
        cb.onRound?.(top);
        lastPair = top;
        samples.push(v);
      } else if (samples.length) {
        await finishRound();
      }

      await wait(READ_EVERY_MS);
    }

    stage('DONE');
    return calculateMagneticBalance(rounds.filter((r): r is MbtRound => !!r));
  } catch (error) {
    log(`Test stopped: ${error instanceof Error ? error.message : error}`);
    stage('ABORTED');
    throw error;
  }
}
