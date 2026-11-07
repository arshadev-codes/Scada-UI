/**
 * PLC tag map — Delta DVP-12SE.
 *
 * PLACEHOLDER ADDRESSES: edit these to match the ladder program once it is
 * finalised. The UI only ever refers to tags by name (e.g. `TAGS.START`),
 * never by raw address, so changing an address here is the only edit needed.
 */

export type DeltaArea = 'X' | 'Y' | 'M' | 'D';

/** coil = read/write bit, input = read-only bit, register = 16-bit word */
export type TagKind = 'coil' | 'input' | 'register';

export interface DeltaTag {
  /** Delta device address as written in ISPSoft / WPLSoft, e.g. "M100" */
  readonly device: string;
  readonly kind: TagKind;
  readonly description: string;
  /** Proposed by the UI team, not yet in the ladder program. */
  readonly proposed?: boolean;
}

/**
 * Modbus base offsets for the DVP-SE series (0-based protocol addresses).
 *   X0 = 0x0400 (1024)   Y0 = 0x0500 (1280)
 *   M0 = 0x0800 (2048)   D0 = 0x1000 (4096)
 */
export const MODBUS_BASE: Readonly<Record<DeltaArea, number>> = {
  X: 1024,
  Y: 1280,
  M: 2048,
  D: 4096,
};

/** Above these indices Delta maps the device into a second block. */
const M_HIGH_START = 1536; // M1536.. → 0xB000
const M_HIGH_BASE = 45056;
const D_HIGH_START = 4096; // D4096.. → 0x9000
const D_HIGH_BASE = 36864;

export interface ParsedDeltaAddress {
  area: DeltaArea;
  /** Decimal index (X/Y digits are octal on Delta PLCs and are converted). */
  index: number;
}

export function parseDeltaAddress(device: string): ParsedDeltaAddress {
  const match = /^([XYMD])(\d+)$/i.exec(device.trim());
  if (!match) throw new Error(`Invalid Delta address: "${device}"`);
  const area = match[1].toUpperCase() as DeltaArea;
  const digits = match[2];

  if (area === 'X' || area === 'Y') {
    if (/[89]/.test(digits)) {
      throw new Error(`${area} addresses are octal on Delta PLCs: "${device}"`);
    }
    return { area, index: parseInt(digits, 8) };
  }
  return { area, index: parseInt(digits, 10) };
}

/** Convert a Delta device address ("M100", "D110", "Y10") to a Modbus address. */
export function deltaToModbus(device: string): number {
  const { area, index } = parseDeltaAddress(device);
  if (area === 'M' && index >= M_HIGH_START) return M_HIGH_BASE + (index - M_HIGH_START);
  if (area === 'D' && index >= D_HIGH_START) return D_HIGH_BASE + (index - D_HIGH_START);
  return MODBUS_BASE[area] + index;
}

export const TAGS = {
  START: { device: 'M100', kind: 'coil', description: 'Start sequence (pulse)' },
  STOP: { device: 'M101', kind: 'coil', description: 'Stop / abort sequence (pulse)' },
  OUT1_STATUS: { device: 'Y0', kind: 'coil', description: 'Output 1 — energise contactor' },
  OUT2_STATUS: { device: 'Y1', kind: 'coil', description: 'Output 2 — capture / store reading' },
  TEST_SELECT: { device: 'D100', kind: 'register', description: 'Selected test code' },
  SIDE_SELECT: { device: 'D101', kind: 'register', description: 'Energised side (0 = LV, 1 = HV)' },
  T1_PRESET: { device: 'D110', kind: 'register', description: 'T1 energise duration (s)' },
  WAIT_PRESET: { device: 'D111', kind: 'register', description: 'Wait delay (s)' },
  T2_PRESET: { device: 'D112', kind: 'register', description: 'T2 capture duration (s)' },
  VARIAC_SET: { device: 'D113', kind: 'register', description: 'Variac output setpoint (V)', proposed: true },

  // Read-back registers the UI needs to mirror the sequence. Proposed — add to ladder.
  SEQ_STEP: { device: 'D120', kind: 'register', description: 'Sequence step (see SEQ_STEP_CODE)', proposed: true },
  STEP_ELAPSED: { device: 'D121', kind: 'register', description: 'Active step elapsed (×100 ms)', proposed: true },
  RUNNING: { device: 'M110', kind: 'coil', description: 'Sequence running flag', proposed: true },

  // Analyser read-back (proposed). Real values exceed 16 bits, so map each to a
  // 32-bit float register pair in the bridge: D130/131 V, D132/133 A, D134/135 W,
  // D136/137 Hz, D138/139 PF. The mock exposes them directly in PlcStatus.analog.
  VARIAC_V: { device: 'D130', kind: 'register', description: 'Variac output voltage (float32, V)', proposed: true },
  CURRENT: { device: 'D132', kind: 'register', description: 'Line current (float32, A)', proposed: true },
  POWER: { device: 'D134', kind: 'register', description: 'Active power (float32, W)', proposed: true },
  FREQUENCY: { device: 'D136', kind: 'register', description: 'Frequency (float32, Hz)', proposed: true },
  POWER_FACTOR: { device: 'D138', kind: 'register', description: 'Power factor (float32)', proposed: true },
} as const satisfies Record<string, DeltaTag>;

export type TagName = keyof typeof TAGS;

/** Modbus address for a named tag. */
export function addr(tag: TagName): number {
  return deltaToModbus(TAGS[tag].device);
}

/** Values written to SIDE_SELECT. */
export const SIDE_CODE = { LV: 0, HV: 1 } as const;

/** Values read from SEQ_STEP. */
export const SEQ_STEP_CODE = {
  IDLE: 0,
  OUT1: 1,
  WAIT: 2,
  OUT2: 3,
  COMPLETE: 4,
  ABORTED: 5,
  FAULT: 9,
} as const;
