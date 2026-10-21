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
  async function getAccess() {
    if (!client) return null;
    const user = await sessionUser();
    if (!user) return null;
    const key = `audit-verified-access:${user.id}`;
    if (!navigator.onLine) {
      let saved = verifiedAccess.get(user.id);
      if (!saved) {
        try { saved = JSON.parse(localStorage.getItem(key) || 'null'); }
        catch (_error) { saved = null; }
      }
      // Offline pode continuar por ate 24h depois da ultima validacao.
      if (saved?.active && saved?.checkedAt > Date.now() - 86400000)
        return { ...saved, offline: true };
      return { active: false, role: null, reviewStatus: 'OFFLINE', canAudit: false, admin: false };
    }
    const { data, error } = await client.from('profiles')
      .select('role,active,display_name,review_status')
      .eq('user_id', user.id).maybeSingle();
    if (error) throw error;
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
      options: { data: { display_name: String(displayName).trim().slice(0, 120) } }
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

  async function syncAuditOnce(record) {
    const user = await currentUser();
    if (!client || !user || !navigator.onLine || AUDIT_SYNC_CORE.isRecoveryAudit(record) || !(await getAccess())?.canAudit) return { skipped: true };
    // Impede que um usuário sincronize registros privados pertencentes a outra conta
    // no mesmo dispositivo. Registros antigos sem dono continuam preservados.
    if (record.ownerId && record.ownerId !== user.id)
      return { skipped: true, reason: 'OTHER_OWNER' };
    if (record.localOwnerKey && record.localOwnerKey !== `LOCAL:${await AUDIT_STORAGE.getDeviceId()}`)
      return { skipped: true, reason: 'OTHER_DEVICE' };
    const audit = structuredClone(record);
    audit.ownerId ||= user.id;
    audit.localOwnerKey = null;
    audit.mutationId ||= newId('MUTATION');
    audit.syncState = 'PENDING'; audit.syncError = null;
    await AUDIT_STORAGE.saveAudit(audit, { allowRemoteMerge: true, enforceActiveUniqueness: true });
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
      await AUDIT_STORAGE.saveAudit(audit, { allowRemoteMerge: true });
      if (isRevision || isDuplicate) {
        const remote = isDuplicate ? await findRemoteActive(audit.environmentId) : await fetchRemoteById(audit.auditId);
        if (remote) await preserveConflict(audit, remote, isDuplicate ? 'ACTIVE_IDENTITY_23505' : 'REVISION_40001');
      }
      throw call.error;
    }
    let row = Array.isArray(call.data) ? call.data[0] : call.data;
    if (!row?.id || !row.server_revision) throw new Error('O Supabase não confirmou a revisão salva.');
    audit.serverRevision = row.server_revision;
    await AUDIT_STORAGE.saveAudit(audit, { allowRemoteMerge: true });
    const evidence = await syncEvidenceForAudit(audit.auditId, user.id);
    const state = AUDIT_SYNC_CORE.aggregateState(true, evidence);
    const summary = AUDIT_SYNC_CORE.evidenceSummary(evidence);
    if (state !== 'SYNCED') {
      audit.syncState = state;
      audit.syncError = state === 'ERROR' ? 'Há evidência com erro de sincronização.' : 'Há evidência aguardando sincronização.';
      await AUDIT_STORAGE.saveAudit(audit, { allowRemoteMerge: true });
      dispatch('audit:sync-state', { auditId: audit.auditId, state, evidence: summary });
      return { synced: false, audit, evidence: summary };
    }
    const final = await client.rpc('finalize_audit_sync', { p_id: audit.auditId, p_expected_revision: Number(audit.serverRevision), p_mutation_id: audit.mutationId });
    if (final.error) throw final.error;
    row = Array.isArray(final.data) ? final.data[0] : final.data;
    if (!row?.sync_complete) throw new Error('O Supabase não confirmou todos os dados e evidências.');
    const syncedAudit = remoteToLocal(row);
    await AUDIT_STORAGE.saveAudit(syncedAudit, { allowRemoteMerge: true });
    attempts.delete(audit.auditId);
    dispatch('audit:sync-state', { auditId: syncedAudit.auditId, state: 'SYNCED', evidence: summary });
    return { synced: true, audit: syncedAudit, evidence: summary };
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
    const access = await getAccess();
    if (!access?.canAudit) return { skipped: true, reason: 'UNAUTHORIZED' };
    const user = await sessionUser();
    const key = AUDIT_SYNC_CORE.activeKey(user?.id || AUDIT_SYNC_CORE.ownerKey(record), record.environmentId) || lockKey(record);
    const previous = locks.get(key) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      const latest = await AUDIT_STORAGE.getAudit(record.auditId) || record;
      return syncAuditOnce(latest);
    });
    locks.set(key, task);
    return task.finally(() => { if (locks.get(key) === task) locks.delete(key); });
  }

  function scheduleSync(record, delay = 5000) {
    if (!record || AUDIT_SYNC_CORE.isRecoveryAudit(record)) return Promise.resolve({ skipped: true });
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
        } else await AUDIT_STORAGE.saveAudit(remote, { allowRemoteMerge: true, enforceActiveUniqueness: true });
      }
      else if (local.syncState === 'SYNCED' && Number(remote.serverRevision) >= Number(local.serverRevision || 0)) {
        await AUDIT_STORAGE.saveAudit(remote, { allowRemoteMerge: true });
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
          if (!record || (record.ownerId && record.ownerId !== user?.id) ||
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
    configured, client, currentUser, sessionUser, ownerKey, signIn, signOut, requestAccount, getAccess, listAccessRequests, reviewAccessRequest, setPublication, getPublishedAudit, onAuthStateChange,
    findRemoteActive, resumeOrCreateActive, syncAudit, scheduleSync, flushSync, syncPending,
    pullRemote, listPublic, listAccessibleAudits, preserveConflict
  });
})();

globalThis.AUDIT_REMOTE = AUDIT_REMOTE;
