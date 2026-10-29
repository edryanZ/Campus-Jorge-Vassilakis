'use strict';

const AUDIT_REMOTE = (() => {
  const config = globalThis.SUPABASE_CONFIG || {};
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url || '') && /^(sb_publishable_|eyJ)/.test(config.publishableKey || '') && !/SUBSTITUA|SEU-PROJETO/i.test(`${config.url}${config.publishableKey}`);
  const client = configured && globalThis.supabase?.createClient
    ? globalThis.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: { headers: { 'x-client-info': 'campus-jorge-vassilakis-v15' } }
    }) : null;
  const locks = new Map();
  const scheduled = new Map();
  const attempts = new Map();
  let syncing = false;
  const now = () => new Date().toISOString();
  const newId = prefix => `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  const dispatch = (name, detail = {}) => window.dispatchEvent(new CustomEvent(name, { detail }));

  async function currentUser() {
    if (!client) return null;
    const { data, error } = await client.auth.getUser();
    return error ? null : data.user || null;
  }

  async function sessionUser() {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    return error ? null : data.session?.user || null;
  }

  async function ownerKey() {
    const user = await sessionUser();
    return user?.id || `LOCAL:${await AUDIT_STORAGE.getDeviceId()}`;
  }

  async function sha256(blob) {
    const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
  }

  function remoteToLocal(row) {
    return {
      ...(row.private_payload || {}), auditId: row.id, environmentId: row.environment_id,
      status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
      completedAt: row.completed_at, ownerId: row.owner_id, localOwnerKey: null,
      isPublic: row.is_public, serverRevision: row.server_revision,
      mutationId: row.last_mutation_id, syncState: row.sync_complete ? 'SYNCED' : 'PENDING',
      syncError: null, lastSyncedAt: row.sync_complete ? now() : null
    };
  }

  const verifiedAccess = new Map();
  // Apenas rascunhos anônimos autorizados explicitamente pelo auditor atual.
  const approvedLocalAdoptions = new Map();
  async function approveLegacyAdoption(record) {
    const user = await sessionUser();
    const access = await getAccess();
    if (!user || !access?.canAudit || !record?.auditId || record.ownerId)
      throw new Error('A recuperação exige uma conta de auditor autorizada e um rascunho sem proprietário.');
    if (record.localOwnerKey && record.localOwnerKey !== `LOCAL:${await AUDIT_STORAGE.getDeviceId()}`)
      throw new Error('Este registro pertence a outro dispositivo.');
    approvedLocalAdoptions.set(record.auditId, user.id);
    return true;
  }
  async function getAccess() {
    if (!client) return null;
    const user = await sessionUser();
    if (!user) return null;
    const key = `audit-verified-access:${user.id}`;
    const cachedOffline = () => {
      let saved = verifiedAccess.get(user.id);
      if (!saved) {
        try { saved = JSON.parse(localStorage.getItem(key) || 'null'); }
        catch (_error) { saved = null; }
      }
      // A autorização offline vale no máximo 24h, mesmo quando a rede está
      // conectada mas o servidor está temporariamente indisponível.
      if (saved?.active && saved?.canAudit && saved?.checkedAt > Date.now() - 86400000)
        return { ...saved, offline: true };
      return { active: false, role: null, reviewStatus: 'OFFLINE', canAudit: false, admin: false, offline: true };
    };
    if (!navigator.onLine) return cachedOffline();
    let data;
    try {
      const response = await client.from('profiles')
        .select('role,active,display_name,review_status')
        .eq('user_id', user.id).maybeSingle();
      if (response.error) throw response.error;
      data = response.data;
    } catch (error) {
      // O Supabase pode estar pausado mesmo com Wi-Fi/4G conectado. Nesse
      // caso, permitir apenas continuação LOCAL previamente autorizada.
      const cached = cachedOffline();
      if (cached.canAudit) return cached;
      throw error;
    }
    const result = {
      userId: user.id, role: data?.role || null, active: Boolean(data?.active),
      displayName: data?.display_name || '', reviewStatus: data?.review_status || 'PENDING',
      canAudit: Boolean(data?.active && ['ADMIN', 'AUDITOR'].includes(data.role)),
      admin: Boolean(data?.active && data.role === 'ADMIN'),
      checkedAt: Date.now(), offline: false
    };
    verifiedAccess.set(user.id, result);
    try { localStorage.setItem(key, JSON.stringify(result)); } catch (_error) { /* Armazenamento indisponivel. */ }
    return result;
  }

  async function requestAccount(displayName, email, password) {
    if (!client) throw new Error('Cadastro indisponível: Supabase não configurado.');
    const { data, error } = await client.auth.signUp({
      email: String(email).trim(), password,
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname,
        data: { display_name: String(displayName).trim().slice(0, 120) }
      }
    });
    if (error) throw error;
    return data;
  }

  async function listAccessRequests() {
    const access = await getAccess();
    if (!access?.admin || access.offline) throw new Error('Apenas administradores conectados podem consultar solicitações.');
    const { data, error } = await client.rpc('admin_list_access_requests');
    if (error) throw error;
    return data || [];
  }

  async function reviewAccessRequest(userId, approve) {
    const access = await getAccess();
    if (!access?.admin || access.offline) throw new Error('Aprovação requer administrador conectado.');
    const { error } = await client.rpc('admin_review_access_request', {
      p_user_id: userId, p_approve: Boolean(approve)
    });
    if (error) throw error;
  }

  async function setPublication(auditId, publish) {
    const access = await getAccess();
    if (!access?.admin || access.offline) throw new Error('Somente administrador conectado pode publicar resultados.');
    const { error } = await client.rpc('authorize_audit_publication', {
      p_id: auditId, p_publish: Boolean(publish)
    });
    if (error) throw error;
  }

  async function getPublishedAudit(auditId) {
    if (!client || !navigator.onLine) throw new Error('Consulta pública requer conexão.');
    const { data, error } = await client.from('published_audits')
      .select('id,environment_id,status,public_payload,completed_at,updated_at,server_revision')
      .eq('id', auditId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Resultado não publicado ou indisponível.');
    return {
      auditId: data.id, environmentId: data.environment_id, status: data.status,
      data: data.public_payload?.data || {}, summary: data.public_payload?.summary || {},
      completedAt: data.completed_at, updatedAt: data.updated_at, publicOnly: true
    };
  }

  async function listActiveOccupancy() {
    const access = await getAccess();
    if (!client || !navigator.onLine || !access?.canAudit || access.offline) return [];
    const result = await client.rpc('list_active_audit_occupancy');
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function requestAuditParticipation(auditId) {
    if (!(await getAccess())?.canAudit || !navigator.onLine)
      throw new Error('É necessário estar conectado com conta de auditor autorizada.');
    const { data, error } = await client.rpc('request_audit_participation', { p_audit_id: auditId });
    if (error) throw error;
    return data;
  }

  async function listMyParticipation() {
    if (!(await getAccess())?.canAudit || !navigator.onLine) return [];
    const { data, error } = await client.rpc('list_my_audit_participation');
    if (error) throw error;
    return data || [];
  }

  async function listAuditParticipationRequests() {
    const access = await getAccess();
    if (!access?.admin || access.offline || !navigator.onLine)
      throw new Error('A consulta de solicitações exige administrador conectado.');
    const { data, error } = await client.rpc('admin_list_audit_participation_requests');
    if (error) throw error;
    return data || [];
  }

  async function reviewAuditParticipation(auditId, requesterId, approve) {
    const access = await getAccess();
    if (!access?.admin || access.offline || !navigator.onLine)
      throw new Error('A decisão exige administrador conectado.');
    const { data, error } = await client.rpc('admin_review_audit_participation', {
      p_audit_id: auditId, p_requester_id: requesterId, p_approve: Boolean(approve)
    });
    if (error) throw error;
    return data;
  }

  async function getSharedAudit(auditId) {
    if (!(await getAccess())?.canAudit || !navigator.onLine)
      throw new Error('É necessário estar conectado para continuar a auditoria compartilhada.');
    const { data, error } = await client.rpc('get_shared_audit', { p_audit_id: auditId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('A auditoria compartilhada não está disponível.');
    const user = await currentUser();
    const record = remoteToLocal(row);
    if (record.ownerId !== user?.id) record.collaborationEditorId = user.id;
    return record;
  }

  async function findRemoteActive(environmentId) {
    const user = await currentUser();
    if (!client || !user || !navigator.onLine || !(await getAccess())?.canAudit) return null;
    const result = await client.from('audits').select('*').eq('owner_id', user.id)
      .eq('environment_id', environmentId).in('status', ['DRAFT', 'IN_PROGRESS'])
      .order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw result.error;
    return result.data ? remoteToLocal(result.data) : null;
  }

  async function resumeOrCreateActive(proposed) {
    const user = await currentUser();
    if (!client || !user || !navigator.onLine || !(await getAccess())?.canAudit) return { skipped: true, audit: proposed };
    const mutationId = proposed.mutationId || newId('MUTATION');
    let call = await client.rpc('resume_or_create_active_audit', {
      p_id: proposed.auditId, p_environment_id: proposed.environmentId,
      p_private_payload: proposed, p_public_payload: AUDIT_SYNC_CORE.publicPayload(proposed),
      p_mutation_id: mutationId, p_device_id: await AUDIT_STORAGE.getDeviceId()
    });
    // Compatibilidade com o banco v14: a RPC v15 ainda nao foi migrada.
    // Verifica novamente se ja existe um rascunho antes de criar; o indice
    // unico remoto e a recuperacao de 23505 impedem rascunhos duplicados.
    if (call.error && ['PGRST202', '42883'].includes(String(call.error.code))) {
      const previous = await findRemoteActive(proposed.environmentId);
      if (previous) return { resumed: true, audit: previous, compatibilityMode: true };
      call = await client.rpc('sync_audit', {
        p_id: proposed.auditId, p_environment_id: proposed.environmentId,
        p_status: proposed.status, p_private_payload: proposed,
        p_public_payload: AUDIT_SYNC_CORE.publicPayload(proposed),
        p_completed_at: null, p_is_public: false, p_expected_revision: 0,
        p_mutation_id: mutationId, p_device_id: await AUDIT_STORAGE.getDeviceId()
      });
    }
    if (call.error) {
      if (AUDIT_SYNC_CORE.isActiveUniqueViolation(call.error)) {
        const existing = await findRemoteActive(proposed.environmentId);
        if (existing) return { resumed: true, audit: existing, recoveredFrom23505: true };
      }
      throw call.error;
    }
    const row = Array.isArray(call.data) ? call.data[0] : call.data;
    if (!row?.id) throw new Error('O Supabase não confirmou a retomada ou criação da auditoria.');
    return { resumed: row.id !== proposed.auditId, audit: remoteToLocal(row) };
  }

  async function verifyEvidence(item, path, userId, hash) {
    const meta = await client.from('audit_evidence').select('id,audit_id,owner_id,storage_path,size_bytes,content_sha256').eq('id', item.evidenceId).maybeSingle();
    if (meta.error) throw meta.error;
    const size = Number(item.size || item.blob?.size || 0);
    if (!meta.data || meta.data.audit_id !== item.auditId || meta.data.owner_id !== userId || meta.data.storage_path !== path || Number(meta.data.size_bytes) !== size || meta.data.content_sha256 !== hash) {
      throw new Error('Metadado remoto divergente; a evidência local foi preservada.');
    }
    const slash = path.lastIndexOf('/');
    const listed = await client.storage.from(config.evidenceBucket || 'audit-evidence').list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 2 });
    if (listed.error) throw listed.error;
    if (!listed.data?.some(object => object.name === path.slice(slash + 1))) throw new Error('O Storage não confirmou a presença da evidência.');
  }

  async function syncOneEvidence(item, userId) {
    if (!item.blob) throw new Error('Bytes locais da evidência indisponíveis.');
    Object.assign(item, { attemptCount: Number(item.attemptCount || 0) + 1, lastAttemptAt: now(), syncState: 'UPLOADING', syncError: null });
    await AUDIT_STORAGE.saveEvidence(item);
    const hash = item.sha256 || await sha256(item.blob);
    const path = AUDIT_SYNC_CORE.storagePath(userId, item.auditId, item.evidenceId, hash, item.mimeType);
    const upload = await client.storage.from(config.evidenceBucket || 'audit-evidence').upload(path, item.blob, { contentType: item.mimeType || 'application/octet-stream', upsert: false });
    if (upload.error && !/already exists|duplicate|resource already exists/i.test(upload.error.message || '')) throw upload.error;
    const inserted = await client.from('audit_evidence').insert({
      id: item.evidenceId, audit_id: item.auditId, owner_id: userId, storage_path: path,
      file_name: item.description || item.evidenceId, mime_type: item.mimeType || null,
      size_bytes: Number(item.size || item.blob.size || 0), content_sha256: hash,
      captured_at: item.createdAt || now()
    });
    if (inserted.error && !/duplicate|unique/i.test(`${inserted.error.code} ${inserted.error.message}`)) throw inserted.error;
    await verifyEvidence(item, path, userId, hash);
    Object.assign(item, { sha256: hash, storagePath: path, syncState: 'SYNCED', syncError: null, remoteVerifiedAt: now(), lastSyncedAt: now() });
    await AUDIT_STORAGE.saveEvidence(item);
    return item;
  }

  async function syncEvidenceForAudit(auditId, userId) {
    const items = await AUDIT_STORAGE.listEvidenceByAudit(auditId);
    for (const item of items) {
      if (item.syncState === 'SYNCED' && item.remoteVerifiedAt) continue;
      if (!navigator.onLine) { item.syncState = 'PENDING'; await AUDIT_STORAGE.saveEvidence(item); continue; }
      try { await syncOneEvidence(item, userId); }
      catch (error) {
        item.syncState = 'ERROR'; item.syncError = error.message || 'Falha no upload.';
        await AUDIT_STORAGE.saveEvidence(item);
      }
    }
    return AUDIT_STORAGE.listEvidenceByAudit(auditId);
  }

  async function preserveConflict(local, remote, reason = 'REVISION') {
    const conflict = {
      conflictId: AUDIT_SYNC_CORE.conflictId(local, remote, reason),
      sourceAuditId: local.auditId || remote.auditId,
      environmentId: local.environmentId || remote.environmentId,
      ownerId: local.ownerId || remote.ownerId || null,
      reason, resolutionState: 'UNRESOLVED', createdAt: now(),
      localSnapshot: structuredClone(local), remoteSnapshot: structuredClone(remote),
      evidenceManifest: await AUDIT_STORAGE.evidenceManifest(local.auditId)
    };
    await AUDIT_STORAGE.saveConflict(conflict);
    dispatch('audit:conflict', { conflictId: conflict.conflictId, auditId: conflict.sourceAuditId, reason });
    return conflict;
  }

  async function syncSharedAuditOnce(record, user) {
    if (!record?.collaborationEditorId || record.collaborationEditorId !== user.id)
      return { skipped: true, reason: 'OTHER_OWNER' };
    const audit = structuredClone(record);
    audit.mutationId ||= newId('MUTATION');
    const { data, error } = await client.rpc('sync_shared_audit', {
      p_id: audit.auditId,
      p_private_payload: audit,
      p_public_payload: AUDIT_SYNC_CORE.publicPayload(audit),
      p_status: audit.status,
      p_expected_revision: Number(audit.serverRevision || 0),
      p_mutation_id: audit.mutationId
    });
    if (error) {
      audit.syncState = String(error.code) === '40001' ? 'CONFLICT' : 'ERROR';
      audit.syncError = error.message;
      await AUDIT_STORAGE.saveRemoteAcknowledgment(audit, audit.mutationId);
      if (String(error.code) === '40001') {
        try {
          const remote = await getSharedAudit(audit.auditId);
          await preserveConflict(audit, remote, 'SHARED_REVISION_40001');
        } catch (_error) { /* O rascunho local permanece intacto. */ }
      }
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.id || !row.server_revision)
      throw new Error('O servidor não confirmou a edição compartilhada.');
    const synced = { ...remoteToLocal(row), collaborationEditorId: user.id };
    const saved = await AUDIT_STORAGE.saveRemoteAcknowledgment(synced, audit.mutationId);
    dispatch('audit:sync-state', { auditId: saved.audit.auditId, state: saved.audit.syncState });
    return { synced: Boolean(row.sync_complete) && !saved.superseded, audit: saved.audit };
  }

  async function syncAuditOnce(record) {
    const user = await currentUser();
    if (!client || !user || !navigator.onLine || AUDIT_SYNC_CORE.isRecoveryAudit(record) || !(await getAccess())?.canAudit) return { skipped: true };
    // Impede que um usuário sincronize registros privados pertencentes a outra conta
    // no mesmo dispositivo. Registros antigos sem dono continuam preservados.
    if (record.collaborationEditorId && record.collaborationEditorId !== user.id)
      return { skipped: true, reason: 'OTHER_EDITOR' };
    if (record.ownerId && record.ownerId !== user.id)
      return syncSharedAuditOnce(record, user);
    if (record.localOwnerKey && record.localOwnerKey !== `LOCAL:${await AUDIT_STORAGE.getDeviceId()}`)
      return { skipped: true, reason: 'OTHER_DEVICE' };
    if (!record.ownerId && approvedLocalAdoptions.get(record.auditId) !== user.id)
      return { skipped: true, reason: 'LEGACY_ADOPTION_NOT_APPROVED' };
    const audit = structuredClone(record);
    audit.ownerId ||= user.id;
    audit.localOwnerKey = null;
    audit.mutationId ||= newId('MUTATION');
    audit.syncState = 'PENDING'; audit.syncError = null;
    // Não gravar um snapshot antigo por cima de uma edição mais nova.
    // A preparação usa a mesma transação atômica da confirmação remota.
    const prepared = await AUDIT_STORAGE.saveRemoteAcknowledgment(audit, record.mutationId);
    if (prepared.superseded) return { skipped: true, reason: 'NEW_LOCAL_EDIT' };
    approvedLocalAdoptions.delete(audit.auditId);
    const call = await client.rpc('sync_audit', {
      p_id: audit.auditId, p_environment_id: audit.environmentId, p_status: audit.status,
      p_private_payload: audit, p_public_payload: AUDIT_SYNC_CORE.publicPayload(audit),
      p_completed_at: audit.completedAt || null, p_is_public: false,
      p_expected_revision: Number(audit.serverRevision || 0), p_mutation_id: audit.mutationId,
      p_device_id: await AUDIT_STORAGE.getDeviceId()
    });
    if (call.error) {
      const isRevision = String(call.error.code) === '40001';
      const isDuplicate = AUDIT_SYNC_CORE.isActiveUniqueViolation(call.error);
      audit.syncState = isRevision || isDuplicate ? 'CONFLICT' : 'ERROR';
      audit.syncError = call.error.message;
      await AUDIT_STORAGE.saveRemoteAcknowledgment(audit, audit.mutationId);
      if (isRevision || isDuplicate) {
        const remote = isDuplicate ? await findRemoteActive(audit.environmentId) : await fetchRemoteById(audit.auditId);
        if (remote) await preserveConflict(audit, remote, isDuplicate ? 'ACTIVE_IDENTITY_23505' : 'REVISION_40001');
      }
      throw call.error;
    }
    let row = Array.isArray(call.data) ? call.data[0] : call.data;
    if (!row?.id || !row.server_revision) throw new Error('O Supabase não confirmou a revisão salva.');
    audit.serverRevision = row.server_revision;
    await AUDIT_STORAGE.saveRemoteAcknowledgment(audit, audit.mutationId);
    const evidence = await syncEvidenceForAudit(audit.auditId, user.id);
    const state = AUDIT_SYNC_CORE.aggregateState(true, evidence);
    const summary = AUDIT_SYNC_CORE.evidenceSummary(evidence);
    if (state !== 'SYNCED') {
      audit.syncState = state;
      audit.syncError = state === 'ERROR' ? 'Há evidência com erro de sincronização.' : 'Há evidência aguardando sincronização.';
      const saved = await AUDIT_STORAGE.saveRemoteAcknowledgment(audit, audit.mutationId);
      dispatch('audit:sync-state', { auditId: saved.audit.auditId, state: saved.audit.syncState, evidence: summary });
      return { synced: false, audit: saved.audit, evidence: summary };
    }
    const final = await client.rpc('finalize_audit_sync', { p_id: audit.auditId, p_expected_revision: Number(audit.serverRevision), p_mutation_id: audit.mutationId });
    if (final.error) throw final.error;
    row = Array.isArray(final.data) ? final.data[0] : final.data;
    if (!row?.sync_complete) throw new Error('O Supabase não confirmou todos os dados e evidências.');
    const syncedAudit = remoteToLocal(row);
    const saved = await AUDIT_STORAGE.saveRemoteAcknowledgment(syncedAudit, audit.mutationId);
    attempts.delete(audit.auditId);
    dispatch('audit:sync-state', { auditId: saved.audit.auditId, state: saved.audit.syncState, evidence: summary });
    return { synced: !saved.superseded, audit: saved.audit, evidence: summary };
  }

  async function fetchRemoteById(auditId) {
    const latest = await client.from('audits').select('*').eq('id', auditId).maybeSingle();
    if (latest.error) throw latest.error;
    return latest.data ? remoteToLocal(latest.data) : null;
  }

  function lockKey(record) {
    return AUDIT_SYNC_CORE.activeKey(AUDIT_SYNC_CORE.ownerKey(record), record.environmentId) || record.auditId;
  }

  async function syncAudit(record) {
    // Um conflito exige resolução humana; tentar novamente automaticamente
    // poderia substituir uma versão que foi preservada para análise.
    if (record?.syncState === 'CONFLICT') return { skipped: true, reason: 'UNRESOLVED_CONFLICT' };
    const access = await getAccess();
    if (!access?.canAudit) return { skipped: true, reason: 'UNAUTHORIZED' };
    const user = await sessionUser();
    const key = AUDIT_SYNC_CORE.activeKey(user?.id || AUDIT_SYNC_CORE.ownerKey(record), record.environmentId) || lockKey(record);
    const previous = locks.get(key) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      const latest = await AUDIT_STORAGE.getAudit(record.auditId) || record;
      if (latest.syncState === 'CONFLICT')
        return { skipped: true, reason: 'UNRESOLVED_CONFLICT' };
      return syncAuditOnce(latest);
    });
    locks.set(key, task);
    return task.finally(() => { if (locks.get(key) === task) locks.delete(key); });
  }

  function scheduleSync(record, delay = 5000) {
    if (!record || AUDIT_SYNC_CORE.isRecoveryAudit(record) || record.syncState === 'CONFLICT')
      return Promise.resolve({ skipped: true, reason: 'UNRESOLVED_CONFLICT' });
    const existing = scheduled.get(record.auditId);
    if (existing) { clearTimeout(existing.timer); existing.resolve({ skipped: true, superseded: true }); }
    return new Promise(resolve => {
      const timer = setTimeout(async () => {
        scheduled.delete(record.auditId);
        try { resolve(await syncAudit(await AUDIT_STORAGE.getAudit(record.auditId) || record)); }
        catch (error) {
          const count = Number(attempts.get(record.auditId) || 0) + 1;
          attempts.set(record.auditId, count);
          if (navigator.onLine && count < 3 && !['23505', '40001'].includes(String(error.code))) {
            scheduleSync(record, [0, 2000, 8000][count] || 15000);
          }
          resolve({ synced: false, error });
        }
      }, delay);
      scheduled.set(record.auditId, { timer, resolve });
    });
  }

  async function flushSync(auditId = null) {
    const ids = auditId ? [auditId] : [...scheduled.keys()];
    const results = [];
    for (const id of ids) {
      const entry = scheduled.get(id);
      if (entry) { clearTimeout(entry.timer); scheduled.delete(id); }
      const record = await AUDIT_STORAGE.getAudit(id);
      if (record) results.push(await syncAudit(record));
    }
    return results;
  }

  async function pullRemote() {
    const user = await currentUser();
    if (!client || !user || !navigator.onLine || !(await getAccess())?.canAudit) return { skipped: true };
    const result = await client.from('audits').select('*').order('updated_at', { ascending: false });
    if (result.error) throw result.error;
    let conflicts = 0;
    for (const row of result.data || []) {
      const remote = remoteToLocal(row);
      const local = await AUDIT_STORAGE.getAudit(remote.auditId);
      if (!local) {
        const logicalLocal = await AUDIT_STORAGE.findActive(remote.environmentId, remote.ownerId);
        if (logicalLocal && logicalLocal.auditId !== remote.auditId) {
          await preserveConflict(logicalLocal, remote, 'ACTIVE_IDENTITY');
          conflicts += 1;
        } else await AUDIT_STORAGE.saveRemoteIfClean(remote);
      }
      else if (local.syncState === 'SYNCED' && Number(remote.serverRevision) >= Number(local.serverRevision || 0)) {
        await AUDIT_STORAGE.saveRemoteIfClean(remote);
      } else if (Number(remote.serverRevision || 0) > Number(local.serverRevision || 0) && ['PENDING', 'ERROR', 'CONFLICT', 'LOCAL_ONLY'].includes(local.syncState)) {
        await preserveConflict(local, remote, 'REMOTE_NEWER');
        conflicts += 1;
      }
    }
    dispatch('audit:remote-pulled', { count: result.data?.length || 0, conflicts });
    return { count: result.data?.length || 0, conflicts };
  }

  // Consulta somente leitura: RLS do Supabase restringe auditorias privadas
  // ao usuario autorizado. A view publicada expõe apenas payload sanitizado.
  async function listAccessibleAudits() {
    if (!client || !navigator.onLine) return { items: [], offline: !navigator.onLine, authenticated: false };
    const user = await currentUser();
    const items = [];
    if (user && (await getAccess())?.canAudit) {
      // Nunca filtrar owner_id no cliente: RLS permite ao ADMIN consultar os registros autorizados de outros auditores.
      const owned = await client.from('audits')
        .select('id,environment_id,status,updated_at,completed_at,server_revision,owner_id,sync_complete,is_public')
        .order('updated_at', { ascending: false }).limit(1000);
      if (owned.error) throw owned.error;
      for (const row of owned.data || []) {
        items.push({
          auditId: row.id, environmentId: row.environment_id, status: row.status,
          updatedAt: row.updated_at, completedAt: row.completed_at,
          serverRevision: row.server_revision, ownerId: row.owner_id,
          isPublic: Boolean(row.is_public), syncComplete: Boolean(row.sync_complete),
          syncState: row.sync_complete ? 'SYNCED' : 'PENDING',
          source: 'REMOTE', remoteOnly: true
        });
      }
    }
    // Metadados mínimos de ocupação, sem expor o payload privado de outro auditor.
    if (user && (await getAccess())?.canAudit) {
      const [occupancy, participation] = await Promise.all([listActiveOccupancy(), listMyParticipation()]);
      const byAudit = new Map(participation.map(item => [item.audit_id, item.status]));
      for (const slot of occupancy) {
        const existing = items.find(item => item.auditId === slot.audit_id);
        if (existing) {
          existing.responsibleName = slot.responsible_name;
          continue;
        }
        items.push({
          auditId: slot.audit_id, environmentId: slot.environment_id,
          status: slot.status, updatedAt: slot.updated_at,
          responsibleName: slot.responsible_name,
          participationStatus: byAudit.get(slot.audit_id) || null,
          source: 'OCCUPANCY', occupancyOnly: true, remoteOnly: true, syncState: 'SYNCED'
        });
      }
    }
    const published = await client.from('published_audits')
      .select('id,environment_id,status,updated_at,completed_at,server_revision')
      .order('updated_at', { ascending: false }).limit(1000);
    if (published.error) throw published.error;
    for (const row of published.data || []) {
      if (items.some(item => item.auditId === row.id)) continue;
      items.push({
        auditId: row.id, environmentId: row.environment_id, status: row.status,
        updatedAt: row.updated_at, completedAt: row.completed_at,
        serverRevision: row.server_revision, syncState: 'SYNCED',
        source: 'PUBLIC', publicOnly: true, remoteOnly: true
      });
    }
    return { items, authenticated: Boolean(user), offline: false,
      limited: (published.data?.length || 0) === 1000 || (user && items.length >= 1000) };
  }

  async function listPublic(environmentId) {
    if (!client || !navigator.onLine) return [];
    const result = await client.from('published_audits').select('id,environment_id,status,public_payload,completed_at,updated_at,server_revision').eq('environment_id', environmentId).order('completed_at', { ascending: false });
    if (result.error) throw result.error;
    return (result.data || []).map(row => ({ ...(row.public_payload || {}), auditId: row.id, environmentId: row.environment_id, status: row.status, completedAt: row.completed_at, updatedAt: row.updated_at, serverRevision: row.server_revision, syncState: 'SYNCED', publicOnly: true }));
  }

  async function syncPending() {
    if (syncing || !client || !navigator.onLine || !(await getAccess())?.canAudit) return { skipped: true };
    syncing = true;
    let synced = 0; let failed = 0; let pendingEvidence = 0;
    dispatch('audit:sync-start');
    try {
      const pending = await AUDIT_STORAGE.listPending();
      const ids = new Set([...pending.audits.map(item => item.auditId), ...pending.evidence.map(item => item.auditId)]);
      for (const id of ids) {
        try {
          attempts.delete(id);
          const record = await AUDIT_STORAGE.getAudit(id);
          const user = await sessionUser();
          if (!record || (record.collaborationEditorId && record.collaborationEditorId !== user?.id) ||
              (record.ownerId && record.ownerId !== user?.id && record.collaborationEditorId !== user?.id) ||
              (!record.ownerId && approvedLocalAdoptions.get(record.auditId) !== user?.id) ||
              (record.localOwnerKey && record.localOwnerKey !== `LOCAL:${await AUDIT_STORAGE.getDeviceId()}`))
            continue;
          const result = await syncAudit(record);
          if (result?.synced) synced += 1;
          else if (!result?.skipped) { failed += 1; pendingEvidence += result?.evidence?.pending || result?.evidence?.errors || 0; }
        } catch (error) { failed += 1; console.error('[AuditRemote]', error); }
      }
      await pullRemote();
      return { synced, failed, pendingEvidence };
    } finally {
      syncing = false;
      dispatch('audit:sync-end', { synced, failed, pendingEvidence });
    }
  }

  async function signIn(email, password) {
    if (!client) throw new Error('Supabase ainda não foi configurado.');
    const result = await client.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    if ((await getAccess())?.canAudit) {
      try { await syncPending(); }
      catch (error) { console.warn('[AuditRemote] Login concluído; sincronização pendente:', error); }
    }
    return result.data.user;
  }
  async function signOut() {
    if (!client) return;
    const user = await sessionUser();
    const result = await client.auth.signOut();
    if (result.error) throw result.error;
    if (user) {
      verifiedAccess.delete(user.id);
      for (const [auditId, adoptedBy] of approvedLocalAdoptions) {
        if (adoptedBy === user.id) approvedLocalAdoptions.delete(auditId);
      }
      try { localStorage.removeItem(`audit-verified-access:${user.id}`); }
      catch (_error) { /* Armazenamento indisponível. */ }
    }
  }
  function onAuthStateChange(callback) {
    if (!client) { queueMicrotask(() => callback('UNCONFIGURED', null)); return () => {}; }
    const sub = client.auth.onAuthStateChange((event, session) => callback(event, session?.user || null));
    sessionUser().then(user => callback('INITIAL', user));
    return () => sub.data.subscription.unsubscribe();
  }

  window.addEventListener('online', () => syncPending().catch(error => console.error('[AuditRemote]', error)));
  return Object.freeze({
    configured, client, currentUser, sessionUser, ownerKey, signIn, signOut, requestAccount, getAccess, approveLegacyAdoption, listAccessRequests, reviewAccessRequest, setPublication, getPublishedAudit, onAuthStateChange,
    findRemoteActive, listActiveOccupancy, requestAuditParticipation, listMyParticipation, listAuditParticipationRequests, reviewAuditParticipation, getSharedAudit, resumeOrCreateActive, syncAudit, scheduleSync, flushSync, syncPending,
    pullRemote, listPublic, listAccessibleAudits, preserveConflict
  });
})();

globalThis.AUDIT_REMOTE = AUDIT_REMOTE;
