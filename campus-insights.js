'use strict';
// Só dados locais autorizados. Sem nota ambiental automática ou consumo inventado.
const CAMPUS_INSIGHTS = (() => {
  const count = value => {
    if (value === '' || value == null) return null;
    const n = Number(value);
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  };
  function summarize(records = []) {
    const latest = new Map();
    for (const item of records) {
      if (!item?.environmentId || !['DRAFT','IN_PROGRESS','COMPLETED'].includes(item.status)) continue;
      const previous = latest.get(item.environmentId);
      if (!previous || String(item.updatedAt || '') > String(previous.updatedAt || ''))
        latest.set(item.environmentId, item);
    }
    let lamps = 0, led = 0, fluorescent = 0, hydraulics = 0;
    for (const item of latest.values()) {
      const lighting = item.data?.lighting || {};
      const a = count(lighting.led), b = count(lighting.fluorescent);
      if (a !== null || b !== null) { lamps++; led += a || 0; fluorescent += b || 0; }
      const water = item.data?.waterWaste || {};
      if (['Sim','Não'].includes(water.hasHydraulics) ||
        String(water.hydraulicItems || '').trim() || String(water.waterIssues || '').trim()) hydraulics++;
    }
    return { environments: latest.size, lightingRooms: lamps, led, fluorescent, hydraulicRooms: hydraulics };
  }
  const view = {
    energy: document.getElementById('energyOverview'),
    water: document.getElementById('waterOverview'),
    audits: document.getElementById('auditOverview')
  };
  let generation = 0;
  function clear() {
    view.energy.textContent = 'Consumo a mensurar';
    view.water.textContent = 'Consumo a mensurar';
    view.audits.textContent = 'Consultar registros';
  }
  async function refresh() {
    const id = ++generation;
    clear();
    try {
      const access = await AUDIT_REMOTE.getAccess();
      if (id !== generation || !access?.canAudit) return;
      const user = await AUDIT_REMOTE.sessionUser();
      if (!user || id !== generation) return;
      const rows = await AUDIT_STORAGE.listAudits();
      if (id !== generation) return;
      const allowed = rows.filter(item => !AUDIT_SYNC_CORE.isRecoveryAudit(item) &&
        (access.admin || item.ownerId === user.id));
      const result = summarize(allowed);
      view.audits.textContent = result.environments
        ? result.environments + ' ambiente(s) neste dispositivo' : 'Sem registros locais';
      view.energy.textContent = result.lightingRooms
        ? result.led + ' LED · ' + result.fluorescent + ' fluorescentes (locais)'
        : 'Iluminação não levantada aqui';
      view.water.textContent = result.hydraulicRooms
        ? result.hydraulicRooms + ' ambiente(s) com dados hidráulicos'
        : 'Instalações não levantadas aqui';
    } catch (error) {
      if (id === generation) { clear(); console.warn('[CampusInsights] Resumo indisponível:', error); }
    }
  }
  window.addEventListener('audit:access-updated', refresh);
  window.addEventListener('focus', refresh);
  return Object.freeze({ summarize, refresh, clear });
})();
globalThis.CAMPUS_INSIGHTS = CAMPUS_INSIGHTS;
