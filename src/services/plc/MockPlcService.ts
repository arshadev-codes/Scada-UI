import { addr, SEQ_STEP_CODE } from '@/config/tags';
import { TEST_DEFINITIONS } from '@/config/tests';
import { nllAddr } from '@/tests/no-load-loss/tags';
import { ROUND_TAGS, mbtAddr } from '@/tests/magnetic-balance/tags';
import {
  PlcNotConnectedError,
  type AnalogReadings,
  type LinkState,
  type PlcService,
  type PlcStatus,
  type ReadItem,
  type SeqStep,
  type StatusListener,
} from './PlcService';

const SCAN_MS = 50;
const EMIT_MS = 200;
const CONNECT_MS = 900;

const STEP_FROM_CODE: Record<number, SeqStep> = Object.fromEntries(
  Object.entries(SEQ_STEP_CODE).map(([k, v]) => [v, k as SeqStep]),
);

interface MockOptions {
  /** Simulated round-trip latency for reads/writes, ms (min..max). */
  latency?: [number, number];
}

/**
 * Simulates the DVP-12SE running the test-sequence ladder program.
 *
 * It keeps a memory image of coils and registers addressed exactly like the
 * real Modbus map, and a scan loop that acts on that memory the way the
 * ladder would: a rising edge on START latches the sequence, STOP aborts it
 * (or resets the step to IDLE when idle), and Y0/Y1 follow the step.
 * Everything the UI displays is read back from this memory.
 */
export class MockPlcService implements PlcService {
  private coils = new Map<number, boolean>();
  private registers = new Map<number, number>();
  /** float32 values, keyed by the first register address of the pair */
  private floats = new Map<number, number>();
  private listeners = new Set<StatusListener>();

  private link: LinkState = 'DISCONNECTED';
  private heartbeat = 0;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private emitTimer: ReturnType<typeof setInterval> | null = null;
  private connectPromise: Promise<void> | null = null;

  private stepStartedAt = 0;
  private lastScanAt = 0;
  /** Simulated analyser state (float, not register-limited). */
  private analog: Omit<AnalogReadings, 'variacSetV'> = {
    variacV: 0,
    currentA: 0,
    powerW: 0,
    frequencyHz: 0,
    powerFactor: 0,
  };
  private prevStart = false;
  private prevStop = false;
  /** Magnetic Balance test in progress (all three rounds), start time, rounds stored */
  private mbt: { startedAt: number; stored: number } | null = null;
  private prevMbtStart = false;
  private prevMbtStop = false;
  private readonly latency: [number, number];

  constructor(opts: MockOptions = {}) {
    this.latency = opts.latency ?? [15, 60];
    this.setRegister(addr('T1_PRESET'), 10);
    this.setRegister(addr('WAIT_PRESET'), 3);
    this.setRegister(addr('T2_PRESET'), 5);
    this.setRegister(addr('SEQ_STEP'), SEQ_STEP_CODE.IDLE);
  }

  // ── PlcService ────────────────────────────────────────────────────────────

  connect(): Promise<void> {
    if (this.link === 'ONLINE') return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;

    this.link = 'CONNECTING';
    this.startEmitter();
    this.emit();

    this.connectPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        this.link = 'ONLINE';
        this.connectPromise = null;
        this.startScan();
        this.emit();
        resolve();
      }, CONNECT_MS);
    });
    return this.connectPromise;
  }

  async disconnect(): Promise<void> {
    this.stopTimers();
    this.forceOutputsOff();
    this.link = 'DISCONNECTED';
    this.emit();
  }

  isConnected(): boolean {
    return this.link === 'ONLINE';
  }

  async writeCoil(address: number, value: boolean): Promise<void> {
    await this.roundTrip();
    this.setCoilCounting(address, value);
  }

  /** OFF → ON counts per coil, for the 'edges' read kind. */
  private edgeCounts = new Map<number, number>();
  private setCoilCounting(address: number, value: boolean): void {
    if (value && !this.getCoil(address)) this.edgeCounts.set(address, (this.edgeCounts.get(address) ?? 0) + 1);
    this.coils.set(address, value);
  }

  async writeRegister(address: number, value: number): Promise<void> {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      throw new RangeError(`Register value out of range (0–65535): ${value}`);
    }
    await this.roundTrip();
    this.registers.set(address, value);
  }

  async readStatus(): Promise<PlcStatus> {
    await this.roundTrip();
    return this.snapshot();
  }

  async readValues(items: ReadItem[]): Promise<Array<number | null>> {
    await this.roundTrip();
    return items.map(({ kind, address }) => {
      if (kind === 'coil' || kind === 'input') return this.getCoil(address) ? 1 : 0;
      if (kind === 'float32') return this.floats.get(address) ?? 0;
      if (kind === 'edges') return this.edgeCounts.get(address) ?? 0;
      return this.getRegister(address);
    });
  }

  subscribe(cb: StatusListener): () => void {
    this.listeners.add(cb);
    cb(this.snapshot());
    return () => {
      this.listeners.delete(cb);
    };
  }

  // ── Simulated ladder scan ─────────────────────────────────────────────────

  private scan = (): void => {
    const now = performance.now();
    this.simulateAnalog(now);
    this.simulateMbt(now);
    const start = this.getCoil(addr('START'));
    const stop = this.getCoil(addr('STOP'));
    const startEdge = start && !this.prevStart;
    const stopEdge = stop && !this.prevStop;
    this.prevStart = start;
    this.prevStop = stop;

    // Pulse coils self-reset after one scan, like an SET/RST pair in ladder.
    if (start) this.coils.set(addr('START'), false);
    if (stop) this.coils.set(addr('STOP'), false);

    const step = this.currentStep();
    const running = step === 'OUT1' || step === 'WAIT' || step === 'OUT2';

    if (stopEdge) {
      this.setStep(running ? 'ABORTED' : 'IDLE', now);
      return;
    }

    if (startEdge && !running) {
      this.setStep('OUT1', now);
      return;
    }

    if (!running) return;

    const elapsed = now - this.stepStartedAt;
    this.setRegister(addr('STEP_ELAPSED'), Math.min(0xffff, Math.floor(elapsed / 100)));

    if (elapsed >= this.presetMsFor(step)) {
      const next: Record<'OUT1' | 'WAIT' | 'OUT2', SeqStep> = {
        OUT1: 'WAIT',
        WAIT: 'OUT2',
        OUT2: 'COMPLETE',
      };
      this.setStep(next[step], now);
    }
  };

  private setStep(step: SeqStep, now: number): void {
    this.setRegister(addr('SEQ_STEP'), SEQ_STEP_CODE[step]);
    this.setRegister(addr('STEP_ELAPSED'), 0);
    this.stepStartedAt = now;
    this.coils.set(addr('OUT1_STATUS'), step === 'OUT1');
    this.coils.set(addr('OUT2_STATUS'), step === 'OUT2');
    this.coils.set(addr('RUNNING'), step === 'OUT1' || step === 'WAIT' || step === 'OUT2');
    this.emit(); // push transitions immediately, don't wait for the next frame
  }

  /**
   * Analyser simulation: the variac motor ramps toward VARIAC_SET while Y0 is
   * on and runs down when it drops. Current/power follow the test type —
   * shorted-winding tests draw high current, open-winding tests only
   * magnetising current. Numbers are illustrative, not physical.
   */
  private simulateAnalog(now: number): void {
    const dt = this.lastScanAt ? Math.min(0.5, (now - this.lastScanAt) / 1000) : 0;
    this.lastScanAt = now;
    // Y0 for the normal sequence, or C1 + C7 closed by the No-Load Loss test
    const y0 = this.getCoil(addr('OUT1_STATUS'));
    const nll = this.nllClosed();
    const energised = y0 || nll;
    const target = y0 ? this.getRegister(addr('VARIAC_SET')) : nll ? this.getRegister(nllAddr('DIMMER_SET')) : 0;
    const tau = energised ? 0.9 : 0.3;
    const a = this.analog;
    a.variacV += (target - a.variacV) * (1 - Math.exp(-dt / tau));
    if (!energised && a.variacV < 0.5) a.variacV = 0;

    const code = this.getRegister(addr('TEST_SELECT'));
    const shorted = !nll && TEST_DEFINITIONS.find((t) => t.plcCode === code)?.otherWinding === 'short';
    const jitter = (k: number) => 1 + (Math.random() - 0.5) * k;
    const v = a.variacV * (a.variacV > 0 ? jitter(0.004) : 1);

    if (v <= 0) {
      a.currentA = 0;
      a.powerW = 0;
      a.frequencyHz = 0;
      a.powerFactor = 0;
      this.simulateNllMeter(0, jitter);
      return;
    }
    a.currentA = (shorted ? v * 0.065 : v * 0.0045) * jitter(0.01);
    a.powerFactor = (shorted ? 0.21 : 0.16) * jitter(0.02);
    a.powerW = Math.sqrt(3) * v * a.currentA * a.powerFactor;
    a.frequencyHz = 50 + Math.sin(now / 1700) * 0.04 + (Math.random() - 0.5) * 0.01;
    a.variacV = Math.max(0, a.variacV);
    this.simulateNllMeter(v, jitter);
  }

  private nllClosed(): boolean {
    return this.getCoil(nllAddr('C1')) && this.getCoil(nllAddr('C7'));
  }

  /** Fake power-analyzer values in the No-Load Loss float registers. */
  private simulateNllMeter(v: number, jitter: (k: number) => number): void {
    if (this.mbt) return; // the MBT round owns the meter registers
    const set = (name: Parameters<typeof nllAddr>[0], value: number) => this.floats.set(nllAddr(name), value);
    set('DIMMER_VOLTAGE', v);
    for (const n of [1, 2, 3] as const) {
      const vp = v * jitter(0.006);
      const ip = vp * 0.0045 * jitter(0.02);
      set(`V${n}`, vp);
      set(`I${n}`, ip);
      set(`P${n}`, vp * ip * 0.16);
    }
    set('FREQUENCY', v > 0 ? 50 + (Math.random() - 0.5) * 0.02 : 0);
  }

  /**
   * Magnetic Balance: with SELECT (M608) on, one START runs RY, YB, BR in turn
   * like the PLC would. Each round raises one pair to 230 V (3 s), holds (6 s),
   * stores the three line voltages in D408…D424, runs down (1.5 s) and waits
   * 2 s. The two other pairs share the applied voltage. STOP (M611) ends it.
   */
  private simulateMbt(now: number): void {
    const start = this.getCoil(mbtAddr('START'));
    const stop = this.getCoil(mbtAddr('STOP'));
    if (start && !this.prevMbtStart && !this.mbt && this.getCoil(mbtAddr('SELECT'))) this.mbt = { startedAt: now, stored: 0 };
    if (stop && !this.prevMbtStop) this.endMbt();
    this.prevMbtStart = start;
    this.prevMbtStop = stop;
    if (!this.mbt) return;

    const RAMP = 3;
    const HOLD = 6;
    const DOWN = 1.5;
    const GAP = 2;
    const cycle = RAMP + HOLD + DOWN + GAP;
    const t0 = (now - this.mbt.startedAt) / 1000;
    const e = Math.floor(t0 / cycle);
    if (e > 2) return this.endMbt(true);
    const t = t0 - e * cycle;
    const k = t < RAMP ? t / RAMP : t < RAMP + HOLD ? 1 : t < RAMP + HOLD + DOWN ? 1 - (t - RAMP - HOLD) / DOWN : 0;

    const shares = e === 1 ? [0.5, 1, 0.497] : e === 0 ? [1, 0.703, 0.296] : [0.298, 0.701, 1];
    const jitter = () => 1 + (Math.random() - 0.5) * 0.004;
    const applied = 230 * k * (k === 1 ? jitter() : 1);
    const v = shares.map((sh, i) => applied * sh * (i === e ? 1 : jitter()));
    (['V1', 'V2', 'V3'] as const).forEach((n, i) => this.floats.set(mbtAddr(n), v[i]));
    // End of hold: the PLC stores this round's readings
    if (t >= RAMP + HOLD - 0.5 && this.mbt.stored === e) {
      ROUND_TAGS[e].forEach((n, i) => this.floats.set(mbtAddr(n), v[i]));
      this.mbt.stored++;
    }
  }

  private endMbt(finished = false): void {
    // Like the PLC: a very short "test complete" pulse when all rounds are done
    if (finished && this.mbt) {
      this.setCoilCounting(mbtAddr('COMPLETE'), true);
      setTimeout(() => this.coils.set(mbtAddr('COMPLETE'), false), 50);
    }
    this.mbt = null;
    (['V1', 'V2', 'V3'] as const).forEach((n) => this.floats.set(mbtAddr(n), 0));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private snapshot(): PlcStatus {
    const step = this.currentStep();
    const timed = step === 'OUT1' || step === 'WAIT' || step === 'OUT2';
    const online = this.link === 'ONLINE';
    return {
      link: this.link,
      running: online && this.getCoil(addr('RUNNING')),
      step,
      out1: online && this.getCoil(addr('OUT1_STATUS')),
      out2: online && this.getCoil(addr('OUT2_STATUS')),
      stepElapsedMs: timed ? Math.max(0, performance.now() - this.stepStartedAt) : 0,
      stepPresetMs: timed ? this.presetMsFor(step) : 0,
      analog: online
        ? { ...this.analog, variacSetV: this.getRegister(addr('VARIAC_SET')) }
        : { variacV: 0, currentA: 0, powerW: 0, frequencyHz: 0, powerFactor: 0, variacSetV: 0 },
      contactors: {
        c1: online && this.getCoil(nllAddr('C1')),
        c7: online && this.getCoil(nllAddr('C7')),
      },
      presets: {
        t1: this.getRegister(addr('T1_PRESET')),
        wait: this.getRegister(addr('WAIT_PRESET')),
        t2: this.getRegister(addr('T2_PRESET')),
      },
      testSelect: this.getRegister(addr('TEST_SELECT')),
      sideSelect: this.getRegister(addr('SIDE_SELECT')),
      heartbeat: this.heartbeat,
      timestamp: Date.now(),
    };
  }

  private presetMsFor(step: SeqStep): number {
    switch (step) {
      case 'OUT1':
        return this.getRegister(addr('T1_PRESET')) * 1000;
      case 'WAIT':
        return this.getRegister(addr('WAIT_PRESET')) * 1000;
      case 'OUT2':
        return this.getRegister(addr('T2_PRESET')) * 1000;
      default:
        return 0;
    }
  }

  private currentStep(): SeqStep {
    return STEP_FROM_CODE[this.getRegister(addr('SEQ_STEP'))] ?? 'FAULT';
  }

  private getCoil(a: number): boolean {
    return this.coils.get(a) ?? false;
  }

  private getRegister(a: number): number {
    return this.registers.get(a) ?? 0;
  }

  private setRegister(a: number, v: number): void {
    this.registers.set(a, v);
  }

  private forceOutputsOff(): void {
    this.analog = { variacV: 0, currentA: 0, powerW: 0, frequencyHz: 0, powerFactor: 0 };
    this.coils.set(addr('OUT1_STATUS'), false);
    this.coils.set(addr('OUT2_STATUS'), false);
    this.coils.set(addr('RUNNING'), false);
    this.coils.set(nllAddr('C1'), false);
    this.coils.set(nllAddr('C7'), false);
    this.floats.clear();
    this.mbt = null;
    if (this.currentStep() !== 'IDLE') this.setRegister(addr('SEQ_STEP'), SEQ_STEP_CODE.ABORTED);
  }

  private emit(): void {
    this.heartbeat = (this.heartbeat + 1) & 0xffff;
    const status = this.snapshot();
    this.listeners.forEach((cb) => cb(status));
  }

  private startScan(): void {
    if (!this.scanTimer) this.scanTimer = setInterval(this.scan, SCAN_MS);
  }

  private startEmitter(): void {
    if (!this.emitTimer) this.emitTimer = setInterval(() => this.emit(), EMIT_MS);
  }

  private stopTimers(): void {
    if (this.scanTimer) clearInterval(this.scanTimer);
    if (this.emitTimer) clearInterval(this.emitTimer);
    this.scanTimer = null;
    this.emitTimer = null;
  }

  private roundTrip(): Promise<void> {
    if (this.link !== 'ONLINE') return Promise.reject(new PlcNotConnectedError());
    const [min, max] = this.latency;
    return new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
  }
}
