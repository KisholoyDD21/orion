/** Server-Sent Events hub with heartbeats and a client cap. */
export class SseHub {
  constructor({ maxClients = 40, heartbeatMs = 20_000 } = {}) {
    this.clients = new Set(); this.maxClients = maxClients; this.seq = 0;
    this.timer = setInterval(() => this.broadcast('heartbeat', { t: Date.now() }), heartbeatMs); this.timer.unref?.();
  }
  add(req, res, hello = {}) {
    if (this.clients.size >= this.maxClients) { res.writeHead(503, { 'retry-after': '30' }); res.end('too many stream clients'); return; }
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write(`retry: 5000\nevent: hello\ndata: ${JSON.stringify(hello)}\n\n`);
    this.clients.add(res);
    req.on('close', () => this.clients.delete(res));
  }
  broadcast(event, data) {
    if (!this.clients.size) return;
    const frame = `id: ${++this.seq}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of this.clients) { try { c.write(frame); } catch { this.clients.delete(c); } }
  }
  close() { clearInterval(this.timer); for (const c of this.clients) { try { c.end(); } catch { /* ignore */ } } this.clients.clear(); }
}
