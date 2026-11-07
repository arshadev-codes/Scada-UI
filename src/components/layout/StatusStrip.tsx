import { TAGS, addr, type TagName } from '@/config/tags';
import { usePlcStore } from '@/store/plcStore';
import { cn, hex } from '@/lib/format';

/** Bottom SCADA-style strip echoing raw register values read back from the PLC. */
export function StatusStrip() {
  const s = usePlcStore((st) => st.status);

  const items: Array<{ tag: TagName; value: string; hot?: boolean }> = [
    { tag: 'TEST_SELECT', value: String(s?.testSelect ?? 0) },
    { tag: 'SIDE_SELECT', value: String(s?.sideSelect ?? 0) },
    { tag: 'T1_PRESET', value: String(s?.presets.t1 ?? 0) },
    { tag: 'WAIT_PRESET', value: String(s?.presets.wait ?? 0) },
    { tag: 'T2_PRESET', value: String(s?.presets.t2 ?? 0) },
    { tag: 'OUT1_STATUS', value: s?.out1 ? '1' : '0', hot: s?.out1 },
    { tag: 'OUT2_STATUS', value: s?.out2 ? '1' : '0', hot: s?.out2 },
    { tag: 'VARIAC_V', value: `${Math.round(s?.analog.variacV ?? 0)}V`, hot: (s?.analog.variacV ?? 0) > 0.5 },
  ];

  return (
    <footer className="sticky bottom-0 z-30 border-t border-line bg-ink-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-8 max-w-[1680px] items-center gap-5 overflow-x-auto px-5 text-[13px]">
        <span className="label-tech shrink-0 text-[12px] text-fg-dim">DVP-12SE · MODBUS TCP</span>
        {items.map(({ tag, value, hot }) => (
          <span
            key={tag}
            className="num flex shrink-0 items-center gap-1.5"
            title={`${TAGS[tag].description} — Modbus ${addr(tag)} (0x${hex(addr(tag))})`}
          >
            <span className="text-fg-dim">{TAGS[tag].device}</span>
            <span className={cn(hot ? 'text-amber' : 'text-fg-muted')}>{value}</span>
          </span>
        ))}
        <span className="num ml-auto flex shrink-0 items-center gap-1.5 text-fg-dim">
          STEP <span className="text-fg-muted">{s?.step ?? '—'}</span>
          <span className="mx-2 text-line-strong">|</span>
          HB <span className="text-fg-muted">{hex(s?.heartbeat ?? 0)}</span>
        </span>
      </div>
    </footer>
  );
}
