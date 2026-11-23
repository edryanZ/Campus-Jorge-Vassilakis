'use strict';

const AUDIT_SYNC_CORE = (() => {
  const pendingStates = new Set(['LOCAL_ONLY', 'PENDING', 'UPLOADING']);

  function evidenceSummary(items = []) {
    const summary = { total: items.length, synced: 0, pending: 0, errors: 0 };
    items.forEach(item => {
      if (item.syncState === 'SYNCED' && item.remoteVerifiedAt) summary.synced += 1;
      else if (item.syncState === 'ERROR') summary.errors += 1;
      else summary.pending += 1;
    });
    return summary;
  }

  function aggregateState(dataConfirmed, items = []) {
    const summary = evidenceSummary(items);
    if (summary.errors) return 'ERROR';
    if (!dataConfirmed || summary.pending || summary.synced !== summary.total) return 'PENDING';
    return 'SYNCED';
  }

  // Allowlist: nenhum texto livre, identificação pessoal ou dado administrativo é publicado.
  function publicPayload(audit = {}) {
    const data = audit.data || {};
    const pick = (source, keys) => Object.fromEntries(keys
      .filter(key => source?.[key] !== undefined && source[key] !== '')
      .map(key => [key, source[key]]));
    return {
      schemaVersion: 2,
      auditId: audit.auditId,
      environmentId: audit.environmentId,
      status: audit.status,
      completedAt: audit.completedAt || null,
      data: {
        lighting: pick(data.lighting, ['total', 'led', 'fluorescent', 'other', 'working', 'defective', 'damagedFixtures', 'naturalLight']),
        airConditioning: pick(data.airConditioning, ['hasAC', 'units']),
        equipment: pick(data.equipment, ['computadores', 'monitores', 'impressoras', 'projetores', 'tvs', 'ventiladores', 'bebedouros', 'installedPower', 'estimatedConsumption']),
        waterWaste: pick(data.waterWaste, ['hasHydraulics', 'separation']),
        conditions: pick(data.conditions, ['naturalLight', 'ventilation', 'thermalComfort', 'noise', 'temperature', 'noiseDb', 'lux', 'source']),
        infrastructure: pick(data.infrastructure, ['paredes', 'teto', 'piso', 'portas', 'janelas', 'mobiliario', 'conservacao_geral'])
      },
      summary: { nonConformityCount: Array.isArray(audit.nonConformities) ? audit.nonConformities.length : 0 }
    };
  }

  function storagePath(userId, auditId, evidenceId, sha256, mimeType = '') {
    const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' })[mimeType] || 'bin';
    return `${userId}/${auditId}/${evidenceId}/${sha256}.${ext}`;
  }

  function isRecoveryAudit(audit = {}) {
    return Boolean(audit.conflictOf) || /^AUDIT-RECOVERY-/i.test(String(audit.auditId || ''));
  }

  function isActiveAudit(audit = {}) {
    return ['DRAFT', 'IN_PROGRESS'].includes(audit.status) && !audit.conflictArchived && !isRecoveryAudit(audit);
  }

  function ownerKey(audit = {}) {
    return audit.ownerId || audit.localOwnerKey || null;
  }

  function activeKey(owner, environmentId) {
    return owner && environmentId ? `${owner}::${environmentId}` : null;
  }

  function isActiveUniqueViolation(error = {}) {
    const details = `${error.code || ''} ${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
    return String(error.code) === '23505' && /audits_one_active_per_(owner_environment|environment_v162)_idx/i.test(details);
  }

  function conflictId(local = {}, remote = {}, reason = 'REVISION') {
    const source = local.auditId || remote.auditId || 'UNKNOWN';
    const localRevision = Number(local.serverRevision || 0);
    const remoteRevision = Number(remote.serverRevision || 0);
    const mutation = local.mutationId || 'NO-MUTATION';
    return `CONFLICT-${reason}-${source}-${localRevision}-${remoteRevision}-${mutation}`;
  }

  // Data e hora são preenchidas automaticamente ao criar um rascunho:
  // sozinhas não demonstram que a coleta começou.
  function hasCollectedAnswers(record = {}) {
    if ((record.nonConformities || []).length || (record.evidenceIds || []).length) return true;
    if (Object.values(record.reviewedSteps || {}).some(value => value === true)) return true;
    return Object.entries(record.data || {}).some(([section, values]) =>
      values && typeof values === 'object' && Object.entries(values).some(([field, value]) => {
        if (section === 'identification' && (field === 'date' || field === 'startTime')) return false;
        if (value == null || value === '') return false;
        if (typeof value === 'string') return value.trim().length > 0;
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'object') return Object.keys(value).length > 0;
        return true;
      }));
  }

  // Comparação conservadora: a existência de ALGUMA resposta no servidor não
  // garante que ele recebeu TODAS as respostas, revisões ou evidências locais.
  // Divergências devem ser analisadas, nunca apagadas automaticamente.
  function hasMissingCollectedAnswers(local = {}, remote = {}) {
    const collected = value => {
      if (value === undefined || value === null || value === '') return false;
      if (typeof value === 'string') return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === 'object') return Object.keys(value).length > 0;
      return true; // Zero e false também podem ser respostas válidas.
    };
    for (const [section, fields] of Object.entries(local.data || {})) {
      if (!fields || typeof fields !== 'object') continue;
      for (const [field, value] of Object.entries(fields)) {
        if (section === 'identification' && (field === 'date' || field === 'startTime')) continue;
        if (collected(value) && !collected(remote.data?.[section]?.[field])) return true;
      }
    }
    if (Object.entries(local.reviewedSteps || {}).some(([step, reviewed]) =>
      reviewed === true && remote.reviewedSteps?.[step] !== true)) return true;
    if ((local.evidenceIds || []).some(id => !Array.isArray(remote.evidenceIds) ||
      !remote.evidenceIds.includes(id))) return true;
    if ((local.nonConformities || []).some(item =>
      !Array.isArray(remote.nonConformities) ||
      !remote.nonConformities.some(other =>
        (item?.nonConformityId && other?.nonConformityId === item.nonConformityId) ||
        JSON.stringify(other) === JSON.stringify(item)))) return true;
    return false;
  }

  return Object.freeze({
    hasCollectedAnswers, hasMissingCollectedAnswers, aggregateState, evidenceSummary, publicPayload, storagePath, pendingStates,
    isRecoveryAudit, isActiveAudit, ownerKey, activeKey, isActiveUniqueViolation, conflictId
  });
})();

globalThis.AUDIT_SYNC_CORE = AUDIT_SYNC_CORE;
