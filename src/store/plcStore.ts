import { create } from 'zustand';
import type { PlcStatus } from '@/services/plc';

interface PlcState {
  status: PlcStatus | null;
  /** performance.now() when the latest frame arrived — used to interpolate timers */
  receivedAt: number;
  lastError: string | null;
  setStatus: (s: PlcStatus) => void;
  setError: (e: string | null) => void;
}

/** Mirror of the latest status frame read back from the PLC service. */
export const usePlcStore = create<PlcState>()((set) => ({
  status: null,
  receivedAt: 0,
  lastError: null,
  setStatus: (status) => set({ status, receivedAt: performance.now() }),
  setError: (lastError) => set({ lastError }),
}));
