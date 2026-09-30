// Passive-only OSINT lookups: public registries and third-party databases, never a probe of the target itself.
// The target string is always used as a query value against a fixed, trusted hostname — never as a URL host —
// so there is no SSRF surface here even before validate.js's own checks.
import { normalizeDomain, isPublicIP, classifyIndicator } from '../lib/validate.js';

export async function rdapLookup(http, target) {
  const kind = classifyIndicator(target);
  if (!['domain', 'ipv4', 'ipv6'].includes(kind.kind)) return { ok: false, note: 'RDAP applies to domains and IPs only' };
  const url = kind.kind === 'domain' ? `https://rdap.org/domain/${encodeURIComponent(kind.value)}` : `https://rdap.org/ip/${encodeURIComponent(kind.value)}`;
  try {
    const r = await http.json(url, { timeoutMs: 10000 });
    const d = r.data, entity = (d.entities || []).find((e) => (e.roles || []).includes('registrant')) || (d.entities || [])[0];
    const vcard = entity?.vcardArray?.[1] || [];
    const name = vcard.find((f) => f[0] === 'fn')?.[3] || null;
    return { ok: true, ldhName: d.ldhName || d.handle || kind.value, status: d.status || [], events: (d.events || []).map((e) => ({ action: e.eventAction, date: e.eventDate })), nameservers: (d.nameservers || []).map((n) => n.ldhName).filter(Boolean), entityName: name, port43: d.port43 || null, raw: kind.kind === 'domain' ? undefined : { name: d.name, country: d.country, startAddress: d.startAddress, endAddress: d.endAddress } };
  } catch (e) { return { ok: false, note: e.message }; }
}
export async function crtshLookup(http, domain) {
  const d = normalizeDomain(domain); if (!d) return { ok: false, note: 'invalid domain' };
  try {
    const r = await http.json(`https://crt.sh/?q=${encodeURIComponent('%.' + d)}&output=json`, { timeoutMs: 15000, maxBytes: 8_000_000 });
    const rows = Array.isArray(r.data) ? r.data : [];
    const subs = new Set(); for (const row of rows) for (const n of String(row.name_value || '').split('\n')) { const s = n.trim().toLowerCase(); if (s && !s.startsWith('*') && s.endsWith(d)) subs.add(s); }
    return { ok: true, certificateCount: rows.length, subdomains: [...subs].sort().slice(0, 200), sample: rows.slice(0, 5).map((r) => ({ issuer: r.issuer_name, commonName: r.common_name, notBefore: r.not_before, notAfter: r.not_after })) };
  } catch (e) { return { ok: false, note: e.message }; }
}
export async function dohLookup(http, domain, type = 'A') {
  const d = normalizeDomain(domain); if (!d) return { ok: false, note: 'invalid domain' };
  if (!/^(A|AAAA|MX|TXT|NS|CNAME)$/.test(type)) type = 'A';
  try {
    const r = await http.json(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(d)}&type=${type}`, { timeoutMs: 8000, headers: { accept: 'application/dns-json' } });
    return { ok: true, type, status: r.data.Status, answers: (r.data.Answer || []).map((a) => ({ name: a.name, type: a.type, ttl: a.TTL, data: a.data })) };
  } catch (e) { return { ok: false, note: e.message }; }
}
export async function internetDbLookup(http, ip) {
  if (!isPublicIP(ip)) return { ok: false, note: 'not a public IP address' };
  try { const r = await http.json(`https://internetdb.shodan.io/${encodeURIComponent(ip)}`, { timeoutMs: 10000 }); return { ok: true, ip, ports: r.data.ports || [], hostnames: r.data.hostnames || [], cpes: r.data.cpes || [], vulns: r.data.vulns || [], tags: r.data.tags || [] }; }
  catch (e) { return e.status === 404 ? { ok: true, ip, ports: [], hostnames: [], cpes: [], vulns: [], tags: [], note: 'no data on file' } : { ok: false, note: e.message }; }
}
export async function passiveLookup(http, target) {
  const kind = classifyIndicator(target), out = { target: kind.value, kind: kind.kind, generatedAt: new Date().toISOString() };
  if (kind.kind === 'domain') { const [rdap, crt, doh] = await Promise.all([rdapLookup(http, kind.value), crtshLookup(http, kind.value), dohLookup(http, kind.value, 'A')]); Object.assign(out, { rdap, crtsh: crt, dns: doh }); }
  else if (kind.kind === 'ipv4' || kind.kind === 'ipv6') { const [rdap, db] = await Promise.all([rdapLookup(http, kind.value), internetDbLookup(http, kind.value)]); Object.assign(out, { rdap, internetdb: db }); }
  else if (kind.kind === 'cve') out.note = 'Use /api/cve/:id for CVE lookups';
  else out.note = 'Unrecognized indicator type; expected a domain or IP address';
  return out;
}
