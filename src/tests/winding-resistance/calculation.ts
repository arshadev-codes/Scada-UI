/**
 * Winding Resistance calculation.
 *
 * A DC current is passed through each winding and the voltage drop gives R.
 * Resistance rises with temperature, so every reading is corrected to 75 °C:
 *
 *   R75 = R × (K + 75) / (K + T)      K = 235 for copper, 225 for aluminium
 *
 * The three phases of one winding must agree: imbalance = (max − min) / average.
 */
import type { WindingMaterial } from '@/store/types';

export const REF_TEMP_C = 75;
/** Largest allowed spread between the phases of one winding, % */
export const IMBALANCE_LIMIT_PCT = 2;

export function correctTo75(r: number, tempC: number, material: WindingMaterial): number {
  const k = material === 'Al' ? 225 : 235;
  return (r * (k + REF_TEMP_C)) / (k + tempC);
}

export interface WrmSideResult {
  side: 'HV' | 'LV';
  pairs: string[];
  /** Measured at the test temperature, Ω */
  r: number[];
  /** Corrected to 75 °C, Ω */
  r75: number[];
  avg75: number;
  imbalancePct: number;
  pass: boolean;
}

export interface WrmResult {
  tempC: number;
  hv: WrmSideResult;
  lv: WrmSideResult;
  pass: boolean;
}

function side(side: 'HV' | 'LV', pairs: string[], r: number[], tempC: number, material: WindingMaterial): WrmSideResult {
  const r75 = r.map((x) => correctTo75(x, tempC, material));
  const avg75 = r75.reduce((s, x) => s + x, 0) / Math.max(1, r75.length);
  const imbalancePct = r.length > 1 && avg75 > 0 ? ((Math.max(...r75) - Math.min(...r75)) / avg75) * 100 : 0;
  return { side, pairs, r, r75, avg75, imbalancePct, pass: r.every((x) => x > 0) && imbalancePct <= IMBALANCE_LIMIT_PCT };
}

export function calculateWindingResistance(input: {
  tempC: number;
  hv: { pairs: string[]; r: number[]; material: WindingMaterial };
  lv: { pairs: string[]; r: number[]; material: WindingMaterial };
}): WrmResult {
  const hv = side('HV', input.hv.pairs, input.hv.r, input.tempC, input.hv.material);
  const lv = side('LV', input.lv.pairs, input.lv.r, input.tempC, input.lv.material);
  return { tempC: input.tempC, hv, lv, pass: hv.pass && lv.pass };
}

/** 1.8423 → "1.842 Ω", 0.004521 → "4.521 mΩ" */
export function formatOhms(r: number | null | undefined): { value: string; unit: string } {
  if (r === null || r === undefined || !Number.isFinite(r) || r <= 0) return { value: '—', unit: 'Ω' };
  if (r < 1e-3) return { value: (r * 1e6).toFixed(r < 1e-5 ? 3 : 2), unit: 'µΩ' };
  if (r < 1) return { value: (r * 1000).toFixed(r < 0.01 ? 3 : 2), unit: 'mΩ' };
  return { value: r.toFixed(r < 10 ? 4 : r < 100 ? 3 : 2), unit: 'Ω' };
}
