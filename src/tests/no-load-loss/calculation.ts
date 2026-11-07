/**
 * No-Load Loss calculation.
 *
 * HV is open, so the transformer carries no load. All the power the meter
 * shows is core loss, so measured power = No-Load Loss (P0).
 *
 * PASS if P0 <= guaranteed loss + 15 % (IEC tolerance).
 */

export const TOLERANCE = 0.15; // +15 %

export interface NoLoadResult {
  voltage: number; // V, average of the samples
  current: number; // A, average of the samples (no-load current I0)
  p0: number; // W, measured no-load loss
  guaranteed: number; // W, from the test object
  limit: number; // W, guaranteed + 15 %
  pass: boolean;
}

export interface Sample {
  voltage: number;
  current: number;
  power: number;
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function calculateNoLoadLoss(samples: Sample[], guaranteedW: number): NoLoadResult {
  const voltage = average(samples.map((s) => s.voltage));
  const current = average(samples.map((s) => s.current));
  const p0 = average(samples.map((s) => s.power));

  const limit = guaranteedW * (1 + TOLERANCE);
  const pass = p0 <= limit;

  return { voltage, current, p0, guaranteed: guaranteedW, limit, pass };
}
