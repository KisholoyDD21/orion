import net from 'node:net';
export class ApiError extends Error { constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; } }
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const clampInt = (v, d, lo, hi) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? clamp(n, lo, hi) : d; };
export const clampNum = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? clamp(n, lo, hi) : d; };

/** Strict hostname check (RFC 1035 labels; IDNs must arrive as punycode). Rejects IP literals. */
export function normalizeDomain(input) {
  let s = String(input ?? '').trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#]/)[0].replace(/^[^@]*@/, '').replace(/:\d+$/, '').replace(/\.$/, '');
  if (!s || s.length > 253 || net.isIP(s)) return null;
  const labels = s.split('.');
  if (labels.length < 2) return null;
  for (const l of labels) if (!/^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(l)) return null;
  if (!/^([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(labels.at(-1))) return null;
  return s;
}
const V4_BLOCKS = [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]];
const v4int = (ip) => ip.split('.').reduce((a, o) => a * 256 + Number(o), 0);
export function isPublicIPv4(ip) {
  if (net.isIPv4(ip) === false) return false;
  const n = v4int(ip);
  return !V4_BLOCKS.some(([base, bits]) => { const size = 2 ** (32 - bits); const b = v4int(base); return n >= b && n < b + size; });
}
export function isPublicIPv6(ip) {
  if (!net.isIPv6(ip)) return false;
  const s = ip.toLowerCase();
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); if (mapped) return isPublicIPv4(mapped[1]);
  if (s === '::' || s === '::1') return false;
  const first = parseInt(s.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00) return false;
  if (s.startsWith('2001:db8') || s.startsWith('2001:0db8')) return false;
  return true;
}
export const isPublicIP = (ip) => isPublicIPv4(ip) || isPublicIPv6(ip);
export const isCVE = (s) => /^CVE-\d{4}-\d{4,7}$/i.test(String(s));
export const safeId = (s, max = 160) => { const t = String(s ?? ''); return t.length > 0 && t.length <= max && /^[\w:.\-@/+=%]+$/.test(t) ? t : null; };
export const isoOrNull = (v) => { const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toISOString() : null; };
/** Detects what kind of indicator a string is. */
export function classifyIndicator(raw) {
  const s = String(raw ?? '').trim();
  if (isCVE(s)) return { kind: 'cve', value: s.toUpperCase() };
  if (net.isIPv4(s)) return { kind: 'ipv4', value: s };
  if (net.isIPv6(s)) return { kind: 'ipv6', value: s.toLowerCase() };
  if (/^[a-f0-9]{64}$/i.test(s)) return { kind: 'sha256', value: s.toLowerCase() };
  if (/^[a-f0-9]{40}$/i.test(s)) return { kind: 'sha1', value: s.toLowerCase() };
  if (/^[a-f0-9]{32}$/i.test(s)) return { kind: 'md5', value: s.toLowerCase() };
  const d = normalizeDomain(s); if (d) return { kind: 'domain', value: d };
  return { kind: 'unknown', value: s.slice(0, 200) };
}
