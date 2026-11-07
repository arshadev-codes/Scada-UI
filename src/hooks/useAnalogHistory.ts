import { useEffect, useState } from 'react';
import { usePlcStore } from '@/store/plcStore';
import type { AnalogReadings } from '@/services/plc';

export type AnalogKey = Exclude<keyof AnalogReadings, 'variacSetV'>;

export type AnalogHistory = Record<AnalogKey, number[]>;

const KEYS: AnalogKey[] = ['variacV', 'currentA', 'powerW', 'frequencyHz', 'powerFactor'];

const empty = (): AnalogHistory => ({ variacV: [], currentA: [], powerW: [], frequencyHz: [], powerFactor: [] });

/** Rolling window of analyser samples (one per status frame) plus session peaks. */
export function useAnalogHistory(size = 60) {
  const [history, setHistory] = useState<AnalogHistory>(empty);
  const [peaks, setPeaks] = useState<Record<AnalogKey, number>>({
    variacV: 0,
    currentA: 0,
    powerW: 0,
    frequencyHz: 0,
    powerFactor: 0,
  });

  useEffect(
    () =>
      usePlcStore.subscribe((state, prev) => {
        const a = state.status?.analog;
        if (!a || state.status === prev.status) return;
        setHistory((h) => {
          const next = { ...h };
          for (const k of KEYS) {
            const arr = h[k].length >= size ? h[k].slice(1) : h[k].slice();
            arr.push(a[k]);
            next[k] = arr;
          }
          return next;
        });
        setPeaks((p) => {
          let changed = false;
          const next = { ...p };
          for (const k of KEYS) {
            if (a[k] > p[k]) {
              next[k] = a[k];
              changed = true;
            }
          }
          return changed ? next : p;
        });
      }),
    [size],
  );

  return { history, peaks };
}
