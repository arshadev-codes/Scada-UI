import { AnimatePresence, motion } from 'framer-motion';
import type { TestObject } from '@/store/types';
import type { RatedCurrents } from '@/lib/electrical';
import { completion } from '@/lib/testObject';
import { cn } from '@/lib/format';
import { Brackets, powerUp } from '@/components/ui';

interface NameplateProps {
  data: TestObject;
  currents: RatedCurrents;
}

/** A value that briefly flickers whenever it changes. */
function Val({ v, className }: { v: string; className?: string }) {
  const empty = v.trim() === '';
  return (
    <span className={cn('relative inline-block min-w-0 truncate', className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={v}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: [0, 1, 0.5, 1], y: 0 }}
          exit={{ opacity: 0, y: -3, transition: { duration: 0.1 } }}
          transition={{ duration: 0.28 }}
          className={cn('block truncate', empty ? 'text-fg-dim/50' : 'text-fg')}
        >
          {empty ? '—' : v}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Row({ k, v, unit }: { k: string; v: string; unit?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-line py-[5px] last:border-0">
      <span className="label-tech shrink-0 text-[12px] text-fg-dim">{k}</span>
      <span className="num flex min-w-0 items-baseline gap-1 text-[14px]">
        <Val v={v} />
        {unit && v.trim() !== '' && <span className="text-[13px] text-fg-dim">{unit}</span>}
      </span>
    </div>
  );
}

const fmtA = (a: number | null) => (a === null ? '' : a.toFixed(a < 100 ? 2 : 1));

/** Live rating plate that fills in as the form is completed. */
export function Nameplate({ data: d, currents }: NameplateProps) {
  const pct = completion(d);
  const taps =
    d.tapChanger === 'NONE'
      ? 'NONE'
      : `${d.tapChanger} ${Number(d.tapMinPct) > 0 ? '+' : ''}${d.tapMinPct || '?'}% / +${d.tapMaxPct || '?'}% · ${d.tapCount || '?'} POS`;

  return (
    <motion.div
      variants={powerUp}
      className="relative overflow-hidden border border-line-strong bg-[linear-gradient(160deg,var(--color-ink-750)_0%,var(--color-ink-850)_45%,var(--color-ink-800)_100%)]"
    >
      <Brackets color="border-accent/70" size={12} />
      {/* rivets */}
      {['left-2 top-2', 'right-2 top-2', 'left-2 bottom-2', 'right-2 bottom-2'].map((p) => (
        <span key={p} aria-hidden className={cn('absolute size-1.5 rounded-full bg-line-strong shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]', p)} />
      ))}

      <div className="border-b border-line-strong px-5 pb-3 pt-4 text-center">
        <div className="label-tech text-[12px] text-fg-dim">Rating Plate · Live</div>
        <div className="mt-1 font-display text-[15px] font-bold uppercase tracking-[0.2em] text-fg">
          {d.phases === '3' ? 'Three' : 'Single'}-Phase Transformer
        </div>
        <div className="num mt-0.5 truncate text-[13px] text-accent">
          <Val v={d.manufacturer.toUpperCase()} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-5 px-5 py-3">
        <div>
          <Row k="Serial No" v={d.serialNo} />
          <Row k="Year" v={d.yearOfManufacture} />
          <Row k="Rated Power" v={d.ratedPowerKva} unit="kVA" />
          <Row k="Frequency" v={d.frequency} unit="Hz" />
          <Row k="Phases" v={d.phases} />
          <Row k="Vector Grp" v={d.vectorGroup} />
          <Row k="Impedance" v={d.impedancePct} unit="%" />
        </div>
        <div>
          <Row k="HV Voltage" v={d.hvVoltageKv} unit="kV" />
          <Row k="LV Voltage" v={d.lvVoltageV} unit="V" />
          <Row k="HV Current" v={fmtA(currents.hv)} unit="A" />
          <Row k="LV Current" v={fmtA(currents.lv)} unit="A" />
          <Row k="Cooling" v={d.cooling === 'DRY' ? 'AN (DRY)' : d.cooling} />
          <Row k="Winding" v={`${d.windingHv} / ${d.windingLv}`} />
          <Row k="Standard" v={d.standard} />
        </div>
      </div>

      <div className="border-t border-line-strong px-5 py-2.5">
        <Row k="Tapping" v={taps} />
        <Row k="Customer" v={d.customerName} />
        <Row k="Order" v={d.jobNo} />
      </div>

      <div className="flex items-center gap-3 border-t border-line-strong bg-ink-950/50 px-5 py-2.5">
        <span className="label-tech text-[12px] text-fg-dim">Data</span>
        <div className="relative h-1 flex-1 overflow-hidden bg-ink-700">
          <motion.div
            className="absolute inset-y-0 left-0 w-full origin-left bg-accent-grad"
            animate={{ scaleX: pct }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>
        <span className="num w-9 text-right text-[13px] text-fg-muted">{Math.round(pct * 100)}%</span>
      </div>
    </motion.div>
  );
}
