/**
 * PLC tags used by the Induced Overvoltage test.
 *
 * Fill in `device` with the ISPSoft address (M630, D600, ...). While ANY of
 * these is empty the test runs on DEMO data, shown exactly as real data will be.
 */
import type { InstrumentTag } from '@/tests/shared/runtime';

export const IVT_TAGS = {
  START: { device: '', kind: 'coil', description: 'IVT START (pulse)' },
  COMPLETE: { device: '', kind: 'coil', description: 'IVT COMPLETE — PLC sets it after ramp-down' },
  TRIP: { device: '', kind: 'coil', description: 'Test set tripped (insulation failure / over-current)' },
  KV: { device: '', kind: 'float32', description: 'Voltage applied on HV, kV' },
  HZ: { device: '', kind: 'float32', description: 'Test frequency, Hz' },
  MA: { device: '', kind: 'float32', description: 'HV test current, mA' },
  LV_V: { device: '', kind: 'float32', description: 'Induced LV voltage, V' },
  HOLD_S: { device: '', kind: 'float32', description: 'Seconds held at test voltage' },
} as const satisfies Record<string, InstrumentTag>;
