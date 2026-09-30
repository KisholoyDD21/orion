import fs from 'node:fs';
import path from 'node:path';
/** TTL cache with single-flight loading and stale-if-error. */
export class TTLCache {
  constructor({ max = 500 } = {}) { this.max = max; this.m = new Map(); this.inflight = new Map(); }
  get(k, { allowStale = false } = {}) { const e = this.m.get(k); if (!e) return undefined; if (e.exp < Date.now() && !allowStale) return undefined; return e.v; }
  set(k, v, ttlMs) { if (this.m.size >= this.max) this.m.delete(this.m.keys().next().value); this.m.set(k, { v, exp: Date.now() + ttlMs }); return v; }
  delete(k) { return this.m.delete(k); }
  get size() { return this.m.size; }
  async getOrLoad(k, ttlMs, loader) {
    const hit = this.get(k); if (hit !== undefined) return hit;
    if (this.inflight.has(k)) return this.inflight.get(k);
    const p = (async () => { try { return this.set(k, await loader(), ttlMs); } catch (e) { const stale = this.get(k, { allowStale: true }); if (stale !== undefined) return stale; throw e; } finally { this.inflight.delete(k); } })();
    this.inflight.set(k, p); return p;
  }
}
/** Atomic JSON persistence (write temp file, then rename). */
export function readJsonSync(file, dflt = null) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return dflt; } }
export function writeJsonAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj)); fs.renameSync(tmp, file);
}
export function fileAgeMs(file) { try { return Date.now() - fs.statSync(file).mtimeMs; } catch { return Infinity; } }
