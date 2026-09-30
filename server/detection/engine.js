// A Sigma-syntax detection engine for ORION's own multi-domain entity schema. The YAML reader (yaml.js) is
// Sigma-compatible (differentially tested against PyYAML on the full public SigmaHQ rule corpus, see
// docs/METHODOLOGY.md §6) but the rule *content* here is ORION-authored against ORION's fields, not a generic
// EDR/log schema — real SigmaHQ rules will parse but will not usefully match this data, and this engine does not
// claim otherwise. The condition grammar (selection names combined with and/or/not/parentheses, "1 of"/"all of")
// covers the common core of Sigma; numeric comparison modifiers (|gte, |lte, |gt, |lt) are a documented ORION
// extension, since base Sigma has no numeric-range modifier.
import fs from 'node:fs';
import path from 'node:path';
import { parseYamlAll, YamlError } from './yaml.js';

const get = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const MODS = {
  eq: (v, x) => (Array.isArray(x) ? x.some((y) => eqOne(v, y)) : eqOne(v, x)),
  contains: (v, x) => typeof v === 'string' && String(x).split('|').some || String(v).toLowerCase().includes(String(x).toLowerCase()),
  startswith: (v, x) => typeof v === 'string' && v.toLowerCase().startsWith(String(x).toLowerCase()),
  endswith: (v, x) => typeof v === 'string' && v.toLowerCase().endsWith(String(x).toLowerCase()),
  re: (v, x) => { try { return new RegExp(x, 'i').test(String(v ?? '')); } catch { return false; } },
  gte: (v, x) => Number(v) >= Number(x), lte: (v, x) => Number(v) <= Number(x), gt: (v, x) => Number(v) > Number(x), lt: (v, x) => Number(v) < Number(x),
  exists: (v, x) => (x ? v !== undefined && v !== null : v === undefined || v === null),
};
const eqOne = (v, x) => (typeof v === 'boolean' || typeof x === 'boolean' ? Boolean(v) === Boolean(x) : String(v ?? '').toLowerCase() === String(x).toLowerCase());

function compileSelection(sel) {
  if (Array.isArray(sel)) { const cs = sel.map(compileSelection); return (r) => cs.some((f) => f(r)); } // list of maps = OR
  const checks = Object.entries(sel).map(([key, want]) => {
    const [field, mod = 'eq'] = key.split('|'); const fn = MODS[mod]; if (!fn) throw new Error(`unknown modifier |${mod}`);
    return (r) => fn(get(r, field), want);
  });
  return (r) => checks.every((c) => c(r)); // map = AND of its keys
}
function tokenize(cond) { return cond.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').trim().split(/\s+/); }
/** Recursive-descent parser for: term := NAME | '1' 'of' NAME | 'all' 'of' NAME | '(' expr ')'; supports not/and/or with and-tighter-than-or. */
function compileCondition(cond, selections) {
  const toks = tokenize(cond); let i = 0;
  const peek = () => toks[i]; const eat = (t) => { if (t && toks[i] !== t) throw new Error(`expected "${t}" near "${toks[i]}" in condition`); return toks[i++]; };
  const namesMatching = (pat) => { const names = Object.keys(selections); if (pat === 'them') return names; const pfx = pat.replace(/\*$/, ''); return names.filter((n) => n.startsWith(pfx)); };
  function term() {
    if (peek() === '(') { eat('('); const e = orExpr(); eat(')'); return e; }
    if (peek() === 'not') { eat('not'); const e = term(); return (r) => !e(r); }
    if (peek() === '1' || peek() === 'all') { const kind = eat(); eat('of'); const names = namesMatching(eat()); if (!names.length) throw new Error(`"${kind} of" matched no selections`); const fns = names.map((n) => selections[n]); return kind === '1' ? (r) => fns.some((f) => f(r)) : (r) => fns.every((f) => f(r)); }
    const name = eat(); if (!(name in selections)) throw new Error(`unknown selection "${name}"`); return selections[name];
  }
  function andExpr() { let e = term(); while (peek() === 'and') { eat('and'); const rhs = term(); const lhs = e; e = (r) => lhs(r) && rhs(r); } return e; }
  function orExpr() { let e = andExpr(); while (peek() === 'or') { eat('or'); const rhs = andExpr(); const lhs = e; e = (r) => lhs(r) || rhs(r); } return e; }
  const fn = orExpr(); if (i !== toks.length) throw new Error(`unexpected token "${toks[i]}" in condition`); return fn;
}
export function compileRule(doc, { attackIds = null } = {}) {
  if (!doc || typeof doc !== 'object') throw new Error('rule is not a mapping');
  const det = doc.detection; if (!det || !det.condition) throw new Error('missing detection.condition');
  const selections = Object.fromEntries(Object.entries(det).filter(([k]) => k !== 'condition').map(([k, v]) => [k, compileSelection(v)]));
  const test = compileCondition(String(det.condition), selections);
  const tags = (doc.tags || []).map(String);
  const unknownAttack = attackIds ? tags.filter((t) => t.startsWith('attack.t') && !attackIds.has(t.slice(7).toUpperCase().replace('.', '.'))) : [];
  return { id: doc.id || null, title: doc.title || '(untitled rule)', description: doc.description || '', level: doc.level || 'medium', status: doc.status || 'experimental', logsource: doc.logsource || {}, tags, references: doc.references || [], falsepositives: doc.falsepositives || [], author: doc.author || null, unknownAttack, test };
}
export function loadRules(dir, { attackIds = null } = {}) {
  const rules = [], errors = [];
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (!/\.ya?ml$/i.test(f)) continue;
    const file = path.join(dir, f);
    try {
      for (const doc of parseYamlAll(fs.readFileSync(file, 'utf8'))) {
        try { rules.push({ file: f, ...compileRule(doc, { attackIds }) }); } catch (e) { errors.push({ file: f, error: e.message }); }
      }
    } catch (e) { errors.push({ file: f, error: e instanceof YamlError ? e.message : String(e.message || e) }); }
  }
  return { rules, errors };
}
/** Flattens a fused ORION entity into the record shape rules match against: raw attrs at top level, plus a
 *  few ORION-derived fields (prefixed `_`) computed by the fusion engine, kept clearly distinct from source data. */
export function toRecord(e) {
  const f = e.fusion, ctx = f?.context;
  return { type: e.type, subtype: e.subtype, layer: e.layer, source: e.source, synthetic: !!e.synthetic, name: e.name, severity: e.severity, ...e.attrs,
    _priority: f?.priority ?? 0, _band: f?.band ?? 'routine', _admiralty: f?.admiralty ?? null, _corroborated: (f?.corroborators?.length ?? 0) > 0,
    _nearNuclearKm: ctx?.nuclear?.km ?? null, _nearAirportKm: ctx?.airport?.km ?? null, _nearPlaceKm: ctx?.place?.km ?? null };
}
export function evaluate(rules, entities) {
  const matches = [];
  for (const e of entities) {
    const rec = toRecord(e);
    for (const r of rules) { let hit = false; try { hit = r.test(rec); } catch { hit = false; } if (hit) matches.push({ ruleId: r.id, title: r.title, level: r.level, tags: r.tags, entityId: e.id, entityName: e.name, layer: e.layer, priority: e.fusion?.priority ?? 0, synthetic: e.synthetic }); }
  }
  return matches.sort((a, b) => (LEVEL_RANK[b.level] || 0) - (LEVEL_RANK[a.level] || 0) || b.priority - a.priority);
}
const LEVEL_RANK = { critical: 4, high: 3, medium: 2, low: 1, informational: 0 };
