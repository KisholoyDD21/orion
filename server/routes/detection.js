import path from 'node:path';
import { ApiError, clampInt } from '../lib/validate.js';
import { loadRules, evaluate } from '../detection/engine.js';
export function registerDetection(router, d) {
  const { config, ref, store, log } = d;
  const attackIds = new Set(ref.attack.techniques.map((t) => t.id));
  let cache = null;
  const rules = () => { if (!cache) { cache = loadRules(path.join(config.dataDir, 'rules'), { attackIds }); if (cache.errors.length) log.warn(`detection rules: ${cache.errors.length} file(s) failed to load: ${cache.errors.map((e) => e.file).join(', ')}`); } return cache; };

  router.get('/api/detection/rules', () => { const { rules: rs, errors } = rules(); return { count: rs.length, errors, rules: rs.map(({ test, ...r }) => r) }; });
  router.post('/api/detection/reload', () => { cache = null; const { rules: rs, errors } = rules(); return { reloaded: true, count: rs.length, errors }; });
  router.post('/api/detection/evaluate', (c) => {
    const { rules: rs } = rules();
    const target = Array.isArray(c.body.entityIds) && c.body.entityIds.length ? c.body.entityIds.map((id) => store.get(String(id))).filter(Boolean) : store.all();
    return { count: target.length, matches: evaluate(rs, target).slice(0, clampInt(c.body.limit, 200, 1, 1000)) };
  });

  router.get('/api/attack/matrix', (c) => {
    const covered = new Set(rules().rules.flatMap((r) => r.tags.filter((t) => t.startsWith('attack.t')).map((t) => t.slice(7).toUpperCase())));
    const active = new Set(store.all().filter((e) => e.type === 'cyber' || e.type === 'vuln').flatMap((e) => e.fusion?.rules?.flatMap((r) => (r.detail?.match(/T\d{4}(\.\d{3})?/g) || [])) || []));
    const byTactic = new Map(ref.attack.tactics.map((t) => [t.short, { id: t.id, name: t.name, short: t.short, techniques: [] }]));
    for (const t of ref.attack.techniques) for (const short of t.tactics) byTactic.get(short)?.techniques.push({ id: t.id, name: t.name, sub: t.sub, hasOrionRule: covered.has(t.id) });
    return { version: ref.attack.version, modified: ref.attack.modified, counts: ref.attack.counts, coverage: { ruleTagged: covered.size, total: ref.attack.techniques.length }, tactics: [...byTactic.values()] };
  });
}
