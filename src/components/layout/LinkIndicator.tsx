import { Lamp } from '@/components/ui';
import { usePlcStore } from '@/store/plcStore';
import type { LinkState } from '@/services/plc';
import { cn } from '@/lib/format';

const linkView: Record<LinkState, { color: 'ok' | 'amber' | 'fault'; on: boolean; blink: boolean; text: string }> = {
  ONLINE: { color: 'ok', on: true, blink: false, text: 'ONLINE' },
  CONNECTING: { color: 'amber', on: true, blink: true, text: 'CONNECTING' },
  DISCONNECTED: { color: 'fault', on: false, blink: false, text: 'STANDBY' },
  FAULT: { color: 'fault', on: true, blink: true, text: 'FAULT' },
};

/** "PLC LINK" lamp, reflecting the link state read back from the service. */
export function LinkIndicator({ className, compact }: { className?: string; compact?: boolean }) {
  const link = usePlcStore((s) => s.status?.link ?? 'DISCONNECTED');
  const v = linkView[link];
  return (
    <div className={cn('flex items-center gap-2.5', className)} role="status" aria-label={`PLC link ${v.text}`}>
      <Lamp on={v.on} color={v.color} blink={v.blink} size="sm" />
      {!compact && <span className="label-tech text-[13px]">PLC LINK</span>}
      <span
        className={cn(
          'num text-[13px]',
          v.color === 'ok' ? 'text-ok' : v.color === 'amber' ? 'text-amber' : 'text-fault/80',
        )}
      >
        {v.text}
      </span>
    </div>
  );
}
