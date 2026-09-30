// Outbound HTTP client: timeouts, size caps, polite per-host pacing, injectable fetch (for tests).
export class HttpError extends Error {
  constructor(message, { status, url, body } = {}) { super(message); this.name = 'HttpError'; this.status = status; this.url = url; this.body = body; }
}
async function readCapped(res, maxBytes, url) {
  const declared = Number(res.headers.get('content-length'));
  if (declared && declared > maxBytes) throw new HttpError(`response too large (${declared} > ${maxBytes} bytes)`, { status: res.status, url });
  const reader = res.body?.getReader?.();
  if (!reader) return Buffer.from(await res.arrayBuffer());
  const chunks = []; let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > maxBytes) { reader.cancel().catch(() => {}); throw new HttpError(`response exceeded ${maxBytes} bytes`, { status: res.status, url }); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export function createHttp({ userAgent, limiter = null, fetchImpl = globalThis.fetch } = {}) {
  async function request(url, { method = 'GET', headers = {}, body, timeoutMs = 12_000, maxBytes = 25_000_000, expect = 'json', retries = 0 } = {}) {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new HttpError('unsupported protocol', { url });
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (limiter) await limiter.take(u.host);
      const t0 = Date.now();
      try {
        const res = await fetchImpl(url, {
          method, body, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs),
          headers: { 'user-agent': userAgent, accept: expect === 'json' ? 'application/json' : '*/*', ...headers },
        });
        const buf = await readCapped(res, maxBytes, url);
        const text = buf.toString('utf8');
        if (!res.ok) throw new HttpError(`HTTP ${res.status} from ${u.host}`, { status: res.status, url, body: text.slice(0, 300) });
        let data = text;
        if (expect === 'json') {
          try { data = JSON.parse(text); } catch { throw new HttpError(`non-JSON response from ${u.host}: ${text.slice(0, 120).replace(/\s+/g, ' ')}`, { status: res.status, url }); }
        }
        return { data, status: res.status, headers: res.headers, bytes: buf.length, ms: Date.now() - t0 };
      } catch (e) {
        lastErr = e;
        const retriable = e.name === 'TimeoutError' || e.name === 'AbortError' || (e instanceof HttpError && e.status >= 500) || e.cause?.code === 'ECONNRESET';
        if (!retriable || attempt === retries) break;
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
      }
    }
    if (lastErr?.name === 'TimeoutError') throw new HttpError(`timeout after ${timeoutMs} ms (${u.host})`, { url });
    if (lastErr && !(lastErr instanceof HttpError)) throw new HttpError(`${lastErr.cause?.code || lastErr.name}: ${lastErr.message} (${u.host})`, { url });
    throw lastErr;
  }
  return { request, json: (url, o) => request(url, { ...o, expect: 'json' }), text: (url, o) => request(url, { ...o, expect: 'text' }) };
}
