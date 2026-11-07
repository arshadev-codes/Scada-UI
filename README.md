# TTB-01 · Transformer Test Bench

Control-panel UI for routine transformer testing (No-Load Loss, Load Loss & Impedance).
React 18 · TypeScript · Vite · Tailwind v4 · Framer Motion · Zustand · React Router.

**UI only for now.** All PLC traffic goes through `PlcService`; the app currently runs on
`MockPlcService`, an in-browser simulation of the DVP-12SE ladder program.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (next free port if taken)
npm run build      # typecheck + production build
npm run typecheck
```

Log in with any operator ID and password `admin`. Click or press any key to skip the boot text.

## Flow

`/login` → `/test-object` → `/test-selection` → `/test/:testId` (one per selected test, in order) → `/summary`

## Architecture

```
src/
  config/
    tags.ts        PLC tag map (Delta device → Modbus address), SIDE_CODE, SEQ_STEP_CODE
    tests.ts       Test catalogue — add a test here; `available: false` shows it locked
  services/plc/
    PlcService.ts  Transport-agnostic interface + PlcStatus type
    MockPlcService.ts  Simulated PLC: Modbus-addressed memory + 50 ms scan, 200 ms status frames
    commands.ts    startSequence / stopSequence — the only place that knows the write order
    index.ts       `export const plc` — THE swap point for the real implementation
  store/           appStore (persisted: operator, test object, selection, runs), plcStore (live status)
  hooks/           usePlcBridge, useStepClock (rAF-interpolated timer), useSequenceLog, useClock
  components/ui/   Panel, Button, Field, Segmented, Lamp, CountUp, Brackets, motion variants
  components/feature/  PhaseWaveCanvas, BootSequence, Nameplate, TestCard, SideSchematic,
                       SequenceTimeline, CountdownRing, SingleLineDiagram, EventLog, ReadingsPanel
  components/layout/   AppShell, TopBar, StatusStrip, LinkIndicator, ScanWipe, Page
  pages/           Login, TestObject, TestSelection, TestExecution, Summary
```

### The UI only shows read-back state

Lamps, the timeline, the countdown and the event log are all driven by `PlcStatus` frames,
not by what was clicked. Pressing START writes D100/D101/D110–D112, then pulses M100. The
run only counts as started once the PLC reports `running`.

Safety behaviour in `TestExecutionPage`:

- STOP is enabled whenever the PLC reports running, whatever the page thinks.
- Output lamps always mirror raw Y0/Y1.
- A START-acknowledge watchdog (3 s after the pulse is written) sends STOP on timeout.
- Losing the link mid-run marks the run aborted.
- Leaving the page mid-run sends STOP.
- Nav and logout are locked while running.

### Plugging in the real PLC

1. Implement `PlcService` (e.g. `BridgePlcService`) talking to the Node Modbus-TCP bridge
   over WebSocket. Emit a `PlcStatus` from `subscribe()` at about 200 ms, and immediately on
   step changes.
2. Change one line in `src/services/plc/index.ts`.
3. Edit addresses in `src/config/tags.ts`. `deltaToModbus()` handles the DVP-SE map
   (X0=1024, Y0=1280, M0=2048, D0=4096; X/Y are octal; M1536+ and D4096+ use the high blocks).

The ladder needs read-back registers for the step and elapsed time. These are **proposed**
in `tags.ts` and need adding to the program:
`SEQ_STEP = D120` (0 idle, 1 OUT1, 2 WAIT, 3 OUT2, 4 complete, 5 aborted, 9 fault),
`STEP_ELAPSED = D121` (×100 ms), `RUNNING = M110`.

STOP semantics the mock assumes (match these in ladder, or adjust `commands.ts`): a STOP pulse
aborts a running sequence; when idle, it resets the step to IDLE.

## Design notes

- Graphite background with an engineering grid and grain.
- One accent: amber `#FFB000`.
- R/Y/B phase colours appear only on phase visuals (scope traces, readings columns).
- Status colours: green = ready/complete, amber = energised/running, red = fault/abort.
- Fonts: Chakra Petch (labels), JetBrains Mono with tabular figures (all numbers).
- Motion uses transform/opacity only. Waveforms are drawn on canvas.
- `MotionConfig reducedMotion="user"` and a CSS media query honour `prefers-reduced-motion`.
- Custom `hd` breakpoint (1200px): the execution page keeps START/STOP above the fold on a
  1280×800 monitor.
