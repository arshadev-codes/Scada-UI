const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** HH:MM:SS (24h) */
export function clockTime(ts: number | Date): string {
  const d = typeof ts === 'number' ? new Date(ts) : ts;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** YYYY-MM-DD in local time */
export function isoDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Seconds → "MM:SS" */
export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

/** Seconds → "SS.s" style countdown, or MM:SS above a minute */
export function countdown(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s >= 60) return mmss(s);
  return s.toFixed(1).padStart(4, '0');
}

export function durationLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export function hex(n: number, width = 4): string {
  return n.toString(16).toUpperCase().padStart(width, '0');
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
