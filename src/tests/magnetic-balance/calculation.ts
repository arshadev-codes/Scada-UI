/**
 * Magnetic Balance calculation.
 *
 * Each round the PLC puts a voltage across one pair of terminals (RY, YB or
 * BR) and reads all three line voltages. The flux of the energised part
 * returns through the other two, so the two other readings add up to the
 * applied one:
 *
 *   e.g. RY energised at 230 V → YB 160 V + BR 70 V ≈ 230 V
 *
 * A shorted turn or core fault breaks this, so the sum is off.
 */

/** The two other voltages must add up to the applied voltage within ±5 %. */
export const SUM_TOLERANCE = 0.05;

export type PhaseIndex = 0 | 1 | 2;
export const PHASES = ['RY', 'YB', 'BR'] as const;

export interface MbtRound {
  /** Pair that was energised (the highest reading) */
  energised: PhaseIndex;
  /** RY, YB, BR voltages for this round */
  v: [number, number, number];
}

export interface MbtRoundCheck extends MbtRound {
  applied: number;
  /** Each voltage as a fraction of the applied voltage */
  share: [number, number, number];
  /** The two other voltages added up, as a fraction of applied */
  sum: number;
  pass: boolean;
  reason: string;
}

export interface MbtResult {
  rounds: MbtRoundCheck[];
  pass: boolean;
}

export function checkRound(round: MbtRound): MbtRoundCheck {
  const e = round.energised;
  const applied = round.v[e];
  const share = round.v.map((x) => (applied > 0 ? x / applied : 0)) as [number, number, number];
  const others = ([0, 1, 2] as const).filter((i) => i !== e);
  const sum = others.reduce<number>((s, i) => s + share[i], 0);

  const pass = Math.abs(sum - 1) <= SUM_TOLERANCE;
  const names = others.map((i) => PHASES[i]).join(' + ');
  const reason = pass
    ? `${names} ≈ ${PHASES[e]}`
    : `${names} = ${(sum * 100).toFixed(1)} % of ${PHASES[e]} (want 100 ± ${SUM_TOLERANCE * 100} %)`;

  return { ...round, applied, share, sum, pass, reason };
}

export function calculateMagneticBalance(rounds: MbtRound[]): MbtResult {
  const checks = rounds.map(checkRound);
  return { rounds: checks, pass: checks.length === 3 && checks.every((c) => c.pass) };
}
