import { cn } from '@/lib/format';

interface ReadingTileProps {
  /** PLC register, e.g. D310 */
  device: string;
  label: string;
  value: number;
  unit: string;
  decimals: number;
  /** Digits before the decimal point (unlit ones show as ghost 8s) */
  intDigits: number;
  color: string;
  live: boolean;
}

/* ---- seven-segment geometry, one digit cell = DW × DH ---- */
const DW = 20;
const DH = 36;
const T = 3.6; // segment thickness
const G = 0.9; // gap at segment joints
const PITCH = 28; // distance between digit cells (room for the decimal point)
const DOT = 4.2;

const hSeg = (yc: number, x1: number, x2: number) =>
  `${x1},${yc} ${x1 + T / 2},${yc - T / 2} ${x2 - T / 2},${yc - T / 2} ${x2},${yc} ${x2 - T / 2},${yc + T / 2} ${x1 + T / 2},${yc + T / 2}`;
const vSeg = (xc: number, y1: number, y2: number) =>
  `${xc},${y1} ${xc + T / 2},${y1 + T / 2} ${xc + T / 2},${y2 - T / 2} ${xc},${y2} ${xc - T / 2},${y2 - T / 2} ${xc - T / 2},${y1 + T / 2}`;

const L = T / 2;
const R = DW - T / 2;
const TOP = T / 2;
const MID = DH / 2;
const BOT = DH - T / 2;

const SEG = {
  a: hSeg(TOP, L + G, R - G),
  b: vSeg(R, TOP + G, MID - G),
  c: vSeg(R, MID + G, BOT - G),
  d: hSeg(BOT, L + G, R - G),
  e: vSeg(L, MID + G, BOT - G),
  f: vSeg(L, TOP + G, MID - G),
  g: hSeg(MID, L + G, R - G),
} as const;
type Seg = keyof typeof SEG;
const ALL = Object.keys(SEG) as Seg[];

const GLYPH: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc',
  '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  '-': 'g', ' ': '',
};

/** Split "439.8" into cells, padded left with blanks to a fixed width. */
function toCells(text: string, intDigits: number) {
  const [int, frac = ''] = text.split('.');
  const padded = int.padStart(intDigits, ' ');
  const cells = [...padded].map((ch, i) => ({ ch, dot: i === padded.length - 1 && frac.length > 0 }));
  return [...cells, ...[...frac].map((ch) => ({ ch, dot: false }))];
}

function SevenSeg({ text, intDigits, color, dim }: { text: string; intDigits: number; color: string; dim: boolean }) {
  const cells = toCells(text, intDigits);
  const width = cells.length * PITCH - (PITCH - DW) + 4;
  return (
    <svg viewBox={`-2 -2 ${width + 6} ${DH + 4}`} className="h-12 w-auto max-w-full" aria-hidden>
      <g transform="skewX(-6) translate(4 0)">
        {cells.map(({ ch, dot }, i) => {
          const on = GLYPH[ch] ?? '';
          return (
            <g key={i} transform={`translate(${i * PITCH} 0)`}>
              {ALL.map((s) => (
                <polygon
                  key={s}
                  points={SEG[s]}
                  fill={color}
                  fillOpacity={on.includes(s) ? (dim ? 0.8 : 1) : 0.07}
                  style={on.includes(s) && !dim ? { filter: `drop-shadow(0 0 3px ${color})` } : undefined}
                />
              ))}
              <rect
                x={DW + 2}
                y={DH - DOT}
                width={DOT}
                height={DOT}
                fill={color}
                fillOpacity={dot ? (dim ? 0.8 : 1) : 0.07}
                style={dot && !dim ? { filter: `drop-shadow(0 0 3px ${color})` } : undefined}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/** Panel-meter tile: register on the bezel, 7-segment LCD window, label. */
export function ReadingTile({ device, label, value, unit, decimals, intDigits, color, live }: ReadingTileProps) {
  const text = Math.max(0, value).toFixed(decimals);
  return (
    <div className="flex flex-col px-4 pb-4 pt-3">
      <div className="flex items-center justify-between">
        <span className="num text-[13px] text-fg-dim">{device}</span>
        <span
          className={cn('h-2 w-2 rounded-full', live && 'shadow-[0_0_6px_currentColor]')}
          style={{ background: color, color, opacity: live ? 1 : 0.3 }}
          aria-hidden
        />
      </div>

      <div
        className="mt-2.5 flex items-end justify-center gap-2 rounded-[3px] px-3 py-3.5"
        style={{
          background: '#05080e',
          boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.06), 0 1px 0 rgba(255,255,255,0.04)',
        }}
        role="img"
        aria-label={`${label} ${text} ${unit}`}
      >
        <SevenSeg text={text} intDigits={intDigits} color={color} dim={!live} />
        <span className="num pb-0.5 text-[14px] font-semibold" style={{ color, opacity: live ? 0.9 : 0.5 }}>
          {unit}
        </span>
      </div>

      <div className="label-tech mt-2.5 text-center text-[13px] text-accent">{label}</div>
    </div>
  );
}
