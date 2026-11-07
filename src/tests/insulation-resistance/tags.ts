/**
 * PLC tags used by the Insulation Resistance test (megger).
 *
 * Fill in `device` with the ISPSoft address. While ANY of these is empty the
 * test runs on DEMO data, shown exactly as real data will be.
 *
 * PAIR tells which insulation is under test (1 = HV–LV, 2 = HV–E, 3 = LV–E),
 * ELAPSED the seconds since that pair's test voltage was applied. The app takes
 * the 15 s, 60 s and 600 s readings from RESISTANCE as ELAPSED passes them.
 */
import type { InstrumentTag } from '@/tests/shared/runtime';

export const IR_TAGS = {
  START: { device: '', kind: 'coil', description: 'IR START (pulse)' },
  COMPLETE: { device: '', kind: 'coil', description: 'IR COMPLETE — PLC sets it after the last pair' },
  PAIR: { device: '', kind: 'register', description: 'Insulation under test: 1 HV–LV, 2 HV–E, 3 LV–E' },
  ELAPSED: { device: '', kind: 'register', description: 'Seconds since the test voltage was applied' },
  RESISTANCE: { device: '', kind: 'float32', description: 'Live insulation resistance, MΩ' },
  VOLTAGE: { device: '', kind: 'float32', description: 'Live megger output voltage, V' },
} as const satisfies Record<string, InstrumentTag>;

export type IrTagName = keyof typeof IR_TAGS;
