/**
 * PLC tags used by the Magnetic Balance test.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  THIS IS THE ONLY FILE YOU EDIT FOR MBT ADDRESSES.                   │
 * │  Change `device` to the address in ISPSoft (M610, D408, ...).        │
 * │  Modbus list counts from 1:  M = Modbus − 1 − 2048                   │
 * │                              D = Modbus − 1 − 4096                   │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * From the manager's MB TEST sheet. The PLC runs 3 rounds itself and stores
 * the three line voltages (RY, YB, BR) of each round in its own registers:
 *
 *            RY      YB      BR
 *   Round 1  D408    D410    D412
 *   Round 2  D414    D416    D418
 *   Round 3  D420    D422    D424
 *
 * Each value is float32 = TWO D registers (D408 + D409), so they go up by 2.
 *
 * kind:
 *   coil     = ON/OFF bit (M bits)
 *   float32  = decimal number, uses TWO D registers
 */
import { deltaToModbus } from '@/config/tags';
import type { ReadKind } from '@/services/plc/PlcService';

interface MbtTag {
  device: string;
  kind: ReadKind;
  description: string;
}

export const MBT_TAGS = {
  // ── We write ───────────────────────────────────────────────────────────
  SELECT: { device: 'M606', kind: 'coil', description: 'MB TEST SELECTION — ON while MBT is the selected test' },
  START: { device: 'M610', kind: 'coil', description: 'MB TEST START (pulse)' },
  STOP: { device: 'M611', kind: 'coil', description: 'TEST STOP (pulse)' },

  // ── We read: PLC pulses this for a moment when the whole test is done ──
  // kind 'edges' = the bridge watches it every 20 ms, so the short pulse is not missed
  COMPLETE: { device: 'M612', kind: 'edges', description: 'MB TEST COMPLETE (short pulse from PLC)' },

  // ── We read: values the PLC stores for each round ──────────────────────
  R1_RY: { device: 'D408', kind: 'float32', description: 'Round 1 · RY voltage, V' },
  R1_YB: { device: 'D410', kind: 'float32', description: 'Round 1 · YB voltage, V' },
  R1_BR: { device: 'D412', kind: 'float32', description: 'Round 1 · BR voltage, V' },
  R2_RY: { device: 'D414', kind: 'float32', description: 'Round 2 · RY voltage, V' },
  R2_YB: { device: 'D416', kind: 'float32', description: 'Round 2 · YB voltage, V' },
  R2_BR: { device: 'D418', kind: 'float32', description: 'Round 2 · BR voltage, V' },
  R3_RY: { device: 'D420', kind: 'float32', description: 'Round 3 · RY voltage, V' },
  R3_YB: { device: 'D422', kind: 'float32', description: 'Round 3 · YB voltage, V' },
  R3_BR: { device: 'D424', kind: 'float32', description: 'Round 3 · BR voltage, V' },

  // ── We read: which pair the PLC has switched the supply across ─────────
  // ASK THE MANAGER: the contactor (or M bit) that connects the supply to
  // each pair. Fill in e.g. 'Y5' or 'M620'. While these are empty ('') the
  // app guesses the pair from the highest voltage instead.
  K_RY: { device: '', kind: 'coil', description: 'Supply switched across R–Y (contactor feedback)' },
  K_YB: { device: '', kind: 'coil', description: 'Supply switched across Y–B (contactor feedback)' },
  K_BR: { device: '', kind: 'coil', description: 'Supply switched across B–R (contactor feedback)' },

  // ── We read: live meter (same as NLL), for the gauge while a round runs ─
  V1: { device: 'D201', kind: 'float32', description: 'Live meter voltage 1, V (Modbus 4298)' },
  V2: { device: 'D203', kind: 'float32', description: 'Live meter voltage 2, V (Modbus 4300)' },
  V3: { device: 'D205', kind: 'float32', description: 'Live meter voltage 3, V (Modbus 4302)' },
} as const satisfies Record<string, MbtTag>;

export type MbtTagName = keyof typeof MBT_TAGS;

/** Contactor feedback per pair, in RY, YB, BR order. Used only when all three have an address. */
export const PAIR_TAGS = ['K_RY', 'K_YB', 'K_BR'] as const;
export const hasPairFeedback = PAIR_TAGS.every((n) => MBT_TAGS[n].device !== '');

/** The stored registers of each round, in RY, YB, BR order. */
export const ROUND_TAGS: ReadonlyArray<readonly [MbtTagName, MbtTagName, MbtTagName]> = [
  ['R1_RY', 'R1_YB', 'R1_BR'],
  ['R2_RY', 'R2_YB', 'R2_BR'],
  ['R3_RY', 'R3_YB', 'R3_BR'],
];

/** Modbus address of a tag, e.g. mbtAddr('V1') → 4297. */
export function mbtAddr(name: MbtTagName): number {
  return deltaToModbus(MBT_TAGS[name].device);
}
