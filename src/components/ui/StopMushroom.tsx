import { cn } from '@/lib/format';

/**
 * Stop button drawn as a red mushroom-head push button on a yellow collar,
 * like the one on the bench. It sinks into the collar when pressed.
 * (Software stop: it sends the PLC's stop bit; it is not a hard-wired e-stop.)
 */
export function StopMushroom({ onPress, disabled, label = 'Stop' }: { onPress: () => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label={label}
      className="group relative grid h-16 w-full place-items-center rounded-[14px] bg-[#e9b200] disabled:cursor-not-allowed disabled:bg-ink-700"
    >
      {/* collar ring */}
      <span className="absolute inset-y-1.5 left-1/2 aspect-square -translate-x-1/2 rounded-full bg-[#c99a00] shadow-[inset_0_2px_3px_rgb(0_0_0/0.35)] group-disabled:bg-ink-750" />
      {/* mushroom head */}
      <span
        className={cn(
          'relative grid aspect-square h-[46px] place-items-center rounded-full font-display text-[14px] font-bold uppercase tracking-[0.1em] text-white',
          'bg-[radial-gradient(circle_at_35%_30%,#ff6b5e,#c62828_55%,#8e1515)] shadow-[0_4px_0_#6d0f0f,0_6px_10px_rgb(0_0_0/0.35)]',
          'transition-[transform,box-shadow] duration-75 group-active:translate-y-[3px] group-active:shadow-[0_1px_0_#6d0f0f,0_2px_4px_rgb(0_0_0/0.35)]',
          'group-disabled:bg-none group-disabled:bg-line-strong group-disabled:text-fg-dim group-disabled:shadow-none',
        )}
      >
        {label}
      </span>
    </button>
  );
}
