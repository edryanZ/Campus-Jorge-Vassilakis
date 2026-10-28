'use strict';

const AUDIT_STORAGE = (() => {
  const DB_NAME = 'campus-jorge-vassilakis-auditorias';
  const DB_VERSION = 3;
  const STORES = Object.freeze({ AUDITS: 'audits', EVIDENCE: 'evidence', META: 'meta', CONFLICTS: 'conflicts' });
  let databasePromise;

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const tx = request.transaction;
        let audits;
        if (!db.objectStoreNames.contains(STORES.AUDITS)) {
          audits = db.createObjectStore(STORES.AUDITS, { keyPath: 'auditId' });
          audits.createIndex('environmentId', 'environmentId');
          audits.createIndex('status', 'status');
        } else audits = tx.objectStore(STORES.AUDITS);
        if (!audits.indexNames.contains('syncState')) audits.createIndex('syncState', 'syncState');
        if (!audits.indexNames.contains('ownerId')) audits.createIndex('ownerId', 'ownerId');

        let evidence;
        if (!db.objectStoreNames.contains(STORES.EVIDENCE)) {
          evidence = db.createObjectStore(STORES.EVIDENCE, { keyPath: 'evidenceId' });
          evidence.createIndex('auditId', 'auditId');
        } else evidence = tx.objectStore(STORES.EVIDENCE);
        if (!evidence.indexNames.contains('syncState')) evidence.createIndex('syncState', 'syncState');
        if (!db.objectStoreNames.contains(STORES.META)) db.createObjectStore(STORES.META, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(STORES.CONFLICTS)) {
          const conflicts = db.createObjectStore(STORES.CONFLICTS, { keyPath: 'conflictId' });
          conflicts.createIndex('sourceAuditId', 'sourceAuditId');
          conflicts.createIndex('environmentId', 'environmentId');
          conflicts.createIndex('ownerId', 'ownerId');
          conflicts.createIndex('resolutionState', 'resolutionState');
        }
        // Upgrade estritamente aditivo: nenhum registro v14 e nenhum Blob e regravado ou removido.
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('A atualização do banco local foi bloqueada por outra aba aberta.'));
    });
    return databasePromise;
  }

  async function requestResult(storeName, mode, operation) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = operation(tx.objectStore(storeName));
      // Para escritas, sucesso do request não significa transação concluída:
      // só confirmar o salvamento após o commit do IndexedDB.
      let result;
      request.onsuccess = () => {
        result = request.result;
        if (mode === 'readonly') resolve(result);
      };
      request.onerror = () => reject(request.error);
      if (mode !== 'readonly') tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || new Error('Transação local cancelada.'));
    });
  }

  function normalizeAudit(record) {
    const audit = structuredClone(record);
    audit.syncState ||= 'LOCAL_ONLY';
    audit.syncError ||= null;
    audit.serverRevision ||= 0;
    audit.lastSyncedAt ||= null;
    audit.mutationId ||= null;
    return audit;
  }

  const getAudit = auditId => requestResult(STORES.AUDITS, 'readonly', store => store.get(auditId));
  const listAudits = () => requestResult(STORES.AUDITS, 'readonly', store => store.getAll());

  async function saveAudit(record, options = {}) {
    const audit = normalizeAudit(record);
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.AUDITS, 'readwrite');
      const store = tx.objectStore(STORES.AUDITS);
      const existingRequest = store.get(audit.auditId);
      let failure = null;
      existingRequest.onerror = () => { failure = existingRequest.error; tx.abort(); };
      existingRequest.onsuccess = () => {
        const existing = existingRequest.result;
        if (existing?.status === AUDIT_DATA.STATUS.COMPLETED && audit.status !== AUDIT_DATA.STATUS.COMPLETED && !options.allowRemoteMerge) {
          failure = new Error('Uma auditoria concluída não pode voltar para rascunho.'); tx.abort(); return;
        }
        if (existing?.status === AUDIT_DATA.STATUS.COMPLETED && existing.updatedAt !== audit.updatedAt && !options.allowRemoteMerge) {
          failure = new Error('Auditorias concluídas são imutáveis. Crie uma nova auditoria.'); tx.abort(); return;
        }
        const allRequest = options.enforceActiveUniqueness && AUDIT_SYNC_CORE.isActiveAudit(audit) ? store.getAll() : null;
        const put = () => { const request = store.put(audit); request.onerror = () => { failure = request.error; tx.abort(); }; };
        if (!allRequest) { put(); return; }
        allRequest.onerror = () => { failure = allRequest.error; tx.abort(); };
        allRequest.onsuccess = () => {
          const duplicate = (allRequest.result || []).find(item => item.auditId !== audit.auditId &&
            AUDIT_SYNC_CORE.isActiveAudit(item) && item.environmentId === audit.environmentId &&
            AUDIT_SYNC_CORE.ownerKey(item) === AUDIT_SYNC_CORE.ownerKey(audit));
          if (duplicate) {
            failure = Object.assign(new Error('Já existe uma auditoria local ativa para este usuário e ambiente.'), {
              code: 'LOCAL_ACTIVE_CONFLICT', existingAuditId: duplicate.auditId
            });
            tx.abort(); return;
          }
          put();
        };
      };
      tx.oncomplete = () => resolve(audit);
      tx.onabort = () => reject(failure || tx.error || new Error('Transação local cancelada.'));
      tx.onerror = () => {};
    });
  }

  const getEvidence = evidenceId => requestResult(STORES.EVIDENCE, 'readonly', store => store.get(evidenceId));
  const listEvidence = () => requestResult(STORES.EVIDENCE, 'readonly', store => store.getAll());
  const saveEvidence = evidence => requestResult(STORES.EVIDENCE, 'readwrite', store => store.put(structuredClone(evidence)));
  const getMeta = key => requestResult(STORES.META, 'readonly', store => store.get(key));
  const setMeta = (key, value) => requestResult(STORES.META, 'readwrite', store => store.put({ key, value }));
  const getConflict = conflictId => requestResult(STORES.CONFLICTS, 'readonly', store => store.get(conflictId));
  const listConflicts = () => requestResult(STORES.CONFLICTS, 'readonly', store => store.getAll());
  const saveConflict = conflict => requestResult(STORES.CONFLICTS, 'readwrite', store => store.put(structuredClone(conflict)));

  async function listByEnvironment(environmentId) {
    const all = await listAudits();
    return all.filter(item => item.environmentId === environmentId)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async function listEvidenceByAudit(auditId) {
    const all = await listEvidence();
    return all.filter(item => item.auditId === auditId);
  }

  async function findActive(environmentId, owner) {
    const all = await listByEnvironment(environmentId);
    const active = all.filter(item => AUDIT_SYNC_CORE.isActiveAudit(item));
    const exact = active.find(item => !owner || AUDIT_SYNC_CORE.ownerKey(item) === owner);
    if (exact) return exact;
    // Compatibilidade v13/v14: um único rascunho sem proprietário continua com o mesmo ID.
    const legacyUnowned = active.filter(item => !AUDIT_SYNC_CORE.ownerKey(item));
    return legacyUnowned.length === 1 ? legacyUnowned[0] : null;
  }

  async function listRecoveries(environmentId = null) {
    const audits = await listAudits();
    const legacy = audits.filter(item => AUDIT_SYNC_CORE.isRecoveryAudit(item) && (!environmentId || item.environmentId === environmentId));
    const conflicts = (await listConflicts()).filter(item => !environmentId || item.environmentId === environmentId);
    return { legacy, conflicts };
  }

  async function listPending() {
    const [audits, evidence] = await Promise.all([listAudits(), listEvidence()]);
    const pendingStates = new Set(['LOCAL_ONLY', 'PENDING', 'ERROR', 'CONFLICT']);
    const normalAuditIds = new Set(audits.filter(item => !AUDIT_SYNC_CORE.isRecoveryAudit(item)).map(item => item.auditId));
    return {
      audits: audits.filter(item => pendingStates.has(item.syncState) && !AUDIT_SYNC_CORE.isRecoveryAudit(item)),
      evidence: evidence.filter(item => normalAuditIds.has(item.auditId) && pendingStates.has(item.syncState || 'LOCAL_ONLY'))
    };
  }

  async function evidenceSummary(auditId) {
    return AUDIT_SYNC_CORE.evidenceSummary(await listEvidenceByAudit(auditId));
  }

  async function evidenceManifest(auditId) {
    return (await listEvidenceByAudit(auditId)).map(item => ({
      evidenceId: item.evidenceId, auditId: item.auditId, nonConformityId: item.nonConformityId || null,
      description: item.description || null, mimeType: item.mimeType || item.blob?.type || null,
      size: Number(item.size || item.blob?.size || 0), sha256: item.sha256 || null,
      storagePath: item.storagePath || null, hasLocalBlob: Boolean(item.blob), syncState: item.syncState || 'LOCAL_ONLY'
    }));
  }

  async function getDeviceId() {
    const stored = await getMeta('deviceId');
    if (stored?.value) return stored.value;
    const value = crypto.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await setMeta('deviceId', value);
    return value;
  }

  async function exportAll() {
    const [audits, evidence, conflicts] = await Promise.all([listAudits(), listEvidence(), listConflicts()]);
    return {
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      warning: 'Backup contém dados potencialmente sensíveis. Proteja o arquivo exportado. Os bytes das imagens continuam separados.',
      audits, conflicts,
      evidence: evidence.map(item => ({ ...item, blob: undefined, blobIncluded: Boolean(item.blob) }))
    };
  }

  return Object.freeze({
    openDatabase, saveAudit, getAudit, listAudits, listByEnvironment, findActive, listRecoveries,
    saveEvidence, getEvidence, listEvidence, listEvidenceByAudit, listPending,
    saveConflict, getConflict, listConflicts, evidenceManifest,
    getDeviceId, exportAll, evidenceSummary
  });
})();

globalThis.AUDIT_STORAGE = AUDIT_STORAGE;
