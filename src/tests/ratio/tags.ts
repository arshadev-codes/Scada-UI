/**
 * PLC tags used by the Voltage Ratio test.
 *
 * On this bench a test voltage is applied to the HV winding and the meter reads
 * the HV voltage applied and the LV voltage it produces, both in volts. The
 * ratio is HV ÷ LV, per phase.
 *
 * Fill in `device` with the ISPSoft address. While ANY of these is empty the
 * test runs on DEMO data, shown exactly as real data will be.
 *
 * TAP is only used when the tap is changed by the PLC ("PLC" tap mode). With
 * "Manual" tap mode the operator sets the tap and presses RECORD on screen.
 */
import type { InstrumentTag } from '@/tests/shared/runtime';

export const TTR_TAGS = {
  START: { device: '', kind: 'coil', description: 'RATIO TEST START (pulse) — PLC puts the test voltage on HV' },
  COMPLETE: { device: '', kind: 'coil', description: 'RATIO TEST COMPLETE — PLC sets it after the last tap (PLC tap mode)' },
  TAP: { device: '', kind: 'register', description: 'Tap position the PLC has set (1…N), PLC tap mode' },
  HV_RY: { device: '', kind: 'float32', description: 'HV line voltage applied R–Y, V' },
  HV_YB: { device: '', kind: 'float32', description: 'HV line voltage applied Y–B, V' },
  HV_BR: { device: '', kind: 'float32', description: 'HV line voltage applied B–R, V' },
  LV_RY: { device: '', kind: 'float32', description: 'LV line voltage measured r–y, V' },
  LV_YB: { device: '', kind: 'float32', description: 'LV line voltage measured y–b, V' },
  LV_BR: { device: '', kind: 'float32', description: 'LV line voltage measured b–r, V' },
} as const satisfies Record<string, InstrumentTag>;

export type TtrTagName = keyof typeof TTR_TAGS;
