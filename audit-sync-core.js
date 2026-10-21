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

  return Object.freeze({
    aggregateState, evidenceSummary, publicPayload, storagePath, pendingStates,
    isRecoveryAudit, isActiveAudit, ownerKey, activeKey, isActiveUniqueViolation, conflictId
  });
})();

globalThis.AUDIT_SYNC_CORE = AUDIT_SYNC_CORE;
