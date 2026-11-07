/**
 * Test selection bits: tell the PLC which test the next START (M610) is for.
 * The addresses live in each test's tags.ts; this only maps test → bit.
 */
import { plc } from '@/services/plc';
import { mbtAddr } from '@/tests/magnetic-balance/tags';
import { nllAddr } from '@/tests/no-load-loss/tags';

const SELECT_BITS: Record<string, () => number> = {
  'no-load': () => nllAddr('SELECT'),
  'magnetic-balance': () => mbtAddr('SELECT'),
};

/**
 * Turn the selection bit ON for each test in `on`, OFF for all the others.
 * Returns the tests whose bit the PLC still holds differently afterwards
 * (e.g. the ladder latches it), so the caller can report it.
 */
export async function applySelectionBits(on: string[]): Promise<string[]> {
  const entries = Object.entries(SELECT_BITS);
  for (const [id, address] of entries) await plc.writeCoil(address(), on.includes(id));
  const back = await plc.readValues(entries.map(([, address]) => ({ kind: 'coil' as const, address: address() })));
  return entries.filter(([id], i) => back[i] !== null && Boolean(back[i]) !== on.includes(id)).map(([id]) => id);
}
