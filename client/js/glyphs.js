// Canvas-drawn billboard textures: one distinct glyph SHAPE per layer (so layer identity survives grayscale /
// colour-vision-deficient viewing) plus a thin outer ring coloured by priority BAND — two independent visual
// channels, per shared/taxonomy.js. Textures are cached and reused across every entity in a layer/band pair.
const CACHE = new Map();
const BAND_RING = { critical: '#ff5470', high: '#ff9d3d', elevated: '#f2d24d', routine: null };
function ring(ctx, cx, cy, r, color) { if (!color) return; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
function base(size) { const c = document.createElement('canvas'); c.width = c.height = size; return [c, c.getContext('2d')]; }
const SHAPES = {
  chevron(ctx, cx, cy, s, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s * 0.85, cy + s * 0.7); ctx.lineTo(cx, cy + s * 0.3); ctx.lineTo(cx - s * 0.85, cy + s * 0.7); ctx.closePath(); ctx.fill(); },
  diamond(ctx, cx, cy, s, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy); ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s, cy); ctx.closePath(); ctx.fill(); },
  cross(ctx, cx, cy, s, color) { ctx.strokeStyle = color; ctx.lineWidth = s * 0.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx - s, cy); ctx.lineTo(cx + s, cy); ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy + s); ctx.stroke(); },
  ring(ctx, cx, cy, s, color) { ctx.strokeStyle = color; ctx.lineWidth = s * 0.35; ctx.beginPath(); ctx.arc(cx, cy, s * 0.7, 0, Math.PI * 2); ctx.stroke(); },
  hex(ctx, cx, cy, s, color) { ctx.fillStyle = color; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i - Math.PI / 2, x = cx + s * Math.cos(a), y = cy + s * Math.sin(a); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); ctx.fill(); },
  square(ctx, cx, cy, s, color) { ctx.fillStyle = color; const r = s * 0.75; ctx.fillRect(cx - r, cy - r, r * 2, r * 2); },
  octagon(ctx, cx, cy, s, color) { ctx.fillStyle = color; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 4 * i - Math.PI / 8, x = cx + s * Math.cos(a), y = cy + s * Math.sin(a); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); ctx.fill(); },
  target(ctx, cx, cy, s, color) { ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(cx, cy, s * 0.75, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2); ctx.stroke(); },
};
export function glyphCanvas(shape, color, band = 'routine', { size = 30, dim = false } = {}) {
  const key = `${shape}:${color}:${band}:${dim}`; if (CACHE.has(key)) return CACHE.get(key);
  const [c, ctx] = base(size), cx = size / 2, cy = size / 2;
  ctx.globalAlpha = dim ? 0.55 : 1;
  (SHAPES[shape] || SHAPES.square)(ctx, cx, cy, size * 0.28, color);
  ring(ctx, cx, cy, size * 0.42, BAND_RING[band]);
  CACHE.set(key, c); return c;
}
export function selectionRingCanvas(size = 46) {
  const key = `sel:${size}`; if (CACHE.has(key)) return CACHE.get(key);
  const [c, ctx] = base(size), cx = size / 2, cy = size / 2;
  ctx.strokeStyle = '#eef3f6'; ctx.lineWidth = 1.6; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(cx, cy, size * 0.44, 0, Math.PI * 2); ctx.stroke();
  CACHE.set(key, c); return c;
}
