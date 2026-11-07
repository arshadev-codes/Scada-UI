import { ResultStamp } from '@/components/ui/ResultStamp';
import { cn } from '@/lib/format';
import { PhaseSteps, StickerLog } from '@/tests/shared/StickerLog';
import { heatColor } from './heatColor';
import { TRT_LIMITS, TRT_STABLE_K_PER_H, type TrtReading, type TrtResult, type TrtRow } from './runTemperatureRiseTest';

const hhmm = (min: number) => `${Math.floor(min / 60)}:${String(Math.floor(min % 60)).padStart(2, '0')}`;

export function TrtSteps({ reading }: { reading: TrtReading | null }) {
  return (
    <PhaseSteps
      current={reading?.phase === 'done' ? null : (reading?.phase ?? null)}
      finished={reading?.phase === 'done' && reading.rows.length > 0}
      steps={[
        { key: 'connect', label: 'Prepare', sub: 'LV short · probes in' },
        { key: 'total', label: 'Total losses', sub: `until oil < ${TRT_STABLE_K_PER_H} K/h` },
        { key: 'rated', label: 'Rated current', sub: '1 h · winding gradient' },
      ]}
    />
  );
}

/** Temperature cell: value with a small swatch in its thermal colour. */
function Temp({ t }: { t: number }) {
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <span className="inline-block size-2.5 rounded-full transition-colors duration-500" style={{ background: heatColor(t) }} aria-hidden />
      {t.toFixed(1)}
    </span>
  );
}

export function TrtTable({ reading, result, intervalMin }: { reading: TrtReading | null; result: TrtResult | null; intervalMin: number }) {
  const rows = reading?.rows ?? result?.rows ?? [];
  const lim = (v: number, limit: number) => <span className={cn(v <= limit ? 'text-ok' : 'text-fault')}>{v.toFixed(1)} K</span>;
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
      <div>
        <div className="num mb-2 flex items-center justify-between text-[13px] text-fg-dim">
          <span>
            Logged every <span className="text-fg">{intervalMin} min</span> · newest on top
          </span>
          <span>{rows.length} rows</span>
        </div>
        <StickerLog<TrtRow>
          rows={rows}
          maxHeight={420}
          empty="Temperatures are stuck on here at every log interval"
          tone={(r) => (r.phase === 'rated' ? 'bg-[#4da3ff]' : 'bg-[var(--live)]')}
          columns={[
            { key: 'min', label: 'Time h:mm', width: '84px', render: (r) => hhmm(r.min) },
            { key: 'amb', label: 'Ambient', align: 'right', render: (r) => <Temp t={r.ambient} /> },
            { key: 'top', label: 'Top oil', align: 'right', render: (r) => <Temp t={r.topOil} /> },
            { key: 'bot', label: 'Bottom oil', align: 'right', render: (r) => <Temp t={r.bottomOil} /> },
            { key: 'hv', label: 'HV wdg', align: 'right', render: (r) => <Temp t={r.hvWdg} /> },
            { key: 'lv', label: 'LV wdg', align: 'right', render: (r) => <Temp t={r.lvWdg} /> },
            { key: 'rise', label: 'Oil rise', align: 'right', render: (r) => `${(r.topOil - r.ambient).toFixed(1)} K` },
            { key: 'i', label: 'I A', align: 'right', width: '70px', render: (r) => r.currentA.toFixed(2) },
            { key: 'p', label: 'P kW', align: 'right', width: '70px', render: (r) => r.lossKw.toFixed(2) },
          ]}
        />
      </div>
      <div className="num flex flex-col gap-1 text-[14px] text-fg">
        <div className="label-tech mb-1 text-[13px] text-fg-dim">Result</div>
        {result ? (
          <>
            <ResultStamp pass={result.pass} />
            <div className="mt-2">Duration: {hhmm(result.durationMin)} h</div>
            <div>Ambient: {result.ambient.toFixed(1)} °C</div>
            <div>Top-oil rise: {lim(result.topOilRise, TRT_LIMITS.topOil)}</div>
            <div>HV winding rise: {lim(result.hvRise, TRT_LIMITS.winding)}</div>
            <div>LV winding rise: {lim(result.lvRise, TRT_LIMITS.winding)}</div>
            <div className="text-fg-dim">
              Limits: top oil ≤ {TRT_LIMITS.topOil} K, average winding ≤ {TRT_LIMITS.winding} K (IEC 60076-2)
            </div>
          </>
        ) : (
          <div className="text-fg-dim">Run the heat run to see the rises against the limits</div>
        )}
      </div>
    </div>
  );
}
