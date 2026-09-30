import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, bearingDeg, destination, greatCircle, pointInPolygon, GeoIndex, normLon } from '../shared/geo.js';
import { sunPosition, subsolarPoint, twilight } from '../shared/sun.js';
import { scoreFactors, sensitivity, freshness, noisyOr, DEFAULT_WEIGHTS, explain } from '../shared/scoring.js';
import { credibilityFrom, grade, reliabilityP } from '../shared/admiralty.js';
import { termFor, confidenceLevel } from '../shared/estimative.js';
import { Graph } from '../shared/graph.js';
import { computeACH } from '../shared/ach.js';
import { Rng } from '../shared/prng.js';
import { auroc, spearman, kendallTau, ece, bootstrapCI, quantile } from '../shared/stats.js';

test('haversine: London-New York ≈ 5570 km, symmetric, zero on identity', () => {
  const d = haversineKm(51.5074, -0.1278, 40.7128, -74.006);
  assert.ok(Math.abs(d - 5570) < 25, `got ${d}`);
  assert.equal(haversineKm(10, 20, 10, 20), 0);
  assert.ok(Math.abs(d - haversineKm(40.7128, -74.006, 51.5074, -0.1278)) < 1e-9);
});
test('bearing & destination are consistent', () => {
  const [lat, lon] = destination(10, 20, 90, 500);
  assert.ok(Math.abs(haversineKm(10, 20, lat, lon) - 500) < 0.5);
  assert.ok(Math.abs(bearingDeg(0, 0, 0, 10) - 90) < 1e-6);
  assert.equal(normLon(190), -170);
});
test('great circle endpoints and midpoint length', () => {
  const p = greatCircle(28.6, 77.2, 51.5, -0.12, 20);
  assert.ok(Math.abs(p[0][0] - 28.6) < 1e-6 && Math.abs(p.at(-1)[1] + 0.12) < 1e-6);
  const total = haversineKm(28.6, 77.2, 51.5, -0.12);
  let sum = 0; for (let i = 1; i < p.length; i++) sum += haversineKm(...p[i - 1], ...p[i]);
  assert.ok(Math.abs(sum - total) < 5);
});
test('pointInPolygon handles holes and multipolygons', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], hole = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
  assert.ok(pointInPolygon(2, 2, { type: 'Polygon', coordinates: [sq, hole] }));
  assert.ok(!pointInPolygon(5, 5, { type: 'Polygon', coordinates: [sq, hole] }));
  assert.ok(pointInPolygon(20, 20, { type: 'MultiPolygon', coordinates: [[sq], [[[15, 15], [25, 15], [25, 25], [15, 25], [15, 15]]]] }));
});
test('GeoIndex radius query matches brute force incl. antimeridian', () => {
  const rng = new Rng(3), pts = Array.from({ length: 400 }, (_, i) => ({ id: i, lat: rng.range(-60, 60), lon: rng.range(-180, 180) })), idx = new GeoIndex(2);
  pts.forEach((p) => idx.insert(p, p.lat, p.lon));
  for (const [lat, lon, km] of [[10, 179.5, 900], [-20, -179, 700], [45, 0, 1200]]) {
    const a = idx.within(lat, lon, km).map((r) => r.item.id).sort((x, y) => x - y);
    const b = pts.filter((p) => haversineKm(lat, lon, p.lat, p.lon) <= km).map((p) => p.id).sort((x, y) => x - y);
    assert.deepEqual(a, b);
  }
});
test('sun position: London solar noon in June and subsolar point at equinox', () => {
  const s = sunPosition(new Date('2026-06-21T12:01:00Z'), 51.5, 0);
  assert.ok(Math.abs(s.elevation - 61.9) < 0.7, `elev ${s.elevation}`);
  assert.ok(Math.abs(s.azimuth - 180) < 3, `az ${s.azimuth}`);
  const sub = subsolarPoint(new Date('2026-03-20T12:00:00Z'));
  assert.ok(Math.abs(sub.lat) < 1.2 && Math.abs(sub.lon) < 5, JSON.stringify(sub));
  assert.equal(twilight(-8), 'nautical twilight');
});
test('scoring: monotone in each factor, bounded, deterministic sensitivity', () => {
  const base = { S: 0.6, Y: 0.5, R: 0.8, C: 0.6, F: 0.7, K: 0.3 }, p0 = scoreFactors(base).priority;
  for (const k of ['S', 'Y', 'R', 'C', 'F', 'K']) assert.ok(scoreFactors({ ...base, [k]: base[k] + 0.2 }).priority > p0, `monotone in ${k}`);
  assert.ok(scoreFactors({ S: 1, Y: 1, R: 1, C: 1, F: 1, K: 1 }).priority <= 100 && scoreFactors({ S: 0, Y: 0, R: 0, C: 0, F: 0, K: 0 }).priority >= 0);
  assert.deepEqual(sensitivity(base, { key: 'a' }), sensitivity(base, { key: 'a' }));
  const s = sensitivity(base, { key: 'a' }); assert.ok(s.p05 <= s.p50 && s.p50 <= s.p95);
  const k = 3, scaled = Object.fromEntries(Object.entries(DEFAULT_WEIGHTS).map(([n, v]) => [n, v * k]));
  assert.ok(Math.abs(scoreFactors(base, scaled).priority - p0) < 1e-6, 'weight scale invariance');
  assert.ok(['reliability', 'credibility', 'freshness', 'corroboration'].includes(explain(base).limitingFactor));
});
test('freshness halves every half-life; noisy-OR grows with independent sources', () => {
  assert.ok(Math.abs(freshness(120, 'air') - 0.5) < 1e-9);
  assert.ok(noisyOr([0.5, 0.5]) > noisyOr([0.5]) && noisyOr([]) === 0);
});
test('admiralty helpers', () => {
  assert.equal(grade('B', 2), 'B2'); assert.equal(credibilityFrom({ independentAgree: 2 }), 1);
  assert.equal(credibilityFrom({ independentAgree: 0 }), 3); assert.equal(credibilityFrom({ judgeable: false }), 6);
  assert.ok(reliabilityP('A') > reliabilityP('E'));
});
test('estimative language & confidence levels', () => { assert.equal(termFor(0.9), 'very likely'); assert.equal(termFor(0.5), 'roughly even chance'); assert.equal(confidenceLevel(0.8), 'high'); });
test('graph: shortest path, components, pagerank, communities, GraphML', () => {
  const g = new Graph(); ['a', 'b', 'c', 'd', 'e', 'x'].forEach((id) => g.addNode({ id, label: id, type: 't' }));
  g.addEdge('a', 'b'); g.addEdge('b', 'c'); g.addEdge('c', 'd'); g.addEdge('d', 'e'); g.addEdge('a', 'c', 'shortcut', 0.2);
  assert.equal(g.shortestPath('a', 'e').hops, 3); assert.equal(g.shortestPath('a', 'x'), null);
  assert.equal(g.components().length, 2);
  const pr = g.pagerank(); assert.ok(Math.abs([...pr.values()].reduce((a, b) => a + b, 0) - 1) < 1e-6);
  assert.ok(pr.get('c') > pr.get('e'));
  assert.ok(g.communities().length >= 1); assert.ok(g.toGraphML().includes('<graphml')); assert.equal(Graph.fromJSON(g.toJSON()).edges.length, g.edges.length);
  assert.equal(g.addEdge('a', 'b'), null, 'duplicate edges are ignored');
});
test('ACH ranks by inconsistency and flags fragile evidence', () => {
  const hypotheses = [{ id: 'H1' }, { id: 'H2' }, { id: 'H3' }], evidence = [{ id: 'E1', weight: 2 }, { id: 'E2' }, { id: 'E3' }];
  const ratings = { E1: { H1: 'C', H2: 'I', H3: 'II' }, E2: { H1: 'C', H2: 'C', H3: 'C' }, E3: { H1: 'N', H2: 'I', H3: 'C' } };
  const r = computeACH({ hypotheses, evidence, ratings });
  assert.equal(r.leader, 'H1'); assert.equal(r.rows[0].inconsistency, 0); assert.equal(r.diagnosticity.find((d) => d.evId === 'E2').diagnostic, false);
  assert.ok(r.margin > 0); assert.ok(Array.isArray(r.fragileEvidence));
});
test('stats: AUROC, Spearman, Kendall, ECE, bootstrap CI', () => {
  assert.equal(auroc([0.9, 0.8, 0.3, 0.1], [1, 1, 0, 0]), 1); assert.equal(auroc([0.5, 0.5], [1, 0]), 0.5);
  assert.ok(Math.abs(spearman([1, 2, 3, 4], [10, 20, 30, 40]) - 1) < 1e-9); assert.equal(kendallTau([1, 2, 3], [3, 2, 1]), -1);
  assert.ok(ece([0.9, 0.9, 0.1, 0.1], [1, 1, 0, 0]) < 0.11);
  const ci = bootstrapCI([1, 2, 3, 4, 5], { seed: 1 }); assert.ok(ci.lo <= 3 && ci.hi >= 3);
  assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
});
