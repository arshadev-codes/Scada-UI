import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AudioWaveform,
  Gauge,
  Magnet,
  Omega,
  Ratio,
  ShieldCheck,
  Sigma,
  Thermometer,
  Waves,
  Zap,
} from 'lucide-react';

export type Side = 'HV' | 'LV';

export interface SequenceDurations {
  /** OUT1 energise time, seconds */
  t1: number;
  /** delay between OUT1 off and OUT2 on, seconds */
  wait: number;
  /** OUT2 capture time, seconds */
  t2: number;
}

export interface TestDefinition {
  id: string;
  /** Short procedure code shown on panels, e.g. "NLL" */
  code: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** Value written to TEST_SELECT (D100). */
  plcCode: number;
  /** Winding the source is connected to. Written to SIDE_SELECT (D101). */
  defaultSide: Side;
  /** How the non-energised winding is terminated during the test. */
  otherWinding: 'open' | 'short';
  defaultDurations: SequenceDurations;
  /** False = shown in the catalogue but cannot be selected yet. */
  available: boolean;
}

/**
 * Test catalogue. Order here is the order cards appear on the selection page.
 * Durations are placeholder sequence times for the PLC timers (seconds).
 */
export const TEST_DEFINITIONS: readonly TestDefinition[] = [
  {
    id: 'no-load',
    code: 'NLL',
    name: 'No-Load Loss & Current',
    description: 'Rated voltage on one winding, other open-circuited. Measures core loss and magnetising current.',
    icon: Waves,
    plcCode: 1,
    defaultSide: 'LV',
    otherWinding: 'open',
    defaultDurations: { t1: 10, wait: 3, t2: 5 },
    available: true,
  },
  {
    id: 'load-loss',
    code: 'LLI',
    name: 'Load Loss & Impedance Voltage',
    description: 'Rated current with the opposite winding short-circuited. Copper loss and impedance voltage at 75 °C.',
    icon: Gauge,
    plcCode: 2,
    defaultSide: 'HV',
    otherWinding: 'short',
    defaultDurations: { t1: 15, wait: 3, t2: 5 },
    available: true,
  },
  {
    id: 'impedance-voltage',
    code: 'IMP',
    name: 'Impedance Voltage (Tap-wise)',
    description: 'Short-circuit impedance measured on extreme and nominal taps to verify %Z against the nameplate.',
    icon: Omega,
    plcCode: 3,
    defaultSide: 'HV',
    otherWinding: 'short',
    defaultDurations: { t1: 12, wait: 3, t2: 5 },
    available: true,
  },
  {
    id: 'zero-sequence',
    code: 'ZSI',
    name: 'Zero Sequence Impedance',
    description: 'Single-phase supply between shorted line terminals and neutral of the star winding.',
    icon: Sigma,
    plcCode: 4,
    defaultSide: 'LV',
    otherWinding: 'open',
    defaultDurations: { t1: 10, wait: 3, t2: 5 },
    available: true,
  },
  {
    id: 'ratio',
    code: 'TTR',
    name: 'Voltage Ratio',
    description: 'Supply on LV, HV and LV line voltages measured on every tap; ratio HV ÷ LV against the rated ratio.',
    icon: Ratio,
    plcCode: 5,
    defaultSide: 'HV',
    otherWinding: 'open',
    defaultDurations: { t1: 8, wait: 2, t2: 4 },
    available: true,
  },
  {
    id: 'magnetic-balance',
    code: 'MBT',
    name: 'Magnetic Balance',
    description: 'Voltage applied to one phase, induced voltages read on the others to detect core or winding faults.',
    icon: Magnet,
    plcCode: 6,
    defaultSide: 'LV',
    otherWinding: 'open',
    defaultDurations: { t1: 8, wait: 2, t2: 4 },
    available: true,
  },
  {
    id: 'applied-voltage',
    code: 'AVT',
    name: 'Applied Voltage (Separate Source)',
    description: 'Power-frequency withstand of HV insulation to LV and earth for 60 s. HV shorted, LV shorted and earthed; leakage watched.',
    icon: Zap,
    plcCode: 7,
    defaultSide: 'HV',
    otherWinding: 'short',
    defaultDurations: { t1: 60, wait: 3, t2: 5 },
    available: true,
  },
  {
    id: 'induced-voltage',
    code: 'IVT',
    name: 'Induced Overvoltage',
    description: 'Twice rated voltage at twice rated frequency on HV, LV open, for 60 s. Checks inter-turn and phase insulation.',
    icon: AudioWaveform,
    plcCode: 8,
    defaultSide: 'HV',
    otherWinding: 'open',
    defaultDurations: { t1: 40, wait: 3, t2: 5 },
    available: true,
  },
  {
    id: 'temperature-rise',
    code: 'TRT',
    name: 'Temperature Rise',
    description: 'Total losses injected (LV shorted) until top oil stabilises, then rated current for 1 h. Oil and winding rises logged.',
    icon: Thermometer,
    plcCode: 9,
    defaultSide: 'HV',
    otherWinding: 'short',
    defaultDurations: { t1: 90, wait: 5, t2: 10 },
    available: true,
  },
  {
    id: 'winding-resistance',
    code: 'WRM',
    name: 'Winding Resistance',
    description: 'DC resistance of each winding per phase, used for temperature correction of load loss.',
    icon: Activity,
    plcCode: 10,
    defaultSide: 'HV',
    otherWinding: 'open',
    defaultDurations: { t1: 20, wait: 2, t2: 5 },
    available: true,
  },
  {
    id: 'insulation-resistance',
    code: 'IRT',
    name: 'Insulation Resistance',
    description: 'Megger test HV–LV, HV–E and LV–E at DC test voltage, with polarisation index.',
    icon: ShieldCheck,
    plcCode: 11,
    defaultSide: 'HV',
    otherWinding: 'short',
    defaultDurations: { t1: 60, wait: 5, t2: 10 },
    available: true,
  },
];

export function getTestDefinition(id: string): TestDefinition | undefined {
  return TEST_DEFINITIONS.find((t) => t.id === id);
}

export function totalDuration(d: SequenceDurations): number {
  return d.t1 + d.wait + d.t2;
}

export const otherSide = (s: Side): Side => (s === 'HV' ? 'LV' : 'HV');

/** e.g. "HV energised · LV shorted" */
export function connectionLabel(side: Side, otherWinding: 'open' | 'short'): string {
  return `${side} energised · ${otherSide(side)} ${otherWinding === 'short' ? 'shorted' : 'open'}`;
}
