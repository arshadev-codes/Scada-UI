import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlcStore } from '@/store/plcStore';
import type { PlcStatus } from '@/services/plc';

export type LogLevel = 'info' | 'cmd' | 'ok' | 'warn' | 'fault';

export interface LogEntry {
  id: number;
  ts: number;
  text: string;
  level: LogLevel;
}

const MAX_ENTRIES = 200;

/** Translate a pair of consecutive status frames into human-readable events. */
function diff(prev: PlcStatus, next: PlcStatus): Array<[string, LogLevel]> {
  const out: Array<[string, LogLevel]> = [];

  if (prev.link !== next.link) {
    out.push([`PLC LINK → ${next.link}`, next.link === 'ONLINE' ? 'ok' : next.link === 'FAULT' ? 'fault' : 'warn']);
  }
  // Outputs dropping are reported before the step change they cause…
  if (prev.out1 && !next.out1) out.push(['OUT1 → OFF', 'info']);
  if (prev.out2 && !next.out2) out.push(['OUT2 → OFF', 'info']);

  if (prev.step !== next.step) {
    if (prev.step === 'OUT1' && next.step === 'WAIT') out.push(['T1 DONE · WAIT TIMER STARTED', 'info']);
    if (prev.step === 'WAIT' && next.step === 'OUT2') out.push(['WAIT DONE', 'info']);
    if (prev.step === 'OUT2' && next.step === 'COMPLETE') out.push(['T2 DONE · READING STORED', 'info']);
    if (next.step === 'COMPLETE') out.push(['SEQUENCE COMPLETE', 'ok']);
    if (next.step === 'ABORTED') out.push(['SEQUENCE ABORTED · OUTPUTS DROPPED', 'fault']);
    if (next.step === 'FAULT') out.push(['PLC FAULT', 'fault']);
  }

  // …and outputs energising after it.
  if (!prev.out1 && next.out1) out.push(['OUT1 → ON   (Y0 energised)', 'warn']);
  if (!prev.out2 && next.out2) out.push(['OUT2 → ON   (Y1 capture)', 'warn']);

  return out;
}

/**
 * Event log driven by status frames read back from the PLC — not by button
 * clicks — plus explicit command entries pushed by the page.
 */
export function useSequenceLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const seq = useRef(0);

  const push = useCallback((text: string, level: LogLevel = 'info') => {
    setEntries((list) => {
      const next = [...list, { id: ++seq.current, ts: Date.now(), text, level }];
      return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
    });
  }, []);

  useEffect(
    () =>
      usePlcStore.subscribe((state, prevState) => {
        if (!state.status || !prevState.status || state.status === prevState.status) return;
        for (const [text, level] of diff(prevState.status, state.status)) push(text, level);
      }),
    [push],
  );

  const clear = useCallback(() => setEntries([]), []);

  return { entries, push, clear };
}
