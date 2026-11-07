/**
 * PLC tags used by the Winding Resistance test.
 *
 * Fill in `device` with the ISPSoft address (M620, D500, ...). While ANY of
 * these is empty the test runs on DEMO data, shown exactly as real data will be.
 *
 * Measurement order: HV pair 1, 2, 3, then LV pair 1, 2, 3 (a single-phase
 * transformer only uses HV_1 and LV_1). The PLC writes each value when that
 * reading has settled; 0 means "not measured yet".
 */
import type { InstrumentTag } from '@/tests/shared/runtime';

export const WRM_TAGS = {
  START: { device: '', kind: 'coil', description: 'WRM START (pulse)' },
  COMPLETE: { device: '', kind: 'coil', description: 'WRM COMPLETE — PLC sets it after the last reading' },
  TEMP: { device: '', kind: 'float32', description: 'Winding temperature during the test, °C' },
  CURRENT: { device: '', kind: 'float32', description: 'Test current of the resistance meter, A' },
  LIVE: { device: '', kind: 'float32', description: 'Live (settling) resistance of the pair being measured, Ω' },
  HV_1: { device: '', kind: 'float32', description: 'HV pair 1 resistance, Ω' },
  HV_2: { device: '', kind: 'float32', description: 'HV pair 2 resistance, Ω' },
  HV_3: { device: '', kind: 'float32', description: 'HV pair 3 resistance, Ω' },
  LV_1: { device: '', kind: 'float32', description: 'LV pair 1 resistance, Ω' },
  LV_2: { device: '', kind: 'float32', description: 'LV pair 2 resistance, Ω' },
  LV_3: { device: '', kind: 'float32', description: 'LV pair 3 resistance, Ω' },
} as const satisfies Record<string, InstrumentTag>;

export type WrmTagName = keyof typeof WRM_TAGS;
