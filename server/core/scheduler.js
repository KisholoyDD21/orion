// Runs each adapter on its own cadence with jitter and exponential back-off. Failed refreshes keep the previous records (their freshness simply decays).
export function createScheduler({ adapters, ctx, store, ledger, sse, log, onData }) {
  const jobs = new Map();
  const refreshFor = (a) => (typeof a.refreshMs === 'function' ? a.refreshMs(ctx.config) : a.meta.refreshMs);
  async function runJob(job) {
    if (job.running) return; job.running = true; clearTimeout(job.timer);
    const a = job.adapter, t0 = Date.now(); ledger.set(a.id, { state: ledger.get(a.id)?.lastSuccessAt ? 'ok' : 'idle', running: true });
    try {
      const res = await a.run(ctx);
      if (!a.enrichment) store.replaceSource(a.id, res.records);
      ledger.ok(a.id, { records: res.records.length, bytes: res.bytes || 0, ms: res.ms ?? Date.now() - t0, note: res.note || null, provider: res.provider || null });
      job.failures = 0; log.debug(`${a.id}: ${res.records.length} records in ${Date.now() - t0} ms`);
      onData?.(a, res);
    } catch (e) {
      job.failures++; ledger.fail(a.id, e, { ms: Date.now() - t0 }); log.warn(`${a.id} refresh failed (${job.failures}): ${e.message}`);
    } finally {
      job.running = false;
      const base = refreshFor(a), delay = (job.failures ? Math.min(30 * 60_000, base * 2 ** Math.min(job.failures, 5)) : base) * (0.9 + Math.random() * 0.2);
      ledger.set(a.id, { running: false, nextRunAt: new Date(Date.now() + delay).toISOString() });
      sse.broadcast('source', ledger.get(a.id));
      job.timer = setTimeout(() => runJob(job), delay); job.timer.unref?.();
    }
  }
  return {
    start() {
      adapters.forEach((a, i) => {
        ledger.init(a.id, { name: a.meta.name, domain: a.meta.domain, enabled: true, refreshMs: refreshFor(a) });
        const job = { adapter: a, failures: 0, timer: null, running: false }; jobs.set(a.id, job);
        job.timer = setTimeout(() => runJob(job), (a.meta.startDelayMs || 0) + i * 600); job.timer.unref?.();
      });
    },
    runNow(id) { const j = jobs.get(id); if (j && !j.running) runJob(j); return !!j; },
    stop() { for (const j of jobs.values()) clearTimeout(j.timer); },
  };
}
