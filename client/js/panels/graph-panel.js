// A small hand-rolled force-directed layout — at ORION's graph scale (tens to ~150 nodes) a physics library would
// be a heavier dependency than the problem needs. Repulsion + spring edges + light centering, drag to reposition.
import { api } from '../api.js';
import { bus } from '../state.js';
import { escapeHtml } from '../format.js';

export const meta = { id: 'graph', icon: '◍', title: 'Graph' };
const KIND_COLOR = { air: '#5fc4ff', maritime: '#2fd3a0', space: '#b79cff', seismic: '#ff7a3d', hazard: '#ffc247', media: '#f3e96b', cyber: '#ff5fa8', vuln: '#ff9db8', infra: '#8fe3ff', country: '#aebac6', asn: '#ff9d3d', malware: '#ff5470', vendor: '#f2d24d', cwe: '#71808c', source: '#4c5966' };

export function mount(host) {
  let disposed = false, nodes = [], edges = [], byId = new Map(), raf = null, drag = null, hover = null, cam = { x: 0, y: 0, k: 1 }, panStart = null;
  host.innerHTML = `<div class="panel"><div class="panel-head"><h2>Analysis graph</h2><p>Entities linked by proximity, shared indicators, and correlation rules. Drag nodes, scroll to zoom.</p></div>
    <div class="graph-legend">${Object.entries(KIND_COLOR).map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`).join('')}</div>
    <div class="panel-body no-pad" style="flex:1;position:relative;min-height:220px;"><canvas id="graph-canvas"></canvas></div>
    <div class="panel-foot"><button class="btn btn-sm btn-block" id="graph-reload">Refresh graph</button></div></div>`;
  const canvas = host.querySelector('#graph-canvas'), ctx = canvas.getContext('2d');
  function resize() { const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight; canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  const ro = new ResizeObserver(resize); ro.observe(canvas);

  function step() {
    const W = canvas.clientWidth || 300, H = canvas.clientHeight || 200;
    for (const a of nodes) {
      let fx = (W / 2 - a.x) * 0.0025, fy = (H / 2 - a.y) * 0.0025;
      for (const b of nodes) { if (a === b) continue; const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + 30; const rep = 1400 / d2; fx += (dx / Math.sqrt(d2)) * rep; fy += (dy / Math.sqrt(d2)) * rep; }
      a.vx = (a.vx + fx) * 0.78; a.vy = (a.vy + fy) * 0.78;
    }
    for (const e of edges) { const a = byId.get(e.a), b = byId.get(e.b); if (!a || !b) continue; const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - 70) * 0.018 * (e.weight ?? 0.5); a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f; }
    for (const a of nodes) if (a !== drag) { a.x += a.vx; a.y += a.vy; }
  }
  function draw() {
    const W = canvas.clientWidth, H = canvas.clientHeight; ctx.clearRect(0, 0, W, H); ctx.save(); ctx.translate(cam.x, cam.y); ctx.scale(cam.k, cam.k);
    ctx.lineWidth = 1;
    for (const e of edges) { const a = byId.get(e.a), b = byId.get(e.b); if (!a || !b) continue; ctx.strokeStyle = `rgba(180,200,210,${0.06 + (e.weight ?? 0.3) * 0.22})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    for (const n of nodes) {
      const r = 3 + Math.min(9, (n.pagerank || 0) * 2 + (n.priority || 0) / 20);
      ctx.fillStyle = KIND_COLOR[n.kind] || '#8fe3ff'; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
      if (n === hover || n.degree > 3) { ctx.fillStyle = 'rgba(238,243,246,.85)'; ctx.font = `${10 / cam.k}px sans-serif`; ctx.fillText(n.label.slice(0, 26), n.x + r + 3, n.y + 3); }
    }
    ctx.restore();
  }
  function loop() { if (disposed) return; step(); draw(); raf = requestAnimationFrame(loop); }
  function nodeAt(px, py) { const x = (px - cam.x) / cam.k, y = (py - cam.y) / cam.k; let best = null, bd = 14; for (const n of nodes) { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = n; } } return best; }

  canvas.addEventListener('pointerdown', (e) => { const rect = canvas.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top; const n = nodeAt(px, py); if (n) { drag = n; canvas.setPointerCapture(e.pointerId); } else panStart = { x: e.clientX - cam.x, y: e.clientY - cam.y }; });
  canvas.addEventListener('pointermove', (e) => { const rect = canvas.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top;
    if (drag) { drag.x = (px - cam.x) / cam.k; drag.y = (py - cam.y) / cam.k; drag.vx = drag.vy = 0; }
    else if (panStart) { cam.x = e.clientX - panStart.x; cam.y = e.clientY - panStart.y; }
    else hover = nodeAt(px, py);
  });
  window.addEventListener('pointerup', () => { drag = null; panStart = null; });
  const ENTITY_ID = /^(usgs|eonet|adsb|osky|digitraffic|celestrak|sat|gdelt|kev|nvd|feodo|syn):/;
  canvas.addEventListener('click', (e) => { const rect = canvas.getBoundingClientRect(); const n = nodeAt(e.clientX - rect.left, e.clientY - rect.top); if (n && ENTITY_ID.test(n.id)) bus.emit('entity:select', n.id); });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); const rect = canvas.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top; const k2 = Math.min(3, Math.max(0.3, cam.k * (e.deltaY > 0 ? 0.9 : 1.1))); cam.x = mx - ((mx - cam.x) / cam.k) * k2; cam.y = my - ((my - cam.y) / cam.k) * k2; cam.k = k2; }, { passive: false });

  async function load() {
    try { const g = await api.graphOverview({ limit: 110 }); if (disposed) return;
      const W = canvas.clientWidth || 300, H = canvas.clientHeight || 200;
      nodes = g.nodes.map((n) => ({ ...n, x: W / 2 + (Math.random() - 0.5) * 200, y: H / 2 + (Math.random() - 0.5) * 200, vx: 0, vy: 0 }));
      byId = new Map(nodes.map((n) => [n.id, n])); edges = g.edges;
    } catch (e) { console.warn('[orion] graph load failed', e.message); }
  }
  resize(); load(); loop();
  host.querySelector('#graph-reload').addEventListener('click', load);
  return () => { disposed = true; ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
}
