/**
 * PLC tags used by the Applied Voltage (separate source) test.
 *
 * Fill in `device` with the ISPSoft address. While ANY of these is empty the
 * test runs on DEMO data, shown exactly as real data will be.
 */
import type { InstrumentTag } from '@/tests/shared/runtime';

export const AVT_TAGS = {
  START: { device: '', kind: 'coil', description: 'AVT START (pulse)' },
  COMPLETE: { device: '', kind: 'coil', description: 'AVT COMPLETE — PLC sets it after ramp-down' },
  TRIP: { device: '', kind: 'coil', description: 'Test set tripped (flash-over / leakage over limit)' },
  KV: { device: '', kind: 'float32', description: 'Test voltage HV → LV + earth, kV' },
  LEAK_MA: { device: '', kind: 'float32', description: 'Leakage current to earth, mA' },
  HOLD_S: { device: '', kind: 'float32', description: 'Seconds held at test voltage' },
} as const satisfies Record<string, InstrumentTag>;
