import { BookOpen, Download, Plug, PlugZap, Radio, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Page, PageHeader } from '@/components/layout/Page';
import { Button, Lamp, Panel, TextField } from '@/components/ui';
import { deltaToModbus, parseDeltaAddress } from '@/config/tags';
import { clockTime, cn, hex } from '@/lib/format';

/**
 * Hidden diagnostics page (/plc-test): raw read/write of single PLC devices
 * over Modbus TCP via server/modbus-bridge.mjs. Not linked from the app.
 */

type Kind = 'register' | 'coil' | 'input' | 'float32';

interface Target {
  device: string;
  kind: Kind;
  address: number;
}

interface BridgeStatus {
  connected: boolean;
  target: { host: string; port: number; unitId: number } | null;
}

interface LogEntry {
  id: number;
  at: number;
  ok: boolean;
  text: string;
}

const SETTINGS_KEY = 'plc-test.connection';

/** "D200" / "M100" / "Y0" / "X0" — a bare number is taken as a D register. */
function resolveTarget(input: string): Target {
  const raw = input.trim().toUpperCase();
  if (!raw) throw new Error('Enter a register, e.g. D200');
  const device = /^\d+$/.test(raw) ? `D${raw}` : raw;
  const { area } = parseDeltaAddress(device);
  const kind: Kind = area === 'D' ? 'register' : area === 'X' ? 'input' : 'coil';
  return { device, kind, address: deltaToModbus(device) };
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
    throw new Error('Bridge not reachable — start it with `npm run bridge`');
  }
  const data = await res.json().catch(() => ({ error: `Bridge error (HTTP ${res.status}) — is \`npm run bridge\` running?` }));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    return { host: s.host ?? '192.168.1.5', port: s.port ?? '502', unitId: s.unitId ?? '1' };
  } catch {
    return { host: '192.168.1.5', port: '502', unitId: '1' };
  }
}

/**
 * Split a decimal number into the two 16-bit words of a Delta float32.
 * Low half goes in D(n), high half in D(n+1) — same order the bridge reads.
 */
function floatToWords(value: number): { low: number; high: number } {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value);
  return { high: view.getUint16(0), low: view.getUint16(2) };
}

/** "D426" → "D427" */
const nextD = (device: string) => `D${parseDeltaAddress(device).index + 1}`;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function PlcTestPage() {
  const [settings, setSettings] = useState(loadSettings);
  const [status, setStatus] = useState<BridgeStatus>({ connected: false, target: null });
  const [bridgeUp, setBridgeUp] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const [writeAddr, setWriteAddr] = useState('D200');
  const [writeValue, setWriteValue] = useState('');
  const [writeAsFloat, setWriteAsFloat] = useState(false);
  const [readAsFloat, setReadAsFloat] = useState(false);
  const [readAddr, setReadAddr] = useState('D200');
  const [reading, setReading] = useState<{ target: Target; value: number; at: number } | null>(null);
  const [live, setLive] = useState(false);

  const [log, setLog] = useState<LogEntry[]>([]);
  const logId = useRef(0);
  const addLog = useCallback((ok: boolean, text: string) => {
    setLog((l) => [{ id: ++logId.current, at: Date.now(), ok, text }, ...l].slice(0, 50));
  }, []);

  useEffect(() => {
    api<BridgeStatus>('status')
      .then((s) => {
        setStatus(s);
        setBridgeUp(true);
      })
      .catch(() => setBridgeUp(false));
  }, []);

  const handleError = (e: unknown, prefix: string) => {
    addLog(false, `${prefix}: ${errMsg(e)}`);
    // The bridge reports link state with every error.
    api<BridgeStatus>('status')
      .then((s) => {
        setStatus(s);
        setBridgeUp(true);
      })
      .catch(() => setBridgeUp(false));
  };

  const connect = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable — settings just won't be remembered */
    }
    try {
      const s = await api<BridgeStatus>('connect', {
        host: settings.host,
        port: Number(settings.port),
        unitId: Number(settings.unitId),
      });
      setStatus(s);
      setBridgeUp(true);
      addLog(true, `Connected to ${settings.host}:${settings.port} (unit ${settings.unitId})`);
    } catch (err) {
      handleError(err, 'Connect failed');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setLive(false);
    try {
      setStatus(await api<BridgeStatus>('disconnect', {}));
      addLog(true, 'Disconnected');
    } catch (err) {
      handleError(err, 'Disconnect failed');
    }
  };

  const doWrite = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const t = resolveTarget(writeAddr);
      if (t.kind === 'input') throw new Error(`${t.device} is a physical input — read-only`);
      if (writeAsFloat) {
        if (t.kind !== 'register') throw new Error('Float needs a D register, e.g. D426');
        const f = Number(writeValue.trim());
        if (writeValue.trim() === '' || !Number.isFinite(f)) throw new Error('Value must be a number, e.g. 433.5');
        const { low, high } = floatToWords(f);
        await api('write', { kind: 'register', address: t.address, value: low });
        await api('write', { kind: 'register', address: t.address + 1, value: high });
        addLog(true, `WRITE ${t.device}+${nextD(t.device)} (Modbus ${t.address}+${t.address + 1}) ← ${f} (float)`);
        return;
      }
      const v = Number(writeValue.trim());
      if (writeValue.trim() === '' || !Number.isInteger(v)) throw new Error('Value must be a whole number');
      if (t.kind === 'coil' && v !== 0 && v !== 1) throw new Error(`${t.device} is a bit — write 0 or 1`);
      if (t.kind === 'register' && (v < -32768 || v > 65535)) throw new Error('Register value must be -32768 … 65535');
      await api('write', { kind: t.kind, address: t.address, value: v });
      addLog(true, `WRITE ${t.device} (Modbus ${t.address}) ← ${v}`);
    } catch (err) {
      handleError(err, 'Write failed');
    }
  };

  const readOnce = useCallback(
    async (quiet = false) => {
      try {
        let t = resolveTarget(readAddr);
        if (readAsFloat) {
          if (t.kind !== 'register') throw new Error('Float needs a D register, e.g. D310');
          t = { ...t, kind: 'float32' };
        }
        const { value } = await api<{ value: number }>('read', { kind: t.kind, address: t.address });
        setReading({ target: t, value, at: Date.now() });
        const name = t.kind === 'float32' ? `${t.device}+${nextD(t.device)}` : t.device;
        if (!quiet) addLog(true, `READ ${name} (Modbus ${t.address}) → ${value}${t.kind === 'float32' ? ' (float)' : ''}`);
        return true;
      } catch (err) {
        handleError(err, 'Read failed');
        return false;
      }
    },
    [readAddr, readAsFloat, addLog],
  );

  const doRead = (e: FormEvent) => {
    e.preventDefault();
    void readOnce();
  };

  // Live mode: poll the read address every 500 ms, stop on first error.
  useEffect(() => {
    if (!live) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const ok = await readOnce(true);
      if (stopped) return;
      if (!ok) return setLive(false);
      timer = setTimeout(tick, 500);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [live, readOnce]);

  const connected = status.connected;
  const signed = reading && reading.target.kind === 'register' && reading.value > 32767 ? reading.value - 65536 : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Page>
        <PageHeader
          code="DIAG · MODBUS TCP"
          title="PLC Read / Write Test"
          subtitle="Read and write single PLC registers over Ethernet. Hidden page — not linked from the app."
          aside={
            <div className="flex items-center gap-2.5 text-xs">
              <Lamp on={connected} color={connected ? 'ok' : 'fault'} pulse={connected} />
              <span className="label-tech text-[13px]">
                {bridgeUp === false ? 'Bridge offline' : connected ? `Online · ${status.target?.host}` : 'Not connected'}
              </span>
            </div>
          }
        />

        {bridgeUp === false && (
          <Panel tone="fault" tag="ERR" title="Bridge not running">
            <p className="text-sm text-fg-muted">
              This page talks to the PLC through a small Node server. Stop Vite and run{' '}
              <code className="num text-fg">npm run dev:plc</code> (starts both), or run{' '}
              <code className="num text-fg">npm run bridge</code> in a second terminal, then reload.
            </p>
          </Panel>
        )}

        <Panel tag="01" title="Connection">
          <form onSubmit={connect} className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
            <TextField
              label="PLC IP address"
              mono
              value={settings.host}
              onChange={(e) => setSettings({ ...settings, host: e.target.value })}
              disabled={connected}
              placeholder="192.168.1.5"
            />
            <TextField
              label="Port"
              mono
              inputMode="numeric"
              value={settings.port}
              onChange={(e) => setSettings({ ...settings, port: e.target.value })}
              disabled={connected}
            />
            <TextField
              label="Unit ID"
              mono
              inputMode="numeric"
              value={settings.unitId}
              onChange={(e) => setSettings({ ...settings, unitId: e.target.value })}
              disabled={connected}
            />
            {connected ? (
              <Button variant="outline" icon={<Plug className="size-4" />} onClick={disconnect}>
                Disconnect
              </Button>
            ) : (
              <Button type="submit" variant="primary" disabled={busy} icon={<PlugZap className="size-4" />}>
                {busy ? 'Connecting…' : 'Connect'}
              </Button>
            )}
          </form>
        </Panel>

        <div className="grid gap-5 md:grid-cols-2">
          <Panel tag="02" title="Write">
            <form onSubmit={doWrite} className="flex flex-col gap-4">
              <TextField
                label="Register"
                mono
                value={writeAddr}
                onChange={(e) => setWriteAddr(e.target.value)}
                placeholder="D200"
                hint="D200 = word register · M200 = bit (0/1)"
              />
              <FloatToggle checked={writeAsFloat} onChange={setWriteAsFloat} device={writeAddr} />
              <TextField
                label="Value"
                mono
                inputMode={writeAsFloat ? 'decimal' : 'numeric'}
                value={writeValue}
                onChange={(e) => setWriteValue(e.target.value)}
                placeholder={writeAsFloat ? '433.5' : '1234'}
              />
              <Button type="submit" variant="primary" disabled={!connected} icon={<Upload className="size-4" />}>
                Write
              </Button>
            </form>
          </Panel>

          <Panel
            tag="03"
            title="Read"
            aside={
              <label className={cn('label-tech flex cursor-pointer items-center gap-2 text-[13px]', !connected && 'opacity-40')}>
                <input
                  type="checkbox"
                  className="accent-[#a78bfa]"
                  checked={live}
                  disabled={!connected}
                  onChange={(e) => setLive(e.target.checked)}
                />
                <Radio className="size-3.5" /> Live (0.5 s)
              </label>
            }
          >
            <form onSubmit={doRead} className="flex flex-col gap-4">
              <TextField
                label="Register"
                mono
                value={readAddr}
                onChange={(e) => setReadAddr(e.target.value)}
                placeholder="D200"
                hint="D = word · M / Y = bit · X = input (read-only)"
              />
              <FloatToggle checked={readAsFloat} onChange={setReadAsFloat} device={readAddr} />
              <div className="flex min-h-[88px] flex-col justify-center rounded-[2px] border border-line bg-ink-900/80 px-4 py-3">
                {reading ? (
                  <>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="label-tech text-[13px] text-fg-dim">
                        {reading.target.kind === 'float32'
                          ? `${reading.target.device} + ${nextD(reading.target.device)} · FLOAT`
                          : reading.target.device}{' '}
                        · Modbus {reading.target.address}
                      </span>
                      <span className="num text-[13px] text-fg-dim">{clockTime(reading.at)}</span>
                    </div>
                    <div className="num mt-1 text-3xl text-fg">
                      {reading.target.kind === 'float32' ? +reading.value.toFixed(3) : reading.value}
                    </div>
                    {reading.target.kind === 'register' && (
                      <div className="num mt-1 text-[13px] text-fg-dim">
                        0x{hex(reading.value)}
                        {signed !== null && <> · signed {signed}</>}
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-sm text-fg-dim">No value read yet</span>
                )}
              </div>
              <Button type="submit" variant="primary" disabled={!connected || live} icon={<Download className="size-4" />}>
                Read
              </Button>
            </form>
          </Panel>
        </div>

        <Panel tag="04" title="Activity" bodyClassName="p-0">
          {log.length === 0 ? (
            <p className="p-4 text-sm text-fg-dim">Nothing yet.</p>
          ) : (
            <ul className="max-h-56 overflow-y-auto">
              {log.map((l) => (
                <li key={l.id} className="num flex gap-3 border-b border-line px-4 py-1.5 text-[14px] last:border-0">
                  <span className="text-fg-dim">{clockTime(l.at)}</span>
                  <span className={l.ok ? 'text-fg' : 'text-fault'}>{l.text}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <RegisterGuide />
      </Page>
    </div>
  );
}

/** "Float (2 registers)" checkbox — shows which pair will be used. */
function FloatToggle({ checked, onChange, device }: { checked: boolean; onChange: (v: boolean) => void; device: string }) {
  let pair = '';
  try {
    const t = resolveTarget(device);
    if (t.kind === 'register') pair = `${t.device} + ${nextD(t.device)}`;
  } catch {
    /* invalid address — the field shows the error on submit */
  }
  return (
    <label className="label-tech flex cursor-pointer items-center gap-2 text-[13px]">
      <input type="checkbox" className="accent-[#a78bfa]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Float (2 registers){checked && pair && <span className="num normal-case tracking-normal text-fg-dim">· {pair}</span>}
    </label>
  );
}

const GUIDE: Array<{ device: string; access: string; what: string; safe: 'safe' | 'care' | 'avoid' }> = [
  { device: 'D200 – D299', access: 'Read / Write', what: 'Not used by this app or (likely) the ladder. Best place to test writing.', safe: 'safe' },
  { device: 'M200 – M299', access: 'Read / Write', what: 'Free internal bits for testing writes of 0 / 1.', safe: 'safe' },
  { device: 'M1000', access: 'Read', what: 'ON (1) whenever the PLC is in RUN mode. Good first read test.', safe: 'safe' },
  { device: 'M1013', access: 'Read', what: '1-second clock pulse — toggles 0/1. Turn on Live to watch it flip.', safe: 'safe' },
  { device: 'X0 – X7', access: 'Read only', what: 'Physical inputs (octal numbering: X0…X7, X10…). Shows real switch states.', safe: 'safe' },
  { device: 'D100, D101', access: 'Read / Write', what: 'Test select / side select used by this app.', safe: 'care' },
  { device: 'D110 – D112', access: 'Read / Write', what: 'T1, wait and T2 preset times (seconds) used by this app.', safe: 'care' },
  { device: 'D120, D121, M110', access: 'Read', what: 'Proposed step / elapsed / running read-backs — only meaningful once added to the ladder.', safe: 'care' },
  { device: 'M100, M101', access: 'Write', what: 'START / STOP pulses — writing 1 to M100 can start the real sequence.', safe: 'avoid' },
  { device: 'Y0, Y1', access: 'Read / Write', what: 'Physical outputs (contactors). Writing energises real hardware. Read only.', safe: 'avoid' },
  { device: 'D1000 – D1999, M1000 – M1999', access: 'Mostly read', what: 'System registers (watchdog, Ethernet / comm settings, flags). Do not write.', safe: 'avoid' },
];

const safeStyle = {
  safe: 'text-ok border-ok/50',
  care: 'text-amber border-amber/50',
  avoid: 'text-fault border-fault/50',
} as const;
const safeLabel = { safe: 'Safe', care: 'Caution', avoid: 'Avoid writing' } as const;

function RegisterGuide() {
  return (
    <Panel tag="05" title={<span className="inline-flex items-center gap-2"><BookOpen className="size-4" /> Register guide</span>}>
      <div className="mb-4 grid gap-3 text-sm text-fg-muted md:grid-cols-3">
        <p>
          <b className="text-fg">D registers</b> (D0, D200…) hold 16-bit numbers, 0 – 65535 (or −32768 – 32767 signed). Use
          these for values like times and setpoints.
        </p>
        <p>
          <b className="text-fg">M relays</b> are internal on/off bits (0 or 1). <b className="text-fg">X</b> are physical
          inputs (read only), <b className="text-fg">Y</b> are physical outputs.
        </p>
        <p>
          This page converts names to Modbus addresses for a Delta DVP-SE (D0 → 4096, M0 → 2048, X0 → 1024, Y0 → 1280). Typing
          just <span className="num text-fg">200</span> means <span className="num text-fg">D200</span>.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-[15px]">
          <thead>
            <tr className="label-tech border-b border-line text-[13px] text-fg-dim">
              <th className="py-2 pr-4 font-normal">Device</th>
              <th className="py-2 pr-4 font-normal">Access</th>
              <th className="py-2 pr-4 font-normal">What it is</th>
              <th className="py-2 font-normal">Writing</th>
            </tr>
          </thead>
          <tbody>
            {GUIDE.map((g) => (
              <tr key={g.device} className="border-b border-line last:border-0">
                <td className="num whitespace-nowrap py-2 pr-4 text-fg">{g.device}</td>
                <td className="whitespace-nowrap py-2 pr-4 text-fg-muted">{g.access}</td>
                <td className="py-2 pr-4 text-fg-muted">{g.what}</td>
                <td className="py-2">
                  <span className={cn('label-tech whitespace-nowrap rounded-[2px] border px-1.5 py-px text-[12px]', safeStyle[g.safe])}>
                    {safeLabel[g.safe]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
