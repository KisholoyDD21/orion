// Outbound: per-host minimum-interval scheduler (politeness towards free public APIs).
// Inbound: fixed-window counters per client key (defence against runaway scripts, not a DoS shield).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export class HostLimiter {
  constructor(minIntervalMs = {}) { this.min = minIntervalMs; this.next = new Map(); }
  async take(host) {
    const gap = this.min[host]; if (!gap) return;
    const now = Date.now(), at = Math.max(now, this.next.get(host) || 0);
    this.next.set(host, at + gap);
    if (at > now) await sleep(at - now);
  }
}
export const DEFAULT_HOST_GAPS = Object.freeze({
  'api.airplanes.live': 1100, 'api.adsb.lol': 1100, 'api.adsb.one': 1100, 'opensky-network.org': 10500,
  'api.gdeltproject.org': 5200, 'services.nvd.nist.gov': 6500, 'crt.sh': 2500, 'celestrak.org': 2500,
  'internetdb.shodan.io': 1100, 'rdap.org': 600, 'stat.ripe.net': 600, 'api.first.org': 1100,
  'meri.digitraffic.fi': 1500, 'eonet.gsfc.nasa.gov': 800, 'earthquake.usgs.gov': 800,
});
export class WindowLimiter {
  constructor(limit, windowMs = 60_000) { this.limit = limit; this.windowMs = windowMs; this.hits = new Map(); }
  check(key, now = Date.now()) {
    let h = this.hits.get(key);
    if (!h || now - h.start >= this.windowMs) { h = { start: now, n: 0 }; this.hits.set(key, h); if (this.hits.size > 5000) this.gc(now); }
    h.n++;
    return { ok: h.n <= this.limit, remaining: Math.max(0, this.limit - h.n), resetMs: h.start + this.windowMs - now };
  }
  gc(now) { for (const [k, h] of this.hits) if (now - h.start >= this.windowMs) this.hits.delete(k); }
}
