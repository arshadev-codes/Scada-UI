/**
 * Transport-agnostic PLC contract. The UI talks to this interface only.
 *
 * Implementations:
 *   - MockPlcService     — in-browser simulation (current)
 *   - BridgePlcService   — real PLC over Ethernet, through server/modbus-bridge.mjs
 *
 * Addresses are Modbus protocol addresses (0-based). Use `addr()` from
 * config/tags.ts to resolve named tags.
 */

export type LinkState = 'DISCONNECTED' | 'CONNECTING' | 'ONLINE' | 'FAULT';

export type SeqStep = 'IDLE' | 'OUT1' | 'WAIT' | 'OUT2' | 'COMPLETE' | 'ABORTED' | 'FAULT';

export interface PlcPresets {
  /** seconds, as read back from the preset registers */
  t1: number;
  wait: number;
  t2: number;
}

/** Live analyser values read back through the PLC / bridge. 0 when de-energised. */
export interface AnalogReadings {
  variacV: number;
  currentA: number;
  powerW: number;
  frequencyHz: number;
  powerFactor: number;
  /** Variac setpoint read back from VARIAC_SET, V */
  variacSetV: number;
}

export interface PlcStatus {
  link: LinkState;
  running: boolean;
  step: SeqStep;
  /** Physical output state read back from Y0 / Y1 */
  out1: boolean;
  out2: boolean;
  /** Elapsed time in the active step, ms */
  stepElapsedMs: number;
  /** Preset for the active step, ms (0 for untimed steps) */
  stepPresetMs: number;
  presets: PlcPresets;
  analog: AnalogReadings;
  /** No-Load Loss contactors read back from the PLC */
  contactors: { c1: boolean; c7: boolean };
  testSelect: number;
  sideSelect: number;
  /** Increments with every status frame — lets the UI detect a stale link. */
  heartbeat: number;
  /** Wall-clock time the frame was produced, ms since epoch */
  timestamp: number;
}

/** float32 = decimal number stored in two registers (see server/modbus-bridge.mjs). */
/**
 * edges = how many times a coil went OFF → ON (watched every 20 ms by the bridge),
 * for short PLC pulses the 0.5 s reads would miss.
 */
export type ReadKind = 'coil' | 'input' | 'register' | 'float32' | 'edges';

export interface ReadItem {
  kind: ReadKind;
  address: number;
}

export type StatusListener = (status: PlcStatus) => void;

export interface PlcService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  writeCoil(address: number, value: boolean): Promise<void>;
  writeRegister(address: number, value: number): Promise<void>;
  readStatus(): Promise<PlcStatus>;
  /** Read many values at once. A value the PLC could not give comes back as null. */
  readValues(items: ReadItem[]): Promise<Array<number | null>>;
  /** Returns an unsubscribe function. */
  subscribe(cb: StatusListener): () => void;
}

export class PlcNotConnectedError extends Error {
  constructor() {
    super('PLC link is not online');
    this.name = 'PlcNotConnectedError';
  }
}
