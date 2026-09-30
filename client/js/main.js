import { createGlobe } from './globe.js';
import { createLayerManager } from './layers.js';
import { createTrackLayer } from './track.js';
import { mountSearch } from './search.js';
import { api, connectStream } from './api.js';
import { bus, settings } from './state.js';
import { fmtClock, escapeHtml } from './format.js';
import { LAYERS } from '/shared/taxonomy.js';

import * as alertsPanel from './panels/alerts-panel.js';
import * as detailPanel from './panels/detail-panel.js';
import * as timelinePanel from './panels/timeline-panel.js';
import * as graphPanel from './panels/graph-panel.js';
import * as sourcesPanel from './panels/sources-panel.js';
import * as achPanel from './panels/ach-panel.js';
import * as detectionPanel from './panels/detection-panel.js';
import * as briefingPanel from './panels/briefing-panel.js';
import * as reconPanel from './panels/recon-panel.js';
import * as casePanel from './panels/case-panel.js';
import * as researchPanel from './panels/research-panel.js';

const PANELS = [alertsPanel, detailPanel, timelinePanel, graphPanel, sourcesPanel, achPanel, detectionPanel, briefingPanel, reconPanel, casePanel, researchPanel];
const RANK = { routine: 0, elevated: 1, high: 2, critical: 3 };
const MAP_LAYER_IDS = Object.keys(LAYERS).filter((id) => id !== 'recon');

function toast(msg, ms = 3200) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; const host = document.getElementById('toast-host'); host.appendChild(t); setTimeout(() => t.remove(), ms); }

async function main() {
  let config = { mode: 'offline', cesiumIonToken: null };
  try { config = await api.config(); } catch { /* server not reachable yet; fall through with offline defaults so the UI still renders */ }
  document.body.dataset.mode = config.mode;
  const modeBadge = document.getElementById('mode-badge'); modeBadge.textContent = config.mode === 'live' ? 'live' : 'offline · synthetic'; modeBadge.dataset.mode = config.mode;

  const globe = await createGlobe(document.getElementById('cesium-viewer'), { cesiumIonToken: config.cesiumIonToken });
  const layers = createLayerManager(globe.viewer);
  const track = createTrackLayer(globe.viewer);
  const app = { globe, layers, track, selectedId: null };

  // --- left dock: layers
  const layerList = document.getElementById('layer-list');
  layerList.innerHTML = MAP_LAYER_IDS.map((id) => { const def = LAYERS[id]; return `
    <li class="layer-row" data-layer="${id}" data-empty="1">
      <input type="checkbox" ${settings.layersOn.has(id) ? 'checked' : ''}>
      <span class="layer-swatch" style="background:${def.color}"></span>
      <span class="layer-name">${def.label}${def.noGeo ? ' <span style="color:var(--text-3)">(list only)</span>' : ''}</span>
      <span class="layer-count mono" data-count="${id}">–</span>
    </li>`; }).join('');
  layerList.addEventListener('change', (e) => {
    const row = e.target.closest('[data-layer]'); if (!row) return; const id = row.dataset.layer;
    if (e.target.checked) settings.layersOn.add(id); else settings.layersOn.delete(id);
    layers.refilter();
  });
  function setLayerCount(id, n) { const el = layerList.querySelector(`[data-count="${id}"]`); if (el) { el.textContent = n; el.closest('[data-layer]').dataset.empty = n ? '0' : '1'; } }
  const minSlider = document.getElementById('min-priority'), minVal = document.getElementById('min-priority-val');
  minSlider.addEventListener('input', () => { settings.minPriority = +minSlider.value; minVal.textContent = minSlider.value; layers.refilter(); });
  document.getElementById('toggle-synthetic').addEventListener('change', (e) => { settings.showSynthetic = e.target.checked; layers.refilter(); });

  // --- left dock: sources
  const sourceList = document.getElementById('source-list');
  const sourceRow = (s) => { const h = s.health || {}; return `<li class="source-row" data-id="${escapeHtml(s.id)}" title="${escapeHtml(s.attribution || '')}"><span class="source-dot" data-state="${h.state || 'idle'}"></span><span class="source-name">${escapeHtml(s.name)}</span><span class="source-lat mono">${h.records ?? ''}</span></li>`; };
  function updateSourceRow(s) { const li = sourceList.querySelector(`[data-id="${CSS.escape(s.id)}"]`); if (!li) return; const dot = li.querySelector('.source-dot'); if (dot) dot.dataset.state = s.state; const cnt = li.querySelector('.source-lat'); if (cnt && s.records != null) cnt.textContent = s.records; }
  api.sources().then((r) => { sourceList.innerHTML = r.sources.map(sourceRow).join(''); }).catch(() => { sourceList.innerHTML = '<li class="list-empty">unavailable</li>'; });

  // --- tab rail / panels
  const rail = document.getElementById('tab-rail'), host = document.getElementById('panel-host');
  rail.innerHTML = PANELS.map((p) => `<button class="tab-btn" data-tab="${p.meta.id}" title="${p.meta.title}" role="tab" aria-selected="false">${p.meta.icon}<span class="tab-dot"></span></button>`).join('');
  let cleanup = null;
  function switchTab(id) {
    const mod = PANELS.find((p) => p.meta.id === id); if (!mod) return;
    rail.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    if (cleanup) { try { cleanup(); } catch { /* panel cleanup should not be able to break navigation */ } }
    host.innerHTML = ''; cleanup = mod.mount(host, app) || null;
  }
  rail.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) switchTab(b.dataset.tab); });
  switchTab('alerts');

  // --- HUD
  document.getElementById('hud-home').addEventListener('click', () => globe.reset());
  const termBtn = document.getElementById('hud-terminator');
  termBtn.addEventListener('click', () => { settings.terminator = !settings.terminator; termBtn.setAttribute('aria-pressed', String(settings.terminator)); globe.setTerminatorVisible(settings.terminator); });
  const imgBtn = document.getElementById('hud-imagery'); let imageryOn = true;
  imgBtn.addEventListener('click', () => { imageryOn = !imageryOn; imgBtn.setAttribute('aria-pressed', String(imageryOn)); globe.setImageryVisible(imageryOn); });
  const menuBtn = document.getElementById('btn-menu');
  menuBtn.addEventListener('click', () => { document.body.dataset.leftOpen = document.body.dataset.leftOpen === '1' ? '0' : '1'; });

  // --- search
  mountSearch(document.getElementById('search-input'), document.getElementById('search-results'));

  // --- selection
  bus.on('globe:click', (id) => { if (id) bus.emit('entity:select', id); });
  bus.on('place:select', (r) => globe.flyTo(r.lon, r.lat, 250_000));
  bus.on('entity:select', async (id) => {
    app.selectedId = id; settings.selectedId = id; switchTab('detail');
    try { const { entity: e } = await api.entity(id); if (app.selectedId !== id) return;
      if (e.lat != null) { globe.flyTo(e.lon, e.lat, Math.max(60_000, (e.altM || 0) * 4)); track.showFor(e); } else track.clear();
    } catch { /* entity may have expired between the click and the fetch (rolled off its source); nothing to show */ }
  });

  // --- alert badge
  const alertBtn = document.getElementById('btn-alerts'), alertCountEl = document.getElementById('alert-count');
  let alertCount = 0, worstBand = 'routine';
  function paintBadge() { alertBtn.dataset.band = worstBand; alertCountEl.textContent = alertCount; }
  alertBtn.addEventListener('click', () => switchTab('alerts'));

  // --- initial data
  async function loadLayer(id) { try { const r = await api.layer(id); layers.applyLayer(id, r.items); setLayerCount(id, r.count); } catch (e) { console.warn('[orion] layer load failed:', id, e.message); } }
  await Promise.all(MAP_LAYER_IDS.map(loadLayer));
  try { const [top, stats] = await Promise.all([api.alerts({ sort: 'top', limit: 1 }), api.stats()]); worstBand = top.alerts[0]?.level || 'routine'; alertCount = stats.alerts || 0; } catch { /* badge just stays at zero until the stream catches up */ } paintBadge();

  // --- live stream
  let streamState = 'connecting', everReconnected = false;
  connectStream({
    connectionState: (s) => { if (s === streamState) return; if (s === 'reconnecting') { everReconnected = true; toast('Reconnecting to ORION…'); } else if (s === 'open' && everReconnected) { toast('Live updates connected'); everReconnected = false; } streamState = s; },
    layer: (msg) => { for (const l of msg.layers || []) loadLayer(l.id); },
    alert: (a) => { bus.emit('alert:new', a); alertCount++; if ((RANK[a.level] ?? 0) > (RANK[worstBand] ?? 0)) worstBand = a.level; paintBadge(); },
    source: (s) => { bus.emit('source:update', s); updateSourceRow(s); },
    heartbeat: () => {},
  });

  // --- clock
  const clockEl = document.getElementById('clock'); const tick = () => { clockEl.textContent = fmtClock(); }; tick(); setInterval(tick, 1000);
}
main().catch((e) => { console.error('[orion] fatal startup error', e); document.getElementById('panel-host').innerHTML = `<div class="panel"><div class="panel-body"><p class="list-empty">ORION failed to start: ${escapeHtml(e.message)}</p></div></div>`; });
