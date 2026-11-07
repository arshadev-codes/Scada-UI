import type { SequenceDurations, Side } from '@/config/tests';
import type { NoLoadResult } from '@/tests/no-load-loss/calculation';
import type { MbtResult, MbtRound } from '@/tests/magnetic-balance/calculation';
import type { WrmResult } from '@/tests/winding-resistance/calculation';
import type { TtrResult } from '@/tests/ratio/calculation';
import type { IrResult } from '@/tests/insulation-resistance/calculation';
import type { IvtResult } from '@/tests/induced-voltage/runInducedVoltageTest';
import type { AvtResult } from '@/tests/applied-voltage/runAppliedVoltageTest';
import type { TrtResult } from '@/tests/temperature-rise/runTemperatureRiseTest';

export type Phases = '1' | '3';
export type Frequency = '50' | '60';
export type CoolingType = 'ONAN' | 'ONAF' | 'OFAF' | 'DRY';
export type WindingMaterial = 'Cu' | 'Al';
export type TapChanger = 'NONE' | 'OCTC' | 'OLTC';
export type Standard = 'IEC 60076' | 'IS 2026';

/**
 * Test object as entered on the form. Numeric fields are kept as the raw
 * strings the operator typed, so partial input round-trips through storage.
 * Use helpers in lib/electrical.ts to get parsed numbers.
 */
export interface TestObject {
  // Identification
  customerName: string;
  jobNo: string;
  serialNo: string;
  manufacturer: string;
  yearOfManufacture: string;
  // Ratings
  ratedPowerKva: string;
  hvVoltageKv: string;
  lvVoltageV: string;
  phases: Phases;
  frequency: Frequency;
  vectorGroup: string;
  impedancePct: string;
  // Construction
  cooling: CoolingType;
  windingHv: WindingMaterial;
  windingLv: WindingMaterial;
  tapChanger: TapChanger;
  tapMinPct: string;
  tapMaxPct: string;
  tapCount: string;
  nominalTap: string;
  // Guaranteed values
  guaranteedNoLoadLossW: string;
  guaranteedLoadLossW: string;
  // Test conditions
  ambientTempC: string;
  testDate: string;
  testedBy: string;
  standard: Standard;
}

export interface Operator {
  id: string;
  loginAt: number;
}

export interface TestSelection {
  testId: string;
  side: Side;
}

/** Saved results, kept per session so switching tests and the report can show them. */
export interface TestResults {
  nll?: NoLoadResult & { phaseV: number[] };
  mbt?: { rounds: Array<MbtRound | null>; result: MbtResult | null };
  wrm?: WrmResult;
  ttr?: TtrResult;
  ir?: IrResult;
  ivt?: IvtResult;
  avt?: AvtResult;
  trt?: TrtResult;
}

export type RunStatus = 'pending' | 'running' | 'completed' | 'aborted';

export interface TestRun {
  testId: string;
  side: Side;
  status: RunStatus;
  durations: SequenceDurations;
  startedAt: number | null;
  endedAt: number | null;
}
