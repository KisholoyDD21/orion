/** Per-source health ledger — what a research user needs to judge whether a feed can be trusted right now. */
export class Ledger {
  constructor() { this.m = new Map(); }
  init(id, meta = {}) { if (!this.m.has(id)) this.m.set(id, { id, state: 'idle', calls: 0, failures: 0, consecutiveFailures: 0, records: 0, bytes: 0, latencyMs: null, lastAttemptAt: null, lastSuccessAt: null, lastError: null, nextRunAt: null, note: null, ...meta }); return this.m.get(id); }
  get(id) { return this.m.get(id); }
  ok(id, { records = 0, bytes = 0, ms = 0, note = null, provider = null } = {}) {
    const s = this.init(id); const now = new Date().toISOString();
    s.state = 'ok'; s.calls++; s.consecutiveFailures = 0; s.records = records; s.bytes = bytes; s.lastAttemptAt = now; s.lastSuccessAt = now; s.lastError = null; s.note = note; s.provider = provider;
    s.latencyMs = s.latencyMs == null ? ms : Math.round(0.7 * s.latencyMs + 0.3 * ms); return s;
  }
  fail(id, err, { ms = 0 } = {}) {
    const s = this.init(id); s.calls++; s.failures++; s.consecutiveFailures++; s.lastAttemptAt = new Date().toISOString();
    s.lastError = String(err?.message || err).slice(0, 240); s.state = s.lastSuccessAt ? 'degraded' : 'error'; if (ms) s.latencyMs = ms; return s;
  }
  set(id, patch) { Object.assign(this.init(id), patch); }
  all() { return [...this.m.values()]; }
}
