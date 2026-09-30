// GDELT GEO 2.0: where in the world a set of news keywords is being mentioned (updates every 15 min). Machine-extracted, so credibility is "cannot be judged"
// until another independent source agrees. Upstream HTML snippets are never passed to the browser: ORION extracts plain text and http(s) links only.
import { makeEntity, clamp01 } from '../core/entity.js';
export const id = 'gdelt';
export const meta = {
  name: 'GDELT GEO 2.0 (media attention)', domain: 'media', homepage: 'https://www.gdeltproject.org/', docs: 'https://blog.gdeltproject.org/gdelt-geo-2-0-api-debuts/',
  license: 'Open; cite GDELT (see GDELT terms of use)', attribution: 'The GDELT Project', auth: 'none', coverage: 'Global news, 24 h windows, three keyword themes', refreshMs: 900_000, defaultEnabled: true, rel: 'C', credHint: 6,
  precision: 'Place mentioned in text (not event location)', caveats: ['Locations are places named near the keywords, not verified event coordinates.', 'The API asks for at most one request per 5 s; ORION uses 3 requests per 15 min.'],
};
export const THEMES = Object.freeze([
  { id: 'hazard', q: '(earthquake OR wildfire OR flood OR cyclone OR volcano OR eruption OR landslide)' },
  { id: 'conflict', q: '(airstrike OR shelling OR missile OR clashes OR explosion)' },
  { id: 'cyber', q: '(cyberattack OR ransomware OR "data breach" OR blackout)' },
]);
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/&nbsp;/g, ' ');
const stripTags = (s) => decode(String(s).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
export function extractLinks(html, max = 5) {
  const out = []; const re = /<a\s[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi; let m;
  while ((m = re.exec(String(html || ''))) && out.length < max) {
    const url = decode(m[1]).trim(); if (!/^https?:\/\//i.test(url)) continue;
    try { new URL(url); } catch { continue; }
    out.push({ label: stripTags(m[2]).slice(0, 80) || new URL(url).hostname, url: url.slice(0, 500) });
  }
  return out;
}
export function parse(fc, theme, { fetchedAt = new Date().toISOString() } = {}) {
  const out = [];
  for (const f of fc?.features || []) {
    const c = f.geometry?.coordinates || [], p = f.properties || {}, count = Number(p.count) || 1;
    if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    const name = stripTags(p.name || 'unnamed place').slice(0, 80);
    out.push(makeEntity({
      id: `gdelt:${theme}:${c[1].toFixed(2)},${c[0].toFixed(2)}`, type: 'media', subtype: theme, source: id, name: `${name} (${theme})`, lat: c[1], lon: c[0], observedAt: fetchedAt, fetchedAt, precision: 'approx',
      severity: clamp01(Math.log10(1 + count) / 3) * (theme === 'conflict' ? 1 : 0.8), rel: meta.rel, credHint: meta.credHint, hl: 'media',
      attrs: { theme, count, place: name, snippet: stripTags(p.html || '').slice(0, 240) }, refs: extractLinks(p.html),
    }));
  }
  return out;
}
export async function run(ctx) {
  const all = []; let bytes = 0, ok = 0, lastErr = null;
  for (const t of THEMES) {
    try {
      const r = await ctx.http.json(`https://api.gdeltproject.org/api/v2/geo/geo?query=${encodeURIComponent(t.q)}&mode=PointData&format=GeoJSON&timespan=24h&maxpoints=200`, { timeoutMs: 30000 });
      bytes += r.bytes; ok++; all.push(...parse(r.data, t.id));
    } catch (e) { lastErr = e; }
  }
  if (!ok) throw lastErr;
  return { records: all, bytes, note: `${ok}/${THEMES.length} themes` };
}
