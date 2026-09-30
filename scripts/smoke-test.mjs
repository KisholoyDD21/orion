// End-to-end smoke test: boots the server in offline (synthetic) mode and exercises the API surface. No
// dependencies, no internet required. Run with `npm run smoke` (server must NOT already be running on this port).
import { spawn } from 'node:child_process';

const port = 8898;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server/index.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port), ORION_MODE: 'offline', LOG_LEVEL: 'warn' }, stdio: ['ignore', 'ignore', 'inherit'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForBoot() { for (let i = 0; i < 80; i++) { try { const r = await fetch(base + '/api/health'); if (r.ok) return; } catch { /* not up yet */ } await sleep(150); } throw new Error('server did not start in time'); }
async function get(path) { const r = await fetch(base + path); const body = await r.text(); if (!r.ok) throw new Error(`GET ${path}: ${r.status} ${body.slice(0, 200)}`); return JSON.parse(body); }
async function post(path, data) { const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data ?? {}) }); const body = await r.text(); if (!r.ok) throw new Error(`POST ${path}: ${r.status} ${body.slice(0, 200)}`); return JSON.parse(body); }
const assert = (cond, msg) => { if (!cond) throw new Error(`assertion failed: ${msg}`); };

const results = {};
try {
  await waitForBoot();
  await sleep(1500); // let the synthetic adapter's first fusion pass complete

  const health = await get('/api/health'); assert(health.ok && health.mode === 'offline', 'health/mode'); results.health = health.entities;
  const config = await get('/api/config'); assert(config.version, 'config.version'); results.version = config.version;
  const layers = await get('/api/layers'); assert(layers.layers.length === 8, 'layer count (8 geolocated/tracked layers; "recon" is on-demand only, not a tracked layer)'); results.layers = layers.layers.map((l) => l.id);
  const airLayer = await get('/api/layer/air'); assert(airLayer.items.length > 0 && typeof airLayer.items[0].a === 'number', 'air layer items'); results.airCount = airLayer.items.length;
  const feed = await get('/api/feed?limit=10'); assert(feed.items.length > 0 && feed.items[0].priority >= feed.items.at(-1).priority, 'feed sorted'); results.feedTop = feed.items[0].band;
  const search = await get('/api/search?q=nuclear'); assert(Array.isArray(search.results), 'search shape'); results.searchHits = search.results.length;
  const oneId = airLayer.items[0].i;
  const entity = await get(`/api/entity/${encodeURIComponent(oneId)}`); assert(entity.fusion && entity.factors.length === 6, 'entity fusion+factors'); results.sampleEntity = entity.entity.name;
  const alerts = await get('/api/alerts?limit=5'); assert(Array.isArray(alerts.alerts), 'alerts shape'); results.alerts = alerts.alerts.length;
  const timeline = await get('/api/timeline?hours=24'); assert(Array.isArray(timeline.events), 'timeline shape'); results.timelineEvents = timeline.events.length;
  const graph = await get('/api/graph/overview'); assert(graph.nodes.length > 0 && graph.edges, 'graph overview'); results.graphNodes = graph.nodes.length;
  const attack = await get('/api/attack/matrix'); assert(attack.tactics.length > 0 && attack.coverage.total > 500, 'attack matrix'); results.attackTechniques = attack.coverage.total;
  const rules = await get('/api/detection/rules'); assert(rules.count >= 10 && !rules.errors.length, 'detection rules load clean'); results.rules = rules.count;
  const evalRes = await post('/api/detection/evaluate', {}); assert(evalRes.matches.length > 0, 'detection matches'); results.detectionMatches = evalRes.matches.length;
  const stix = await get('/api/stix/export?limit=20'); assert(stix.type === 'bundle' && stix.objects.length > 0, 'stix bundle'); results.stixObjects = stix.objects.length;
  const taxii = await get('/api/taxii/collections'); assert(taxii.collections.length === 8, 'taxii collections'); results.taxiiCollections = taxii.collections.length;
  const bench = await get('/api/research/benchmark?seeds=6&n=250'); assert(bench.scenarios.nominal.rankers.orion.auroc.mean > 0.6, 'benchmark orion beats chance'); results.benchAuroc = bench.scenarios.nominal.rankers.orion.auroc.mean;
  const metrics = await get('/api/research/metrics'); assert(metrics.entities > 0, 'research metrics'); results.metricsEntities = metrics.entities;
  const ach = await post('/api/ach/evaluate', { hypotheses: [{ id: 'h1' }, { id: 'h2' }], evidence: [{ id: 'e1', weight: 1 }], ratings: { e1: { h1: 'CC', h2: 'II' } } });
  assert(ach.rows[0].hypId === 'h1', 'ACH ranks least-inconsistent first'); results.achLeader = ach.leader;
  const caseDoc = await post('/api/case/compose', { title: 'Smoke test case', entityIds: [oneId] }); assert(caseDoc.entities[0].narrative.length > 20, 'case narrative'); results.caseEntities = caseDoc.entities.length;
  const briefing = await get('/api/briefing'); assert(briefing.method === 'deterministic-template' && briefing.sections.length > 0, 'briefing'); results.briefingSections = briefing.sections.length;
  const recon = await post('/api/recon/passive', { target: 'example.com' }); assert(recon.note?.includes('offline'), 'recon disabled offline'); results.reconOfflineNote = true;
  const orbitId = (await get('/api/layer/space')).items[0].i.replace('syn:sat:', '');
  const orbitPath = await get(`/api/orbit/${orbitId}/path?minutes=30&steps=10`); assert(orbitPath.points.length > 5, 'orbit path'); results.orbitPoints = orbitPath.points.length;

  console.log(JSON.stringify({ ok: true, ...results }, null, 2));
} catch (e) {
  console.error('SMOKE TEST FAILED:', e.message);
  process.exitCode = 1;
} finally {
  child.kill('SIGTERM');
}
