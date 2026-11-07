import type { Phases } from '@/store/types';

export function toNumber(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Rated line current, amperes.
 *   3-phase: I = S·1000 / (√3 · V)
 *   1-phase: I = S·1000 / V
 */
export function ratedCurrent(kva: number | null, volts: number | null, phases: Phases): number | null {
  if (kva === null || volts === null || kva <= 0 || volts <= 0) return null;
  const denom = phases === '3' ? Math.sqrt(3) * volts : volts;
  return (kva * 1000) / denom;
}

export interface RatedCurrents {
  hv: number | null;
  lv: number | null;
}

export function ratedCurrents(o: {
  ratedPowerKva: string;
  hvVoltageKv: string;
  lvVoltageV: string;
  phases: Phases;
}): RatedCurrents {
  const kva = toNumber(o.ratedPowerKva);
  const hvKv = toNumber(o.hvVoltageKv);
  return {
    hv: ratedCurrent(kva, hvKv === null ? null : hvKv * 1000, o.phases),
    lv: ratedCurrent(kva, toNumber(o.lvVoltageV), o.phases),
  };
}

/**
 * Variac output target for a test, volts.
 *   - Open-circuit tests (no-load, ratio, …): rated voltage of the energised winding.
 *   - Short-circuit tests (load loss, impedance, …): impedance voltage = %Z × rated V,
 *     enough to circulate rated current.
 * Falls back to 5 %Z when impedance isn't entered.
 */
export function variacSetpoint(
  o: { hvVoltageKv: string; lvVoltageV: string; impedancePct: string },
  side: 'HV' | 'LV',
  otherWinding: 'open' | 'short',
): number {
  const hvKv = toNumber(o.hvVoltageKv);
  const ratedV = side === 'HV' ? (hvKv === null ? null : hvKv * 1000) : toNumber(o.lvVoltageV);
  if (ratedV === null || ratedV <= 0) return 0;
  const z = toNumber(o.impedancePct) ?? 5;
  const v = otherWinding === 'short' ? (ratedV * z) / 100 : ratedV;
  return Math.max(1, Math.min(0xffff, Math.round(v)));
}

/** Rated current of the energised winding, A. */
export function energisedRatedCurrent(
  o: { ratedPowerKva: string; hvVoltageKv: string; lvVoltageV: string; phases: Phases },
  side: 'HV' | 'LV',
): number | null {
  const c = ratedCurrents(o);
  return side === 'HV' ? c.hv : c.lv;
}
