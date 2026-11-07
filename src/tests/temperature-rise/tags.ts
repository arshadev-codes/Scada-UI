/**
 * PLC tags used by the Temperature Rise (heat run) test.
 *
 * Fill in `device` with the ISPSoft address. While ANY of these is empty the
 * test runs on DEMO data (time compressed), shown exactly as real data will be.
 */
import type { InstrumentTag } from '@/tests/shared/runtime';

export const TRT_TAGS = {
  START: { device: '', kind: 'coil', description: 'TRT START (pulse)' },
  COMPLETE: { device: '', kind: 'coil', description: 'TRT COMPLETE — PLC sets it at the end of the rated-current hour' },
  RATED_PHASE: { device: '', kind: 'coil', description: 'ON while rated current is injected (after oil has stabilised)' },
  ELAPSED_MIN: { device: '', kind: 'float32', description: 'Minutes since START' },
  AMBIENT: { device: '', kind: 'float32', description: 'Ambient (average of the cooling-air probes), °C' },
  TOP_OIL: { device: '', kind: 'float32', description: 'Top oil, °C' },
  BOTTOM_OIL: { device: '', kind: 'float32', description: 'Bottom oil, °C' },
  HV_WDG: { device: '', kind: 'float32', description: 'HV winding (WTI), °C' },
  LV_WDG: { device: '', kind: 'float32', description: 'LV winding (WTI), °C' },
  CURRENT: { device: '', kind: 'float32', description: 'HV current, A' },
  LOSS_KW: { device: '', kind: 'float32', description: 'Power injected, kW' },
} as const satisfies Record<string, InstrumentTag>;
