/**
 * Minimal Modbus-TCP bridge for the /plc-test page.
 *
 * Browsers cannot open raw TCP sockets, so this process holds the Modbus
 * connection to the PLC and exposes a tiny JSON API on http://127.0.0.1:8502.
 * Vite proxies /api → here (see vite.config.ts).
 *
 * All addresses are 0-based Modbus protocol addresses. The page converts
 * Delta device names (D100, M100, Y0, X0) with deltaToModbus() before calling.
 *
 *   GET  /api/plc/status
 *   POST /api/plc/connect     { host, port?, unitId? }
 *   POST /api/plc/disconnect
 *   POST /api/plc/read        { kind: 'register'|'coil'|'input'|'float32'|'edges', address }
 *        kind 'edges' = how many times that coil went OFF → ON since the bridge started
 *        watching it (it is checked every 20 ms, so short PLC pulses are not missed)
 *   POST /api/plc/read-many   { items: [{ kind, address }, ...] }  → { values: [n | null, ...] }
 *   POST /api/plc/write       { kind: 'register'|'coil', address, value }
 *
 * Run: npm run bridge   (or npm run dev:plc to start it together with Vite)
 */
import http from 'node:http';
import ModbusRTU from 'modbus-serial';

// Well away from Vite's 5173+ range: Vite walks up to the next free port when
// 5173 is taken, and must never land on the bridge's port.
const PORT = Number(process.env.BRIDGE_PORT ?? 8502);
const TIMEOUT_MS = 2000;

let client = new ModbusRTU();
let target = null; // { host, port, unitId } while connected

function isConnected() {
  return target !== null && client.isOpen;
}

async function connect({ host, port = 502, unitId = 1 }) {
  if (typeof host !== 'string' || !host.trim()) throw new Error('host is required');
  await disconnect();
  client = new ModbusRTU();
  client.setTimeout(TIMEOUT_MS);
  await client.connectTCP(host.trim(), { port: Number(port) });
  client.setID(Number(unitId));
  target = { host: host.trim(), port: Number(port), unitId: Number(unitId) };
}

async function disconnect() {
  target = null;
  if (client.isOpen) await new Promise((resolve) => client.close(resolve));
}

function checkAddress(address) {
  if (!Number.isInteger(address) || address < 0 || address > 65535) {
    throw new Error(`Invalid Modbus address: ${address}`);
  }
}

/**
 * float32 = a decimal number (e.g. 433.27) stored in TWO 16-bit registers.
 * Delta puts the low half in D(n) and the high half in D(n+1).
 */
function wordsToFloat(low, high) {
  const buf = Buffer.alloc(4);
  buf.writeUInt16BE(high, 0);
  buf.writeUInt16BE(low, 2);
  return buf.readFloatBE(0);
}

/**
 * Short PLC pulses (e.g. a "test complete" bit ON for a few scans) fall between
 * the UI's 0.5 s reads. The bridge watches those bits itself every 20 ms and
 * counts each OFF → ON change; the UI compares the count before and after.
 */
const WATCH_MS = 20;
const watched = new Map(); // address -> { last: boolean, count: number }
let watching = false;

async function watchLoop() {
  if (watching) return;
  watching = true;
  while (watched.size) {
    if (isConnected()) {
      for (const [address, w] of watched) {
        try {
          const on = Boolean((await client.readCoils(address, 1)).data[0]);
          if (on && !w.last) w.count++;
          w.last = on;
        } catch {
          // one missed read is fine; the next one 20 ms later catches up
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, WATCH_MS));
  }
  watching = false;
}

async function edges(address) {
  if (!watched.has(address)) {
    const on = Boolean((await client.readCoils(address, 1)).data[0]);
    watched.set(address, { last: on, count: 0 });
    void watchLoop();
  }
  return watched.get(address).count;
}

async function read({ kind, address }) {
  if (!isConnected()) throw new Error('Not connected to PLC');
  checkAddress(address);
  if (kind === 'edges') return edges(address);
  if (kind === 'float32') {
    const res = await client.readHoldingRegisters(address, 2); // FC03, 2 words
    return wordsToFloat(res.data[0], res.data[1]);
  }
  if (kind === 'register') {
    const res = await client.readHoldingRegisters(address, 1); // FC03
    return res.data[0];
  }
  if (kind === 'coil') {
    const res = await client.readCoils(address, 1); // FC01
    return res.data[0] ? 1 : 0;
  }
  if (kind === 'input') {
    const res = await client.readDiscreteInputs(address, 1); // FC02
    return res.data[0] ? 1 : 0;
  }
  throw new Error(`Unknown kind: ${kind}`);
}

/** Reads a list of items in one HTTP call. A failed item comes back as null. */
async function readMany({ items }) {
  if (!Array.isArray(items)) throw new Error('items must be an array');
  const values = [];
  for (const item of items) {
    try {
      values.push(await read(item));
    } catch (err) {
      if (!isConnected()) throw err; // link dropped — fail the whole call
      values.push(null);
    }
  }
  return values;
}

async function write({ kind, address, value }) {
  if (!isConnected()) throw new Error('Not connected to PLC');
  checkAddress(address);
  if (kind === 'register') {
    if (!Number.isInteger(value) || value < -32768 || value > 65535) {
      throw new Error('Register value must be an integer from -32768 to 65535');
    }
    await client.writeRegister(address, value & 0xffff); // FC06
    return;
  }
  if (kind === 'coil') {
    await client.writeCoil(address, Boolean(value)); // FC05
    return;
  }
  throw new Error(`Cannot write to ${kind} (read-only)`);
}

function status() {
  return { connected: isConnected(), target };
}

/** Modbus exceptions from the PLC arrive as { modbusCode, message }. */
function errorMessage(err) {
  const names = { 1: 'Illegal function', 2: 'Illegal data address', 3: 'Illegal data value', 4: 'Slave device failure' };
  if (err && typeof err === 'object' && 'modbusCode' in err) {
    return `PLC rejected request: ${names[err.modbusCode] ?? 'exception'} (code ${err.modbusCode})`;
  }
  const code = err && typeof err === 'object' && 'code' in err ? err.code : undefined;
  const hints = {
    ETIMEDOUT: 'No reply from that IP — check the cable, the PLC IP, and that the PC Ethernet port is on the same subnet',
    EHOSTUNREACH: 'IP not reachable — the PC has no network route to it (Ethernet unplugged or wrong subnet)',
    ENETUNREACH: 'Network unreachable — the PC Ethernet port has no IP on the PLC subnet',
    ECONNREFUSED: 'Device answered but refused port 502 — Modbus TCP may be disabled on the PLC, or wrong IP/port',
    ECONNRESET: 'Connection dropped by the PLC',
  };
  if (code && hints[code]) return `${hints[code]} (${code})`;
  if (err instanceof Error && /timed out/i.test(err.message)) return hints.ETIMEDOUT;
  return err instanceof Error ? err.message : String(err);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const routes = {
  'GET /api/plc/status': async () => status(),
  'POST /api/plc/connect': async (body) => (await connect(body), status()),
  'POST /api/plc/disconnect': async () => (await disconnect(), status()),
  'POST /api/plc/read': async (body) => ({ value: await read(body) }),
  'POST /api/plc/read-many': async (body) => ({ values: await readMany(body) }),
  'POST /api/plc/write': async (body) => (await write(body), { ok: true }),
};

http
  .createServer(async (req, res) => {
    const handler = routes[`${req.method} ${req.url?.split('?')[0]}`];
    if (!handler) return send(res, 404, { error: 'Not found' });
    try {
      const body = req.method === 'POST' ? await readBody(req) : {};
      send(res, 200, await handler(body));
    } catch (err) {
      // A dropped socket leaves the client unusable; report it as disconnected.
      if (!client.isOpen) target = null;
      send(res, 400, { error: errorMessage(err), ...status() });
    }
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`[modbus-bridge] listening on http://127.0.0.1:${PORT}`);
  });
