import { BridgePlcService } from './BridgePlcService';
import { MockPlcService } from './MockPlcService';
import type { PlcService, PlcStatus, ReadItem, StatusListener } from './PlcService';

/**
 * Simulator ↔ Real PLC switch.
 *
 * `plc` is the single PLC object the whole app uses. It forwards every call
 * to either the simulator or the real PLC, depending on the selected mode.
 */
export type PlcMode = 'sim' | 'real';

const MODE_KEY = 'plc.mode';

function loadMode(): PlcMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'real' ? 'real' : 'sim';
  } catch {
    return 'sim';
  }
}

class SwitchablePlcService implements PlcService {
  private sim = new MockPlcService();
  private real = new BridgePlcService();
  private listeners = new Set<StatusListener>();
  mode: PlcMode = loadMode();

  constructor() {
    // Pass on status only from the one that is currently selected.
    this.sim.subscribe((s) => this.mode === 'sim' && this.emit(s));
    this.real.subscribe((s) => this.mode === 'real' && this.emit(s));
  }

  private get active(): PlcService {
    return this.mode === 'real' ? this.real : this.sim;
  }

  /** Switch between simulator and real PLC. Reconnects if we were connected. */
  async setMode(mode: PlcMode): Promise<void> {
    if (mode === this.mode) return;
    const wasConnected = this.active.isConnected();
    await this.active.disconnect();
    this.mode = mode;
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* ignore */
    }
    if (wasConnected) await this.active.connect();
    else this.emit(this.lastOf(this.active));
  }

  connect = () => this.active.connect();
  disconnect = () => this.active.disconnect();
  isConnected = () => this.active.isConnected();
  writeCoil = (address: number, value: boolean) => this.active.writeCoil(address, value);
  writeRegister = (address: number, value: number) => this.active.writeRegister(address, value);
  readStatus = () => this.active.readStatus();
  readValues = (items: ReadItem[]) => this.active.readValues(items);

  subscribe(cb: StatusListener): () => void {
    this.listeners.add(cb);
    cb(this.lastOf(this.active));
    return () => {
      this.listeners.delete(cb);
    };
  }

  private lastOf(service: PlcService): PlcStatus {
    let last!: PlcStatus;
    service.subscribe((s) => (last = s))(); // subscribe gives the current status right away
    return last;
  }

  private emit(s: PlcStatus): void {
    this.listeners.forEach((cb) => cb(s));
  }
}

export const plc = new SwitchablePlcService();

export * from './PlcService';
export * from './commands';
