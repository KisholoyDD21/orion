import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.geojson': 'application/geo+json; charset=utf-8', '.czml': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.map': 'application/json', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2', '.b3dm': 'application/octet-stream', '.terrain': 'application/octet-stream' };
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.geojson', '.svg', '.xml', '.txt', '.md', '.wasm']);

/** mounts: [{ prefix: '/vendor/cesium/', dir: '/abs/path', cache: 'public, max-age=86400', allow: /\.json$/ }] — longest prefix wins. */
export function createStatic(mounts) {
  const sorted = [...mounts].sort((a, b) => b.prefix.length - a.prefix.length).map((m) => ({ ...m, dir: path.resolve(m.dir) }));
  const gz = new Map(); // `${file}|${mtime}` -> Buffer
  return function serve(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const m = sorted.find((x) => pathname === x.prefix.slice(0, -1) || pathname.startsWith(x.prefix));
    if (!m) return false;
    let rel; try { rel = decodeURIComponent(pathname.slice(m.prefix.length)); } catch { return deny(res, 400); }
    if (rel.includes('\0') || rel.includes('\\')) return deny(res, 400);
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(m.dir, '.' + path.sep + rel);
    if (file !== m.dir && !file.startsWith(m.dir + path.sep)) return deny(res, 403);
    if (path.basename(file).startsWith('.')) return deny(res, 404);
    if (m.allow && !m.allow.test(file)) return deny(res, 404);
    let st; try { st = fs.statSync(file); } catch { return deny(res, 404); }
    if (!st.isFile()) return deny(res, 404);
    const ext = path.extname(file).toLowerCase();
    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': m.cache || 'no-cache', etag, 'last-modified': st.mtime.toUTCString(), vary: 'accept-encoding' };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return true; }
    const wantGzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] || '')) && st.size > 1024 && st.size < 40_000_000;
    if (wantGzip) {
      const key = `${file}|${st.mtimeMs}`; let buf = gz.get(key);
      if (!buf) { buf = zlib.gzipSync(fs.readFileSync(file), { level: 6 }); if (gz.size > 60) gz.clear(); gz.set(key, buf); }
      headers['content-encoding'] = 'gzip'; headers['content-length'] = buf.length;
      res.writeHead(200, headers); res.end(req.method === 'HEAD' ? undefined : buf); return true;
    }
    headers['content-length'] = st.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return true; }
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
    return true;
  };
}
function deny(res, code) { res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }); res.end(code === 404 ? 'Not found' : code === 403 ? 'Forbidden' : 'Bad request'); return true; }
