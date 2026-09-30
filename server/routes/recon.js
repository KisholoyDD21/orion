import { ApiError, isCVE, classifyIndicator } from '../lib/validate.js';
import { passiveLookup } from '../recon/passive.js';
export function registerRecon(router, d) {
  const { http, state, config } = d;
  router.post('/api/recon/passive', async (c) => {
    const target = String(c.body.target || '').trim(); if (!target || target.length > 253) throw new ApiError(400, 'target required');
    if (config.mode === 'offline') return { target, note: 'offline mode: passive recon is disabled (no outbound network calls)' };
    const kind = classifyIndicator(target); if (!['domain', 'ipv4', 'ipv6'].includes(kind.kind)) throw new ApiError(400, 'target must be a domain name or IP address');
    return passiveLookup(http, target);
  }, { limit: 'recon' });

  router.get('/api/cve/:id', async (c) => {
    const id = String(c.params.id).toUpperCase(); if (!isCVE(id)) throw new ApiError(400, 'not a valid CVE id');
    const kev = state.kevIndex?.get(id) || null, epss = state.epss?.get(id) || null;
    if (config.mode === 'offline') return { cve: id, kev, epss, nvd: null, note: 'offline mode: NVD lookup skipped' };
    try {
      const r = await http.json(`https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${encodeURIComponent(id)}`, { timeoutMs: 12000, headers: config.keys.nvd ? { apiKey: config.keys.nvd } : {} });
      const cve = r.data?.vulnerabilities?.[0]?.cve || null;
      return { cve: id, nvd: cve ? { published: cve.published, lastModified: cve.lastModified, status: cve.vulnStatus, description: (cve.descriptions || []).find((x) => x.lang === 'en')?.value || null } : null, kev, epss };
    } catch (e) { return { cve: id, nvd: null, kev, epss, note: `NVD lookup failed: ${e.message}` }; }
  }, { limit: 'recon' });

  router.get('/api/kev', () => {
    const idx = state.kevIndex; if (!idx) return { loaded: false, count: 0, items: [] };
    const items = [...idx.values()].sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || '')).slice(0, 50);
    return { loaded: true, count: idx.size, items: items.map((v) => ({ cve: v.cveID, vendor: v.vendorProject, product: v.product, name: v.vulnerabilityName, dateAdded: v.dateAdded, ransomware: v.knownRansomwareCampaignUse })) };
  });
}
