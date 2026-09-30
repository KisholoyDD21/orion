export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function fmtAgo(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000; if (!Number.isFinite(s)) return '—';
  if (s < 5) return 'just now'; if (s < 90) return `${Math.round(s)}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`; if (s < 172800) return `${(s / 3600).toFixed(1)}h ago`;
  return `${(s / 86400).toFixed(1)}d ago`;
}
export function fmtClock(d = new Date()) { return d.toISOString().slice(11, 19) + 'Z'; }
export function fmtLatLon(lat, lon) { if (lat == null || lon == null) return '—'; const f = (v, p, n) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? p : n}`; return `${f(lat, 'N', 'S')} ${f(lon, 'E', 'W')}`; }
export function fmtAlt(m) { if (m == null) return '—'; return m < 0 ? `${Math.round(-m).toLocaleString()} m depth` : m > 3000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m).toLocaleString()} m`; }
export function fmtNum(x, d = 0) { return Number.isFinite(x) ? x.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }) : '—'; }
export function fmtPct(x) { return Number.isFinite(x) ? `${Math.round(x * 100)}%` : '—'; }
export function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export function bandLabel(b) { return { critical: 'Critical', high: 'High', elevated: 'Elevated', routine: 'Routine' }[b] || b; }
