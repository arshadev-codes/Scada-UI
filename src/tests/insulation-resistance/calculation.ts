/**
 * Insulation Resistance calculation.
 *
 * A DC test voltage is held across the insulation for 10 minutes. As the
 * insulation polarises the leakage current falls, so the resistance rises.
 * Dry, clean insulation rises a lot; wet or dirty insulation stays flat:
 *
 *   DAI (dielectric absorption) = R60 / R15
 *   PI  (polarisation index)    = R600 / R60
 */

export const IR_PAIRS = ['HV–LV', 'HV–E', 'LV–E'] as const;
export type IrPair = (typeof IR_PAIRS)[number];

/** Capture points, seconds after the voltage is applied */
export const IR_POINTS = [15, 60, 600] as const;
export const DAI_MIN = 1.25;
export const PI_MIN = 1.25;

export interface IrPairResult {
  pair: IrPair;
  testV: number;
  /** MΩ at 15 s, 60 s, 600 s */
  r15: number;
  r60: number;
  r600: number;
  dai: number;
  pi: number;
  pass: boolean;
}

export interface IrResult {
  pairs: IrPairResult[];
  pass: boolean;
}

export function pairResult(pair: IrPair, testV: number, r: { r15: number; r60: number; r600: number }): IrPairResult {
  const dai = r.r15 > 0 ? r.r60 / r.r15 : NaN;
  const pi = r.r60 > 0 ? r.r600 / r.r60 : NaN;
  return { pair, testV, ...r, dai, pi, pass: dai >= DAI_MIN && pi >= PI_MIN };
}

export function calculateInsulation(pairs: IrPairResult[]): IrResult {
  return { pairs, pass: pairs.length === IR_PAIRS.length && pairs.every((p) => p.pass) };
}

/** 6820 MΩ → "6.82 GΩ" */
export function formatMohm(r: number | null | undefined): { value: string; unit: string } {
  if (r === null || r === undefined || !Number.isFinite(r) || r <= 0) return { value: '—', unit: 'MΩ' };
  if (r >= 1e6) return { value: (r / 1e6).toFixed(2), unit: 'TΩ' };
  if (r >= 1000) return { value: (r / 1000).toFixed(r >= 1e5 ? 1 : 2), unit: 'GΩ' };
  return { value: r.toFixed(r >= 100 ? 0 : 1), unit: 'MΩ' };
}

/** Megger DC test voltage for a winding of this rated voltage (V → V). */
export function irTestVoltage(ratedV: number): number {
  if (ratedV >= 11000) return 5000;
  if (ratedV >= 3300) return 2500;
  if (ratedV > 1000) return 1000;
  return 500;
}
