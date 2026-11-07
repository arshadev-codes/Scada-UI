import { addr, SEQ_STEP_CODE, type TagName } from '@/config/tags';
import { nllAddr } from '@/tests/no-load-loss/tags';
import type { LinkState, PlcService, PlcStatus, ReadItem, SeqStep, StatusListener } from './PlcService';

/**
 * Real PLC over Ethernet.
 *
 * The browser cannot talk Modbus TCP itself, so every call goes to the
 * Node bridge (server/modbus-bridge.mjs, start with `npm run dev:plc`),
 * and the bridge talks to the PLC at the IP saved on the /plc-test page.
 */

const POLL_MS = 500;
/** Same key the /plc-test page saves the IP under. */
const CONNECTION_KEY = 'plc-test.connection';

export interface PlcConnection {
  host: string;
  port: string;
  unitId: string;
}

export function loadConnection(): PlcConnection {
  try {
    const s = JSON.parse(localStorage.getItem(CONNECTION_KEY) ?? '{}');
    return { host: s.host ?? '192.168.1.5', port: s.port ?? '502', unitId: s.unitId ?? '1' };
  } catch {
    return { host: '192.168.1.5', port: '502', unitId: '1' };
  }
}

export function saveConnection(c: PlcConnection): void {
  try {
    localStorage.setItem(CONNECTION_KEY, JSON.stringify(c));
  } catch {
    /* storage blocked — keep using the value in memory */
  }
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/plc/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Bridge not reachable — start it with `npm run dev:plc`');
  }
  const data = await res.json().catch(() => ({ error: `Bridge error (HTTP ${res.status})` }));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

const STEP_FROM_CODE: Record<number, SeqStep> = Object.fromEntries(
  Object.entries(SEQ_STEP_CODE).map(([k, v]) => [v, k as SeqStep]),
);

/** Everything the status screen needs, read in one go every POLL_MS. */
const reg = (t: TagName): ReadItem => ({ kind: 'register', address: addr(t) });
const coil = (t: TagName): ReadItem => ({ kind: 'coil', address: addr(t) });
const float = (t: TagName): ReadItem => ({ kind: 'float32', address: addr(t) });

const STATUS_ITEMS: ReadItem[] = [
  coil('RUNNING'), // 0
  reg('SEQ_STEP'), // 1
  reg('STEP_ELAPSED'), // 2
  coil('OUT1_STATUS'), // 3
  coil('OUT2_STATUS'), // 4
  reg('T1_PRESET'), // 5
  reg('WAIT_PRESET'), // 6
  reg('T2_PRESET'), // 7
  reg('TEST_SELECT'), // 8
  reg('SIDE_SELECT'), // 9
  reg('VARIAC_SET'), // 10
  float('VARIAC_V'), // 11
  float('CURRENT'), // 12
  float('POWER'), // 13
  float('FREQUENCY'), // 14
  float('POWER_FACTOR'), // 15
  { kind: 'coil', address: nllAddr('C1') }, // 16
  { kind: 'coil', address: nllAddr('C7') }, // 17
];

export class BridgePlcService implements PlcService {
  private link: LinkState = 'DISCONNECTED';
  private listeners = new Set<StatusListener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private heartbeat = 0;
  private polling = false;
  private last: PlcStatus = this.emptyStatus();

  async connect(): Promise<void> {
    if (this.link === 'ONLINE') return;
    this.setLink('CONNECTING');
    const c = loadConnection();
    try {
      await api('connect', { host: c.host, port: Number(c.port), unitId: Number(c.unitId) });
    } catch (e) {
      this.setLink('FAULT');
      throw e;
    }
    this.setLink('ONLINE');
    this.timer = setInterval(() => void this.poll(), POLL_MS);
    await this.poll();
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await api('disconnect', {}).catch(() => undefined);
    this.setLink('DISCONNECTED');
  }

  isConnected(): boolean {
    return this.link === 'ONLINE';
  }

  async writeCoil(address: number, value: boolean): Promise<void> {
    await api('write', { kind: 'coil', address, value: value ? 1 : 0 });
  }

  async writeRegister(address: number, value: number): Promise<void> {
    await api('write', { kind: 'register', address, value });
  }

  async readValues(items: ReadItem[]): Promise<Array<number | null>> {
    const res = await api<{ values: Array<number | null> }>('read-many', { items });
    return res.values;
  }

  async readStatus(): Promise<PlcStatus> {
    await this.poll();
    return this.last;
  }

  subscribe(cb: StatusListener): () => void {
    this.listeners.add(cb);
    cb(this.last);
    return () => {
      this.listeners.delete(cb);
    };
  }

  // ── Polling ───────────────────────────────────────────────────────────────

  private async poll(): Promise<void> {
    if (this.link !== 'ONLINE' || this.polling) return; // skip if the last poll is still running
    let v: Array<number | null>;
    this.polling = true;
    try {
      v = await this.readValues(STATUS_ITEMS);
    } catch {
      this.polling = false;
      // Bridge down or PLC cable pulled.
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.setLink('FAULT');
      return;
    }
    this.polling = false;
    const n = (i: number) => v[i] ?? 0;
    const b = (i: number) => v[i] === 1;
    const step = STEP_FROM_CODE[n(1)] ?? 'IDLE';
    const presets = { t1: n(5), wait: n(6), t2: n(7) };
    const presetFor: Partial<Record<SeqStep, number>> = { OUT1: presets.t1, WAIT: presets.wait, OUT2: presets.t2 };

    this.last = {
      link: this.link,
      running: b(0),
      step,
      out1: b(3),
      out2: b(4),
      stepElapsedMs: n(2) * 100,
      stepPresetMs: (presetFor[step] ?? 0) * 1000,
      presets,
      analog: {
        variacV: n(11),
        currentA: n(12),
        powerW: n(13),
        frequencyHz: n(14),
        powerFactor: n(15),
        variacSetV: n(10),
      },
      contactors: { c1: b(16), c7: b(17) },
      testSelect: n(8),
      sideSelect: n(9),
      heartbeat: (this.heartbeat = (this.heartbeat + 1) & 0xffff),
      timestamp: Date.now(),
    };
    this.emit();
  }

  private setLink(link: LinkState): void {
    this.link = link;
    this.last = link === 'ONLINE' ? { ...this.last, link } : { ...this.emptyStatus(), link };
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((cb) => cb(this.last));
  }

  private emptyStatus(): PlcStatus {
    return {
      link: this.link ?? 'DISCONNECTED',
      running: false,
      step: 'IDLE',
      out1: false,
      out2: false,
      stepElapsedMs: 0,
      stepPresetMs: 0,
      presets: { t1: 0, wait: 0, t2: 0 },
      analog: { variacV: 0, currentA: 0, powerW: 0, frequencyHz: 0, powerFactor: 0, variacSetV: 0 },
      contactors: { c1: false, c7: false },
      testSelect: 0,
      sideSelect: 0,
      heartbeat: this.heartbeat ?? 0,
      timestamp: Date.now(),
    };
  }
}
