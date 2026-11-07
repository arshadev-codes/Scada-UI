/**
 * Small helpers shared by the instrument tests (Winding Resistance, Voltage
 * Ratio, Insulation Resistance).
 *
 * Each of those tests reads its values from PLC D registers listed in its own
 * tags.ts. While any address there is still empty, the runner plays DEMO data
 * instead, through exactly the same callbacks and screen as real data.
 */
import { plc } from '@/services/plc';
import { deltaToModbus } from '@/config/tags';
import type { ReadKind } from '@/services/plc/PlcService';

export interface InstrumentTag {
  device: string;
  kind: ReadKind;
  description: string;
}

export const READ_EVERY_MS = 500;
const PULSE_MS = 300;

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when every tag has an address, i.e. the test can read the real PLC. */
export function tagsReady(tags: Record<string, InstrumentTag>): boolean {
  return Object.values(tags).every((t) => t.device.trim() !== '');
}

/** One stop flag per test, plus PLC calls that retry until they work or STOP is pressed. */
export function createRunControl() {
  let stopped = false;

  async function keepTrying<T>(fn: () => Promise<T>): Promise<T> {
    for (;;) {
      if (stopped) throw new Error('Stopped by operator');
      try {
        return await fn();
      } catch {
        await wait(READ_EVERY_MS);
      }
    }
  }

  return {
    reset: () => {
      stopped = false;
    },
    stop: () => {
      stopped = true;
    },
    get stopped() {
      return stopped;
    },
    /** Throws once STOP was pressed, so the runner unwinds. */
    check: () => {
      if (stopped) throw new Error('Stopped by operator');
    },
    /** Like wait(), but ends early (with an error) when STOP is pressed. */
    sleep: async (ms: number) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (stopped) throw new Error('Stopped by operator');
        await wait(Math.min(100, end - Date.now()));
      }
    },
    keepTrying,
    /** Read tags in one call; missing values come back as 0. */
    read: async <K extends string>(tags: Record<K, InstrumentTag>, names: K[]) => {
      const values = await keepTrying(() =>
        plc.readValues(names.map((n) => ({ kind: tags[n].kind, address: deltaToModbus(tags[n].device) }))),
      );
      return values.map((v) => v ?? 0);
    },
    /** OFF → ON → OFF, so the ladder sees a rising edge. */
    pulse: (tag: InstrumentTag) =>
      keepTrying(async () => {
        const address = deltaToModbus(tag.device);
        await plc.writeCoil(address, false);
        await plc.writeCoil(address, true);
        await wait(PULSE_MS);
        await plc.writeCoil(address, false);
      }),
  };
}

/** Small random spread for demo readings: ±spread (fraction), roughly normal. */
export function jitter(spread: number): number {
  return ((Math.random() + Math.random() + Math.random()) / 1.5 - 1) * spread;
}
