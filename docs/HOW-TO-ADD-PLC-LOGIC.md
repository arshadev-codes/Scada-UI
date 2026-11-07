# How to add PLC logic to the Transformer Test Bench app

Where to declare a PLC register, where the test logic goes, and how a value gets from the PLC to the screen.

## 1. The big picture: five layers

```
 Screen (what the operator sees)
   src/pages/InstrumentTestPage.tsx   ← WRM, Ratio, IR
   src/pages/TestExecutionPage.tsx    ← No-Load Loss, Magnetic Balance
        │  calls runXxxTest(o, { onReading, log }) on START, stopXxxTest() on STOP
        ▼
 Runner = THE TEST LOGIC (the sequence: pulse START, read, wait, decide)
   src/tests/<test>/run<Test>Test.ts
        │  uses tag NAMES only (WRM_TAGS.START, WRM_TAGS.HV_1 …)
        ▼
 Tags = WHERE YOU DECLARE REGISTERS (name → Delta address + kind)
   src/tests/<test>/tags.ts
        │
        ▼
 Helpers: run.read / run.pulse / run.sleep / run.check
   src/tests/shared/runtime.ts        (converts "D408" → Modbus address for you)
        ▼
 plc object: simulator OR real PLC (SIM / REAL PLC switch in the header)
   src/services/plc/index.ts  →  MockPlcService.ts | BridgePlcService.ts
        ▼
 server/modbus-bridge.mjs  →  Modbus TCP  →  Delta DVP-12SE
```

**Rule of thumb:** an address is written only in `tags.ts`. Logic is written only
in `run*Test.ts`. Pass/fail maths is written only in `calculation.ts`. Drawing is
written only in the `*Panel.tsx` and `*Visual.tsx` / `*Mimic.tsx` files.

Every test folder has the same four kinds of file:

| File | What goes in it |
|---|---|
| `tags.ts` | Every register or bit the test touches (declaring a register) |
| `run<Test>Test.ts` | The sequence logic: START, loop reading values, finish, STOP |
| `calculation.ts` | Pure maths: PASS/FAIL limits, corrections (no PLC calls) |
| `*Panel.tsx`, `*Visual.tsx` | What the screen shows (reads only the `Reading` object) |

---

## 2. Step 1: declare the register in `tags.ts`

Example: `src/tests/magnetic-balance/tags.ts` (real addresses).

```ts
export const MBT_TAGS = {
  START:    { device: 'M610', kind: 'coil',    description: 'MB TEST START (pulse)' },
  COMPLETE: { device: 'M612', kind: 'edges',   description: 'MB TEST COMPLETE (short pulse)' },
  R1_RY:    { device: 'D408', kind: 'float32', description: 'Round 1 · RY voltage, V' },
  // add yours here ↓
  MY_NEW:   { device: 'D430', kind: 'float32', description: 'What it is, unit' },
} as const;
```

- **`device`**: the address exactly as in ISPSoft (`M610`, `D408`, `Y5`, `X3`).
  The code converts it to Modbus for you (`deltaToModbus` in `src/config/tags.ts`).
- **The manager's Modbus list counts from 1**:
  - M bit = Modbus − 1 − 2048 (2649 → M600)
  - D register = Modbus − 1 − 4096 (4523 → D426)
- **X and Y are octal** on Delta PLCs: Y10 is fine, but Y8 or Y9 is an error.

**`kind`: pick one**

| kind | Use it for | Value you get |
|---|---|---|
| `coil` | M bits, Y outputs (read or write ON/OFF) | 0 / 1 |
| `input` | X inputs (read only) | 0 / 1 |
| `register` | One D register, whole number 0…65535 | integer |
| `float32` | Decimal number in **two** D registers (D408 + D409) | number |
| `edges` | A very short PLC pulse that the 0.5 s reads would miss | count of OFF→ON |

- float32 uses two registers, so the next float32 must be +2 (D408, D410, D412…).
- **Demo switch (instrument tests: WRM, Ratio, IR):** while **any** `device` in that
  test's tags file is `''`, the test plays DEMO data (`tagsReady()` in
  `runtime.ts`). Fill in **all** of them to go live.

There is no separate "initialise" file. Declaring the tag in `tags.ts` is all
the setup. If a register needs a starting value (a set-point, say), the runner
**writes it at the start of the test**. See Step 2 for how, and
`writeSetVoltage()` in `runNoLoadLossTest.ts` for a real example.

---

## 3. Step 2: use it in the runner (the logic)

Every instrument runner follows this shape (from
`src/tests/winding-resistance/runWindingResistanceTest.ts`, `fromPlc()`):

```ts
const run = createRunControl();                       // one per test (runtime.ts)
export const stopWindingResistanceTest = () => run.stop();

async function fromPlc(...) {
  await run.pulse(WRM_TAGS.START);                    // OFF → ON → OFF
  for (;;) {
    run.check();                                      // throws if STOP pressed
    const [temp, live, complete] =
      await run.read(WRM_TAGS, ['TEMP', 'LIVE', 'COMPLETE']);   // one Modbus trip
    cb.onReading?.({ ...values for the screen... });  // update the screen
    if (complete) break;                              // your condition
    await run.sleep(READ_EVERY_MS);                   // 500 ms, ends early on STOP
  }
}
```

**The tool box**

| You want to… | Write | Where it comes from |
|---|---|---|
| Read one or many values | `const [a, b] = await run.read(TAGS, ['A', 'B'])` | `tests/shared/runtime.ts` |
| Pulse a START/STOP bit | `await run.pulse(TAGS.START)` | `runtime.ts` |
| Turn a bit ON / OFF and hold it | `await plc.writeCoil(deltaToModbus(TAGS.X.device), true)` | `services/plc`, `config/tags` |
| Write a whole number to D | `await plc.writeRegister(deltaToModbus(TAGS.X.device), 120)` | same |
| Write a decimal (float32) | copy `writeFloat()` from `tests/no-load-loss/runNoLoadLossTest.ts` | low half → Dn, high half → Dn+1 |
| Wait, but stop on STOP | `await run.sleep(2000)` | `runtime.ts` |
| Write a line in the event log | `log('Tap 3 recorded')` | passed in by the page |

- `run.read` and `run.pulse` **retry by themselves** every 0.5 s if the link drops,
  until it works or STOP is pressed. You don't need your own try/catch.
- `run.read` gives float32 already decoded and `edges` as a count. A missing value comes back as 0.

**Logic patterns you'll use**

```ts
// wait until the PLC says something
while (!(await run.read(TAGS, ['READY']))[0]) { run.check(); await run.sleep(READ_EVERY_MS); }

// decide on a value
const [v] = await run.read(TAGS, ['VOLT']);
if (v > 450) { log('Over-voltage'); await run.pulse(TAGS.STOP); }

// catch a short pulse (kind 'edges'): compare the count with the count at START
const [before] = await run.read(TAGS, ['COMPLETE']);
...
const [now] = await run.read(TAGS, ['COMPLETE']);
if (now > before) break;     // see runMagneticBalanceTest.ts
```

---

## 4. Step 3: get the value onto the screen

1. Add a field to the test's `Reading` interface at the top of the runner
   (for example `IrReading` in `runInsulationTest.ts`).
2. Fill it in your `cb.onReading?.({ ... })` call.
3. The page keeps it in state (`setReading` in `InstrumentTestPage.tsx`) and
   passes `reading` to the visual and table. Use `reading.myField` there.

The screen never talks to the PLC directly. It only shows the `reading` object
the runner sends.

## 5. Step 4: PASS/FAIL goes in `calculation.ts`

Keep limits and formulas there. They are plain functions with no PLC calls
(e.g. `IMBALANCE_LIMIT_PCT`, `correctTo75()` in
`winding-resistance/calculation.ts`). The runner calls them at the end and
returns the result, and the page saves it and shows the PASS/FAIL stamp and report.

## 6. Step 5: how START/STOP reach your runner

- **WRM / Ratio / IR**: `src/pages/InstrumentTestPage.tsx`. Each test's page
  passes `run={...runXxxTest(...)}` and `stop={stopXxxTest}` to `InstrumentShell`.
- **NLL / MBT**: `src/pages/TestExecutionPage.tsx`.
- **"Which test is selected" bits** (M600 NLL, M606 MBT):
  `src/services/plc/selectionBits.ts`. To give a new test a selection bit, add one
  line to `SELECT_BITS`.

---

## 7. Worked example: give Insulation Resistance a real STOP bit

At the moment IR's STOP button only stops the app watching; it sends nothing to
the PLC. Say the manager gives you **M613 = IR STOP**.

**a) Declare it.** `src/tests/insulation-resistance/tags.ts`
```ts
STOP: { device: 'M613', kind: 'coil', description: 'IR STOP (pulse)' },
```

**b) Use it.** `src/tests/insulation-resistance/runInsulationTest.ts`
```ts
import { plc } from '@/services/plc';
import { deltaToModbus } from '@/config/tags';
import { wait } from '@/tests/shared/runtime';

export const stopInsulationTest = async () => {
  run.stop();                                   // stop our own loop first
  if (irUsesPlc()) {                            // only when real addresses are set
    const a = deltaToModbus(IR_TAGS.STOP.device);
    await plc.writeCoil(a, true);               // plain writes: run.pulse() would
    await wait(300);                            // refuse, because run is already stopped
    await plc.writeCoil(a, false);
  }
};
```
That's it. The page already calls `stopInsulationTest` when STOP is pressed.

**Example 2: show a new live value (IR leakage current, D440).**
1. Add `LEAK: { device: 'D440', kind: 'float32', description: 'Leakage current, µA' }` to `tags.ts`.
2. In `fromPlc()`, add `'LEAK'` to the `run.read(...)` list.
3. Add `leak: number` to `IrReading` and pass it in `cb.onReading`. Also add it to the demo branch so the types still match.
4. Show `reading.leak` in `IrMeggerVisual.tsx`.

---

## 8. Testing what you wrote

- **Without the PLC:** leave the header switch on **SIM**. Instrument tests run on
  DEMO data while any address is empty.
- **With the PLC:** run `npm run dev:plc` (starts the Modbus bridge and the app
  together), then switch the header to **REAL PLC**. Restart the bridge after
  changing `server/modbus-bridge.mjs`.
- **Poke any register by hand:** open `http://localhost:5173/plc-test`, a hidden
  diagnostics page. It reads and writes any M or D address, float32 included, so
  you can check an address before you put it in `tags.ts`.
- **Check the code compiles:** `npm run typecheck`.
- The **event log** on each test screen shows every `log(...)` line your runner writes.

## 9. Common mistakes

1. Leaving one `device: ''` in an instrument test's tags file keeps the whole test in DEMO.
2. Putting the next float32 at Dn+1 instead of Dn+2 means both values share a register.
3. Short PLC pulses (< 0.5 s) need `kind: 'edges'`, otherwise you miss them.
4. Calling `run.pulse()` after `run.stop()` doesn't work (it throws). Write the bit with `plc.writeCoil`.
5. Don't put PLC calls in `*Visual.tsx`/`*Panel.tsx`. Screens only show `reading`.

