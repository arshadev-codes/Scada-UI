/**
 * Voltage Ratio calculation.
 *
 * A test voltage is applied to HV; the LV line voltage it produces is measured
 * on each phase:
 *
 *   measured ratio = HV voltage applied / LV voltage measured   (both in volts)
 *   rated ratio    = HV rated voltage on the tap / LV rated voltage
 *   error %        = (measured − rated) / rated × 100       must be within ±0.5 %
 */
import type { TapInfo } from '@/tests/shared/transformer';

export const RATIO_TOLERANCE_PCT = 0.5;
export const RATIO_PHASES = ['R–Y', 'Y–B', 'B–R'] as const;

export interface TtrTapRow extends TapInfo {
  rated: number;
  /** HV line voltages applied, V */
  hvV: number[];
  /** LV line voltages, V */
  lvV: number[];
  measured: number[];
  errorPct: number[];
  pass: boolean;
}

export interface TtrResult {
  rows: TtrTapRow[];
  pass: boolean;
}

export function ratedRatio(hvV: number, lvV: number, tapPct: number): number {
  return lvV > 0 ? (hvV * (1 + tapPct / 100)) / lvV : 0;
}

export function ratioOf(hvV: number, lvV: number): number {
  return lvV > 0 ? hvV / lvV : NaN;
}

export const errorOf = (measured: number, rated: number) => (rated > 0 && Number.isFinite(measured) ? ((measured - rated) / rated) * 100 : NaN);

export function tapRow(tap: TapInfo, rated: number, hvV: number[], lvV: number[]): TtrTapRow {
  const measured = hvV.map((h, i) => ratioOf(h, lvV[i]));
  const errorPct = measured.map((m) => errorOf(m, rated));
  return { ...tap, rated, hvV, lvV, measured, errorPct, pass: errorPct.every((e) => Math.abs(e) <= RATIO_TOLERANCE_PCT) };
}

export function calculateRatio(rows: TtrTapRow[]): TtrResult {
  return { rows, pass: rows.length > 0 && rows.every((r) => r.pass) };
}
