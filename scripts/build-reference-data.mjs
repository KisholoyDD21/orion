#!/usr/bin/env node
/**
 * Rebuilds the compact, offline reference datasets that ship in data/.
 * Every output is hashed and recorded (with upstream URL, license, retrieval time)
 * in data/reference/MANIFEST.json so results are reproducible and auditable.
 *
 *   npm run data:build            # rebuild everything
 *   npm run data:build -- attack  # rebuild only ATT&CK
 */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'reference');
const RAW = 'https://raw.githubusercontent.com';
const only = process.argv.slice(2);
const want = (k) => !only.length || only.includes(k);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const manifestPath = path.join(OUT, 'MANIFEST.json');
let manifest = { generatedBy: 'scripts/build-reference-data.mjs', datasets: {} };
try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); } catch { /* first run */ }

async function download(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'ORION-Fabric/2.0 data-build' } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
async function emit(key, file, obj, meta) {
  const body = Buffer.from(JSON.stringify(obj));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body);
  manifest.datasets[key] = { ...meta, output: path.relative(ROOT, file).replace(/\\/g, '/'), outputBytes: body.length, outputSha256: sha(body), builtAt: new Date().toISOString() };
  console.log(`✔ ${key.padEnd(14)} ${(body.length / 1024).toFixed(0).padStart(6)} KiB  ${meta.rows} rows`);
}
const r2 = (n) => Math.round(n * 100) / 100;

function csv(text) {                                   // small RFC-4180 parser
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

function simplifyRing(ring) {
  const out = []; let last = '';
  for (const [x, y] of ring) { const p = [r2(x), r2(y)], k = p.join(','); if (k !== last) { out.push(p); last = k; } }
  return out.length >= 4 ? out : null;
}
function simplifyGeom(g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const outPolys = polys.map((p) => p.map(simplifyRing).filter(Boolean)).filter((p) => p.length);
  if (!outPolys.length) return null;
  return outPolys.length === 1 ? { type: 'Polygon', coordinates: outPolys[0] } : { type: 'MultiPolygon', coordinates: outPolys };
}

async function countries(res) {
  const url = `${RAW}/nvkelso/natural-earth-vector/master/geojson/ne_${res}_admin_0_countries.geojson`;
  const buf = await download(url), gj = JSON.parse(buf.toString());
  const features = gj.features.map((f) => {
    const p = f.properties, g = simplifyGeom(f.geometry); if (!g) return null;
    const a2 = p.ISO_A2 && p.ISO_A2 !== '-99' ? p.ISO_A2 : (p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : '');
    const a3 = p.ISO_A3 && p.ISO_A3 !== '-99' ? p.ISO_A3 : (p.ADM0_A3 || '');
    return { type: 'Feature', properties: { n: p.NAME, a2, a3, c: p.CONTINENT, p: p.POP_EST, lx: r2(p.LABEL_X), ly: r2(p.LABEL_Y) }, geometry: g };
  }).filter(Boolean);
  await emit(`countries-${res}`, path.join(OUT, `countries-${res}.geo.json`), { type: 'FeatureCollection', features },
    { name: `Natural Earth admin-0 countries ${res}`, url, license: 'Public domain (Natural Earth)', upstreamBytes: buf.length, upstreamSha256: sha(buf), rows: features.length });
  if (res === '110m') {
    const cent = {};
    for (const f of features) if (f.properties.a2) cent[f.properties.a2] = { n: f.properties.n, lon: f.properties.lx, lat: f.properties.ly, a3: f.properties.a3 };
    await emit('country-centroids', path.join(OUT, 'country-centroids.json'), cent,
      { name: 'Country label points (from Natural Earth 110m)', url, license: 'Public domain (Natural Earth)', rows: Object.keys(cent).length });
  }
}

async function places() {
  const url = `${RAW}/nvkelso/natural-earth-vector/master/geojson/ne_50m_populated_places_simple.geojson`;
  const buf = await download(url), gj = JSON.parse(buf.toString());
  const rows = gj.features.map((f) => { const p = f.properties; return [p.name, p.iso_a2 || '', r2(f.geometry.coordinates[1]), r2(f.geometry.coordinates[0]), p.pop_max || 0, /capital/i.test(p.featurecla || '') ? 1 : 0, p.scalerank ?? 9]; })
    .sort((a, b) => b[4] - a[4]);
  await emit('places-50m', path.join(OUT, 'places-50m.json'), { fields: ['name', 'iso2', 'lat', 'lon', 'pop', 'capital', 'rank'], rows },
    { name: 'Natural Earth populated places 50m (simple)', url, license: 'Public domain (Natural Earth)', upstreamBytes: buf.length, upstreamSha256: sha(buf), rows: rows.length });
}

async function airports() {
  const url = `${RAW}/davidmegginson/ourairports-data/main/airports.csv`;
  const buf = await download(url), all = csv(buf.toString());
  const rows = all.filter((a) => a.type === 'large_airport' || (a.type === 'medium_airport' && a.scheduled_service === 'yes'))
    .map((a) => [a.ident, a.iata_code, a.name, r2(+a.latitude_deg), r2(+a.longitude_deg), a.type === 'large_airport' ? 'L' : 'M', a.iso_country, a.municipality, Math.round(+a.elevation_ft || 0)])
    .filter((r) => Number.isFinite(r[3]) && Number.isFinite(r[4]));
  await emit('airports', path.join(OUT, 'airports.json'), { fields: ['icao', 'iata', 'name', 'lat', 'lon', 'size', 'iso2', 'city', 'elevFt'], rows },
    { name: 'OurAirports (large + scheduled medium)', url, license: 'Public domain (OurAirports)', upstreamBytes: buf.length, upstreamSha256: sha(buf), rows: rows.length });
}

async function power() {
  const url = `${RAW}/wri/global-power-plant-database/master/output_database/global_power_plant_database.csv`;
  const buf = await download(url), all = csv(buf.toString());
  const rows = all.filter((p) => p.primary_fuel === 'Nuclear' || +p.capacity_mw >= 1500)
    .map((p) => [p.name, p.country, p.primary_fuel, Math.round(+p.capacity_mw), r2(+p.latitude), r2(+p.longitude), p.gppd_idnr])
    .filter((r) => Number.isFinite(r[4]) && Number.isFinite(r[5]));
  await emit('power-plants', path.join(OUT, 'power-plants.json'), { fields: ['name', 'iso3', 'fuel', 'mw', 'lat', 'lon', 'id'], rows },
    { name: 'WRI Global Power Plant Database (nuclear + >=1.5 GW)', url, license: 'CC BY 4.0 (World Resources Institute)', upstreamBytes: buf.length, upstreamSha256: sha(buf), rows: rows.length });
}

async function attack() {
  const url = `${RAW}/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json`;
  const buf = await download(url), b = JSON.parse(buf.toString());
  const ext = (o) => (o.external_references || []).find((r) => r.source_name === 'mitre-attack');
  const live = (o) => !o.revoked && !o.x_mitre_deprecated;
  const coll = b.objects.find((o) => o.type === 'x-mitre-collection');
  const tactics = b.objects.filter((o) => o.type === 'x-mitre-tactic' && live(o)).map((o) => ({ id: ext(o).external_id, short: o.x_mitre_shortname, name: o.name }));
  const order = ['reconnaissance', 'resource-development', 'initial-access', 'execution', 'persistence', 'privilege-escalation', 'defense-evasion', 'stealth', 'defense-impairment', 'credential-access', 'discovery', 'lateral-movement', 'collection', 'command-and-control', 'exfiltration', 'impact'];
  const rank = (t) => { const i = order.indexOf(t.short); return i < 0 ? 99 : i; };
  tactics.sort((a, z) => rank(a) - rank(z));
  const techniques = b.objects.filter((o) => o.type === 'attack-pattern' && live(o) && ext(o)).map((o) => ({
    id: ext(o).external_id, name: o.name, tactics: (o.kill_chain_phases || []).filter((k) => k.kill_chain_name === 'mitre-attack').map((k) => k.phase_name),
    sub: !!o.x_mitre_is_subtechnique, platforms: o.x_mitre_platforms || []
  })).sort((a, z) => a.id.localeCompare(z.id));
  const counts = { groups: b.objects.filter((o) => o.type === 'intrusion-set' && live(o)).length, software: b.objects.filter((o) => (o.type === 'malware' || o.type === 'tool') && live(o)).length, mitigations: b.objects.filter((o) => o.type === 'course-of-action' && live(o)).length };
  await emit('attack-enterprise', path.join(ROOT, 'data', 'attack', 'enterprise-attack.compact.json'),
    { source: 'MITRE ATT&CK Enterprise (STIX 2.1 via attack-stix-data)', version: coll?.x_mitre_version || 'unknown', modified: coll?.modified || null, counts, tactics, techniques },
    { name: 'MITRE ATT&CK Enterprise (compact)', url, license: 'MITRE ATT&CK terms of use (royalty-free, attribution)', upstreamBytes: buf.length, upstreamSha256: sha(buf), rows: techniques.length });
}

if (want('countries')) { await countries('110m'); await countries('50m'); }
if (want('places')) await places();
if (want('airports')) await airports();
if (want('power')) await power();
if (want('attack')) await attack();
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
console.log('manifest →', path.relative(ROOT, manifestPath));
