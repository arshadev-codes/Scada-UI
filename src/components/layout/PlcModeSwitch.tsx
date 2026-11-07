import { useState } from 'react';
import { plc, type PlcMode } from '@/services/plc';
import { loadConnection, saveConnection } from '@/services/plc/BridgePlcService';
import { usePlcStore } from '@/store/plcStore';
import { cn } from '@/lib/format';

/** SIM / REAL PLC switch + PLC IP address. Locked while a test is running. */
export function PlcModeSwitch() {
  const [mode, setMode] = useState<PlcMode>(plc.mode);
  const [host, setHost] = useState(() => loadConnection().host);
  const [busy, setBusy] = useState(false);
  const running = usePlcStore((s) => s.status?.running ?? false);
  const contactorsOn = usePlcStore((s) => !!(s.status?.contactors.c1 || s.status?.contactors.c7));
  const locked = busy || running || contactorsOn;

  const change = async (next: PlcMode) => {
    if (locked || next === mode) return;
    setBusy(true);
    setMode(next);
    try {
      await plc.setMode(next);
      usePlcStore.getState().setError(null);
    } catch (e) {
      usePlcStore.getState().setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveHost = () => {
    saveConnection({ ...loadConnection(), host: host.trim() });
  };

  return (
    <div className="flex items-center gap-2" title={locked ? 'Stop the test before switching' : 'Choose simulator or real PLC'}>
      <div className="flex gap-0.5 rounded-[10px] border border-line bg-ink-750 p-0.5">
        {(['sim', 'real'] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={locked}
            onClick={() => void change(m)}
            className={cn(
              'rounded-[8px] px-2.5 py-1 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed',
              mode === m ? 'bg-ink-850 text-accent shadow-[0_1px_2px_rgb(22_32_42/0.12)]' : 'text-fg-dim hover:text-fg',
            )}
          >
            {m === 'sim' ? 'Simulator' : 'Real PLC'}
          </button>
        ))}
      </div>
      {mode === 'real' && (
        <input
          value={host}
          onChange={(e) => setHost(e.target.value)}
          onBlur={saveHost}
          disabled={locked}
          aria-label="PLC IP address"
          className="num w-28 rounded-[8px] border border-line bg-ink-850 px-2 py-1 text-[13px] text-fg"
          placeholder="192.168.1.5"
        />
      )}
    </div>
  );
}
