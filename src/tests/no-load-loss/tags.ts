/**
 * PLC tags used by the No-Load Loss test.
 *
 * `device` is the address as written in ISPSoft (D310, M600, ...).
 * The code only uses the tag names, so to change an address edit it here.
 *
 * The boss's Modbus list counts from 1, so:  device = Modbus - 1 - base
 *   M base = 2048   e.g. 2649 → 2649 - 1 - 2048 = M600
 *   D base = 4096   e.g. 4407 → 4407 - 1 - 4096 = D310
 *
 * kind:
 *   coil     = ON/OFF bit (Y outputs, M bits)
 *   input    = ON/OFF bit we only read (X inputs)
 *   register = whole number, 16 bit (D register)
 *   float32  = decimal number, uses TWO D registers (D310 + D311)
 */
import { deltaToModbus } from '@/config/tags';
import type { ReadKind } from '@/services/plc/PlcService';

interface NllTag {
  device: string;
  kind: ReadKind;
  description: string;
}

export const NLL_TAGS = {
  // ── We write ───────────────────────────────────────────────────────────
  SELECT: { device: 'M600', kind: 'coil', description: 'NLL TEST SELECTION — ON while the No-Load Loss screen is open' },
  // One START bit for every test; the selection bit tells the PLC which test.
  START: { device: 'M610', kind: 'coil', description: 'TEST START (pulse), same for all tests' },
  COMPLETE: { device: 'M602', kind: 'coil', description: 'NLL TEST COMPLETE — set HIGH when the test finishes' },
  STOP: { device: 'M611', kind: 'coil', description: 'TEST STOP (pulse), same as Magnetic Balance — sent when M140 goes HIGH' },

  // ── We read: the PLC sets this ─────────────────────────────────────────
  REACHED: { device: 'M140', kind: 'coil', description: 'SET VOLTAGE REACHED — PLC turns it ON; we then pulse STOP' },
  DIMMER_SET: { device: 'D426', kind: 'float32', description: 'Dimmer set voltage, V (Modbus 4523)' },

  // ── We read ────────────────────────────────────────────────────────────
  V1: { device: 'D310', kind: 'float32', description: 'Voltage phase 1, V — gauge (Modbus 4298)' },
  V2: { device: 'D312', kind: 'float32', description: 'Voltage phase 2, V — gauge (Modbus 4300)' },
  V3: { device: 'D314', kind: 'float32', description: 'Voltage phase 3, V — gauge (Modbus 4302)' },
  I1: { device: 'D316', kind: 'float32', description: 'Current phase 1, A' },
  I2: { device: 'D318', kind: 'float32', description: 'Current phase 2, A' },
  I3: { device: 'D320', kind: 'float32', description: 'Current phase 3, A' },

  // Contactors switched by the PLC (from the ladder: C1_ON_CMD, C7_ON_CMD)
  C1: { device: 'M20', kind: 'coil', description: 'Supply contactor C1 — PLC sets it' },
  C7: { device: 'M26', kind: 'coil', description: 'LV contactor C7 — PLC sets it' },

  // ── NOT GIVEN YET — placeholders, not used by the test logic ───────────
  DIMMER_VOLTAGE: { device: 'D201', kind: 'float32', description: 'Dimmer output voltage — same as V1, not used' },
  P1: { device: 'D230', kind: 'float32', description: 'Power phase 1, W (placeholder)' },
  P2: { device: 'D232', kind: 'float32', description: 'Power phase 2, W (placeholder)' },
  P3: { device: 'D234', kind: 'float32', description: 'Power phase 3, W (placeholder)' },
  FREQUENCY: { device: 'D240', kind: 'float32', description: 'Frequency, Hz (placeholder)' },
} as const satisfies Record<string, NllTag>;

export type NllTagName = keyof typeof NLL_TAGS;

/** False until the NLL START address is filled in above. */
export const nllStartSet = (NLL_TAGS.START.device as string) !== '';

/** Modbus address of a tag, e.g. nllAddr('V1') → 4406. */
export function nllAddr(name: NllTagName): number {
  return deltaToModbus(NLL_TAGS[name].device);
}
