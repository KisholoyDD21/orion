import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { ApiError } from './validate.js';

const compile = (pattern) => {
  const keys = [];
  const src = pattern.split('/').map((seg) => (seg.startsWith(':') ? (keys.push(seg.slice(1)), '([^/]+)') : seg === '*' ? (keys.push('rest'), '(.*)') : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/');
  return { keys, re: new RegExp(`^${src}$`) };
};
export function createRouter() {
  const routes = [];
  const add = (method, pattern, handler, opts = {}) => routes.push({ method, ...compile(pattern), handler, opts, pattern });
  return {
    routes, add,
    get: (p, h, o) => add('GET', p, h, o), post: (p, h, o) => add('POST', p, h, o), put: (p, h, o) => add('PUT', p, h, o), delete: (p, h, o) => add('DELETE', p, h, o),
    match(method, pathname) {
      let pathMatched = false;
      for (const r of routes) {
        const m = r.re.exec(pathname); if (!m) continue;
        pathMatched = true;
        if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) continue;
        const params = {}; r.keys.forEach((k, i) => { try { params[k] = decodeURIComponent(m[i + 1]); } catch { params[k] = m[i + 1]; } });
        return { route: r, params };
      }
      return { route: null, pathMatched };
    },
  };
}
export async function readJsonBody(req, max = 262_144) {
  const ct = String(req.headers['content-type'] || '');
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > max) throw new ApiError(413, 'request body too large'); chunks.push(c); }
  if (!n) return {};
  if (!/^application\/json\b/i.test(ct)) throw new ApiError(415, 'content-type must be application/json');
  try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (v === null || typeof v !== 'object') throw 0; return v; } catch { throw new ApiError(400, 'invalid JSON body'); }
}
/** Sends JSON with ETag + gzip. `cache` is a Cache-Control value. */
export function sendJson(req, res, obj, status = 200, { cache = 'no-store', headers = {} } = {}) {
  const body = Buffer.from(JSON.stringify(obj));
  const etag = headers.etag || (status === 200 && req.method === 'GET' && body.length > 512 ? `W/"${crypto.createHash('sha1').update(body).digest('base64url').slice(0, 22)}"` : null);
  const h = { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache, vary: 'accept-encoding', ...headers };
  if (etag) { h.etag = etag; if (req.headers['if-none-match'] === etag) { res.writeHead(304, h); return res.end(); } }
  const ae = String(req.headers['accept-encoding'] || '');
  let out = body;
  if (body.length > 1400 && /\bgzip\b/.test(ae)) { out = zlib.gzipSync(body, { level: 5 }); h['content-encoding'] = 'gzip'; }
  h['content-length'] = out.length;
  res.writeHead(status, h);
  res.end(req.method === 'HEAD' ? undefined : out);
}
export const sendText = (req, res, text, status = 200, type = 'text/plain; charset=utf-8', headers = {}) => {
  const buf = Buffer.from(text); res.writeHead(status, { 'content-type': type, 'content-length': buf.length, 'cache-control': 'no-store', ...headers }); res.end(req.method === 'HEAD' ? undefined : buf);
};
