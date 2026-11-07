import { useEffect } from 'react';
import { plc } from '@/services/plc';
import { usePlcStore } from '@/store/plcStore';
import { useAppStore } from '@/store/appStore';

/**
 * Keeps the PLC store in sync with the service and owns the link lifecycle:
 * connected while an operator is logged in, disconnected otherwise.
 * Mount once at the app root.
 */
export function usePlcBridge(): void {
  const loggedIn = useAppStore((s) => s.operator !== null);

  useEffect(() => {
    const { setStatus } = usePlcStore.getState();
    return plc.subscribe(setStatus);
  }, []);

  useEffect(() => {
    const { setError } = usePlcStore.getState();
    if (loggedIn) {
      plc
        .connect()
        .then(() => setError(null))
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    } else {
      void plc.disconnect();
    }
  }, [loggedIn]);
}
