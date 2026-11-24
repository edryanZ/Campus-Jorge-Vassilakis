'use strict';

// Leitor do ZIP gerado por AUDIT_BACKUP: sem descompactadores externos.
// Importação somente aditiva, em transação IndexedDB, sem envio automático.
const AUDIT_RESTORE = (() => {
  const button = document.getElementById('restoreAuditBackupBtn');
  const input = document.getElementById('restoreAuditBackupInput');
  const status = document.getElementById('restoreAuditBackupStatus');
  const MAX_ARCHIVE = 512 * 1024 * 1024;
  const MAX_MANIFEST = 8 * 1024 * 1024;
  const MAX_PHOTO = 10 * 1024 * 1024;
  const MAX_ENTRIES = 5000;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let n = i;
    for (let j = 0; j < 8; j += 1) n = (n & 1) ? 0xEDB88320 ^ (n >>> 1) : n >>> 1;
    crcTable[i] = n >>> 0;
  }
  const uint = (view, offset) => view.getUint32(offset, true);
  const short = (view, offset) => view.getUint16(offset, true);
  const validId = value => typeof value === 'string' && value.length > 0 &&
    value.length <= 220 && !/[\u0000-\u001f]/.test(value);
  function uniqueIds(items, key) {
    const seen = new Set();
    for (const item of items) {
      if (!item || !validId(item[key]) || seen.has(item[key]))
        throw Error('Identificador ausente ou duplicado no backup: ' + key);
      seen.add(item[key]);
    }
  }
  async function crc32(blob) {
    let crc = 0xFFFFFFFF;
    for (let offset = 0; offset < blob.size; offset += 65536) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + 65536).arrayBuffer());
      for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  async function parseZip(file) {
    if (!(file instanceof Blob) || file.size < 22 || file.size > MAX_ARCHIVE)
      throw Error('ZIP inválido ou acima do limite de 512 MB.');
    const endBytes = await file.slice(file.size - 22).arrayBuffer();
    const end = new DataView(endBytes);
    if (uint(end, 0) !== 0x06054b50 || short(end, 20) !== 0 ||
        short(end, 4) || short(end, 6) || short(end, 8) !== short(end, 10))
      throw Error('O ZIP deve ser um backup completo do CJV, sem volumes ou comentários.');
    const count = short(end, 10), size = uint(end, 12), start = uint(end, 16);
    if (!count || count > MAX_ENTRIES || size > 2 * 1024 * 1024 ||
        start + size !== file.size - 22)
      throw Error('Diretório ZIP inconsistente ou com entradas excessivas.');
    const bytes = new Uint8Array(await file.slice(start, start + size).arrayBuffer());
    const dir = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let pos = 0;
    const entries = new Map();
    const ranges = [];
    for (let i = 0; i < count; i += 1) {
      if (pos + 46 > size || uint(dir, pos) !== 0x02014b50)
        throw Error('Diretório ZIP danificado.');
      const flags = short(dir, pos + 8), method = short(dir, pos + 10);
      const crc = uint(dir, pos + 16), packed = uint(dir, pos + 20);
      const unpacked = uint(dir, pos + 24);
      const len = short(dir, pos + 28), extra = short(dir, pos + 30);
      const comment = short(dir, pos + 32), disk = short(dir, pos + 34);
      const localOffset = uint(dir, pos + 42);
      if (flags !== 0x0800 || method || disk || packed !== unpacked ||
          pos + 46 + len + extra + comment > size)
        throw Error('ZIP incompatível: apenas entradas originais sem compressão são aceitas.');
      const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + len));
      if (entries.has(name) || (name !== 'manifest.json' &&
          !/^fotografias\/[A-Za-z0-9._-]{1,160}\/[A-Za-z0-9._-]{1,160}\.(jpg|png|webp|heic|heif|bin)$/.test(name)))
        throw Error('Arquivo inesperado ou duplicado no ZIP.');
      if ((name === 'manifest.json' && packed > MAX_MANIFEST) ||
          (name !== 'manifest.json' && packed > MAX_PHOTO) ||
          localOffset + 30 > start)
        throw Error('Arquivo muito grande ou posição ZIP inválida.');
      const head = new DataView(await file.slice(localOffset, localOffset + 30).arrayBuffer());
      if (uint(head, 0) !== 0x04034b50 || short(head, 6) !== flags ||
          short(head, 8) !== method || uint(head, 14) !== crc ||
          uint(head, 18) !== packed || uint(head, 22) !== unpacked)
        throw Error('Cabeçalho do arquivo não confere com o índice ZIP.');
      const localNameLen = short(head, 26), localExtraLen = short(head, 28);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      if (dataStart + packed > start) throw Error('Arquivo ultrapassa o diretório ZIP.');
      const localName = decoder.decode(new Uint8Array(
        await file.slice(localOffset + 30, localOffset + 30 + localNameLen).arrayBuffer()));
      if (localName !== name) throw Error('Nomes divergentes dentro do ZIP.');
      const content = file.slice(dataStart, dataStart + packed);
      if ((await crc32(content)) !== crc)
        throw Error('Integridade CRC-32 inválida: ' + name);
      ranges.push([localOffset, dataStart + packed]);
      entries.set(name, content);
      pos += 46 + len + extra + comment;
    }
    ranges.sort((a, b) => a[0] - b[0]);
    if (pos !== size || ranges.some((r, i) => i > 0 && r[0] < ranges[i - 1][1]))
      throw Error('Estrutura ZIP inválida ou arquivos sobrepostos.');
    if (!entries.has('manifest.json')) throw Error('Manifesto do CJV ausente.');
    return entries;
  }
  function readManifest(manifest, entries) {
    if (!manifest || manifest.format !== 'CAMPUS_AUDIT_BACKUP_V1' ||
        !Array.isArray(manifest.audits) || !Array.isArray(manifest.evidence) ||
        !Array.isArray(manifest.conflicts) || !manifest.audits.length ||
        manifest.audits.length > 3000 || manifest.evidence.length > MAX_ENTRIES ||
        manifest.conflicts.length > MAX_ENTRIES)
      throw Error('Manifesto inválido: formato ou quantidades incompatíveis.');
    uniqueIds(manifest.audits, 'auditId');
    uniqueIds(manifest.evidence, 'evidenceId');
    uniqueIds(manifest.conflicts, 'conflictId');
    const auditById = new Map(manifest.audits.map(audit => [audit.auditId, audit]));
    const audits = new Set(auditById.keys());
    for (const audit of manifest.audits) {
      if (!validId(audit.environmentId) ||
          !['DRAFT', 'IN_PROGRESS', 'COMPLETED'].includes(audit.status) ||
          (audit.ownerId != null && !validId(audit.ownerId)) ||
          !audit.data || typeof audit.data !== 'object' || Array.isArray(audit.data) ||
          (audit.evidenceIds != null && !Array.isArray(audit.evidenceIds)) ||
          (audit.nonConformities != null && !Array.isArray(audit.nonConformities)) ||
          (audit.reviewedSteps != null &&
            (typeof audit.reviewedSteps !== 'object' || Array.isArray(audit.reviewedSteps))))
        throw Error('Auditoria com ambiente, status ou proprietário inválido.');
    }
    const used = new Set(['manifest.json']);
    for (const evidence of manifest.evidence) {
      if (!audits.has(evidence.auditId) ||
          (evidence.ownerId != null && !validId(evidence.ownerId)) ||
          (evidence.ownerId != null && evidence.ownerId !== auditById.get(evidence.auditId).ownerId))
        throw Error('Evidência sem auditoria válida ou com proprietário divergente.');
      if (!evidence.hasLocalPhoto) {
        if (evidence.archivePath) throw Error('Fotografia ausente possui caminho ZIP indevido.');
        continue;
      }
      const safe = id => String(id).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 160);
      const prefix = 'fotografias/' + safe(evidence.auditId) + '/' + safe(evidence.evidenceId) + '.';
      if (typeof evidence.archivePath !== 'string' ||
          !evidence.archivePath.startsWith(prefix) ||
          !entries.has(evidence.archivePath) || used.has(evidence.archivePath))
        throw Error('Arquivo de fotografia ausente, repetido ou vinculado ao ID incorreto.');
      used.add(evidence.archivePath);
      const photo = entries.get(evidence.archivePath);
      // V1 antigo sem campo de tamanho: o CRC do ZIP ainda é obrigatório.
      if (evidence.size != null && Number(evidence.size) !== photo.size)
        throw Error('Tamanho da fotografia diferente do manifesto.');
    }
    for (const conflict of manifest.conflicts) {
      if (!audits.has(conflict.sourceAuditId)) throw Error('Conflito sem auditoria válida.');
    }
    if (entries.size !== used.size)
      throw Error('O ZIP contém arquivos não declarados no manifesto.');
    return manifest;
  }
  async function inspect(file) {
    const entries = await parseZip(file);
    let parsed;
    try { parsed = JSON.parse(await entries.get('manifest.json').text()); }
    catch (_error) { throw Error('Manifesto JSON ilegível.'); }
    const manifest = readManifest(parsed, entries);
    return { archive: file, manifest, entries, audits: manifest.audits.length,
      photos: manifest.evidence.filter(item => item.hasLocalPhoto).length,
      missingPhotos: manifest.evidence.filter(item => !item.hasLocalPhoto).length };
  }
  async function authorizedUser() {
    const [user, access] = await Promise.all([
      AUDIT_REMOTE.sessionUser(), AUDIT_REMOTE.getAccess({ forceRefresh: navigator.onLine })
    ]);
    if (!user || !access?.canAudit || access.userId !== user.id)
      throw Error('Entre com uma conta autorizada para restaurar o backup.');
    return { user, access };
  }
  async function restore(file, preview = null) {
    const before = await authorizedUser();
    // Um resumo produzido para outro arquivo não autoriza importar bytes diferentes.
    // Reconferir os bytes depois da confirmação: nenhum resumo externo
    // ou ZIP alterado entre prévia e restauração pode ignorar o CRC.
    const inspected = await inspect(file);
    const currentDevice = 'LOCAL:' + await AUDIT_STORAGE.getDeviceId();
    for (const audit of inspected.manifest.audits) {
      if ((!before.access.admin && audit.ownerId && audit.ownerId !== before.user.id) ||
          (!before.access.admin && !audit.ownerId && audit.localOwnerKey &&
            audit.localOwnerKey !== currentDevice))
        throw Error('O backup contém auditoria de outra conta ou dispositivo legado. Nenhum dado foi restaurado.');
    }
    const all = await Promise.all([
      AUDIT_STORAGE.listAudits(), AUDIT_STORAGE.listEvidence(), AUDIT_STORAGE.listConflicts()
    ]);
    const existingAudits = new Map(all[0].map(r => [r.auditId, r]));
    const existingEvidence = new Set(all[1].map(r => r.evidenceId));
    const existingConflicts = new Set(all[2].map(r => r.conflictId));
    const audits = inspected.manifest.audits.filter(r => !existingAudits.has(r.auditId));
    const ids = new Set(audits.map(a => a.auditId));
    const sourceAudits = new Map(inspected.manifest.audits.map(r => [r.auditId, r]));
    const evidence = inspected.manifest.evidence.filter(item => {
      // Um arquivo de backup nunca substitui uma foto já cadastrada.
      if (existingEvidence.has(item.evidenceId)) return false;
      if (ids.has(item.auditId)) return true;
      // Recuperar uma evidência ausente de auditoria que já existe é seguro
      // somente com mesmo ambiente, mesmo proprietário e vínculo prévio no registro.
      const current = existingAudits.get(item.auditId);
      const source = sourceAudits.get(item.auditId);
      if (!current || !source) return false;
      if (current.environmentId !== source.environmentId ||
          (current.ownerId || null) !== (source.ownerId || null) ||
          (current.localOwnerKey || null) !== (source.localOwnerKey || null))
        throw Error('A auditoria existente diverge do backup: importação cancelada sem sobrescrever.');
      return Array.isArray(current.evidenceIds) && current.evidenceIds.includes(item.evidenceId);
    });
    const conflicts = inspected.manifest.conflicts.filter(r =>
      ids.has(r.sourceAuditId) && !existingConflicts.has(r.conflictId));
    const existingPhotoTargets = [...new Set(evidence
      .filter(item => !ids.has(item.auditId)).map(item => item.auditId))];
    const preparedAudits = audits.map(record => ({
      ...structuredClone(record),
      // Reconciliação manual obrigatória; nunca iniciar upload ou publicar
      // automaticamente dados recuperados de outra instalação.
      syncState: 'CONFLICT',
      syncError: 'Restaurada de backup. Confira esta versão antes de sincronizar.',
      lastSyncedAt: null
    }));
    const preparedEvidence = evidence.map(item => {
      const copy = { ...structuredClone(item) };
      const photo = item.hasLocalPhoto ? inspected.entries.get(item.archivePath) : null;
      delete copy.hasLocalPhoto; delete copy.archivePath;
      if (photo) {
        copy.blob = photo.slice(0, photo.size, item.mimeType || 'application/octet-stream');
        copy.size = photo.size;
      }
      copy.syncState = photo ? 'PENDING' : 'ERROR';
      copy.syncError = photo ? null : 'Backup sem bytes locais desta fotografia.';
      copy.remoteVerifiedAt = null;
      return copy;
    });
    const after = await authorizedUser();
    if (after.user.id !== before.user.id || after.access.admin !== before.access.admin)
      throw Error('A conta mudou durante a importação: operação cancelada.');
    if (!preparedAudits.length && !preparedEvidence.length && !conflicts.length)
      return { imported: 0, ignored: inspected.audits, photos: 0,
        missingPhotos: inspected.missingPhotos };
    // Não ler dados nem esperar chamadas externas enquanto a transação está aberta.
    const db = await AUDIT_STORAGE.openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['audits', 'evidence', 'conflicts'], 'readwrite');
      const auditStore = tx.objectStore('audits');
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || Error('Importação cancelada; nenhuma alteração foi gravada.'));
      for (const id of existingPhotoTargets) {
        // Conferir a versão real dentro da transação: uma coleta pode ter
        // mudado depois da prévia; nunca salvar um snapshot antigo por cima dela.
        const check = auditStore.get(id);
        check.onerror = () => tx.abort();
        check.onsuccess = () => {
          const current = check.result;
          const original = sourceAudits.get(id);
          const evidenceIds = evidence.filter(item => item.auditId === id).map(item => item.evidenceId);
          if (!current || !original ||
              current.environmentId !== original.environmentId ||
              (current.ownerId || null) !== (original.ownerId || null) ||
              (current.localOwnerKey || null) !== (original.localOwnerKey || null) ||
              !evidenceIds.every(evidenceId =>
                Array.isArray(current.evidenceIds) && current.evidenceIds.includes(evidenceId))) {
            tx.abort();
            return;
          }
          // Apenas metadados de proteção mudam. O conteúdo coletado permanece
          // exatamente o atual. CONFLICT bloqueia qualquer envio automático.
          auditStore.put({
            ...current, syncState: 'CONFLICT', restoreReviewRequired: true,
            syncError: 'Fotografia recuperada do ZIP; confira antes de sincronizar.'
          });
        };
      }
      for (const record of preparedAudits) auditStore.add(record);
      for (const record of preparedEvidence) tx.objectStore('evidence').add(record);
      for (const record of conflicts) tx.objectStore('conflicts').add(structuredClone(record));
    });
    window.dispatchEvent(new Event('audit:local-updated'));
    return { imported: preparedAudits.length, ignored: inspected.audits - preparedAudits.length,
      photos: preparedEvidence.filter(item => item.blob).length,
      missingPhotos: preparedEvidence.filter(item => !item.blob).length };
  }
  async function onSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    button.disabled = true;
    const exportButton = document.getElementById('exportAuditBackupBtn');
    if (exportButton) exportButton.disabled = true;
    try {
      status.textContent = 'Conferindo estrutura, integridade e fotografias do ZIP…';
      const preview = await inspect(file);
      const missing = preview.missingPhotos
        ? '\nAtenção: ' + preview.missingPhotos + ' fotografia(s) não estão presentes no backup.' : '';
      if (!window.confirm('Backup válido: ' + preview.audits + ' auditoria(s), ' +
          preview.photos + ' fotografia(s).\n\nImportar apenas registros que ainda não existem neste dispositivo?' +
          '\nNão substitui arquivos atuais nem sincroniza automaticamente.' + missing)) {
        status.textContent = 'Restauração cancelada. Nenhum registro alterado.';
        return;
      }
      status.textContent = 'Restaurando apenas registros ausentes no dispositivo…';
      const result = await restore(file, preview);
      status.textContent = 'Restauração concluída: ' + result.imported + ' auditoria(s) nova(s), ' +
        result.photos + ' fotografia(s) recuperada(s), ' + result.ignored +
        ' auditoria(s) existente(s) preservada(s).' +
        (result.missingPhotos ? ' Atenção: ' + result.missingPhotos + ' foto(s) sem arquivo no backup.' : '') +
        ' Registros recuperados exigem conferência e não são enviados automaticamente.';
    } catch (error) {
      status.textContent = 'Restauração não efetuada: ' + (error.message || error);
    } finally {
      input.value = '';
      button.disabled = false;
      if (exportButton) exportButton.disabled = false;
    }
  }
  if (button && input) {
    button.addEventListener('click', () => input.click());
    input.addEventListener('change', onSelected);
  }
  return Object.freeze({ inspect, restore, crc32 });
})();
globalThis.AUDIT_RESTORE = AUDIT_RESTORE;
