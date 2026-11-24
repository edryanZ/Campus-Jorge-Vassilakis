'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = pathName => fs.readFileSync(path.join(__dirname, '..', pathName), 'utf8');
const clone = item => structuredClone(item);
function fixture({ owner = 'CONTA-FICTICIA', admin = false } = {}) {
  const stores = { audits: [], evidence: [], conflicts: [] };
  let user = { id: 'CONTA-FICTICIA' };
  const listeners = {};
  const dom = {
    exportAuditBackupBtn: { addEventListener() {}, disabled: false },
    auditBackupStatus: { textContent: '' },
    restoreAuditBackupBtn: { addEventListener(name, fn) { listeners['button:' + name] = fn; }, disabled: false },
    restoreAuditBackupInput: { addEventListener(name, fn) { listeners['input:' + name] = fn; }, files: [] },
    restoreAuditBackupStatus: { textContent: '' }
  };
  const context = {
    document: { getElementById(id) { return dom[id] || null; } },
    window: { dispatchEvent() {}, confirm() { return true; } },
    Event, TextEncoder, TextDecoder, Blob, Uint32Array, Uint8Array,
    DataView, ArrayBuffer, structuredClone,
    navigator: { onLine: true },
    AUDIT_REMOTE: {
      async sessionUser() { return user; },
      async getAccess() { return { canAudit: true, userId: user.id, admin }; }
    },
    AUDIT_STORAGE: {
      async getDeviceId() { return 'DEVICE-FICTICIO'; },
      async listAudits() { return clone(stores.audits); },
      async listEvidence() { return clone(stores.evidence); },
      async listConflicts() { return clone(stores.conflicts); },
      async openDatabase() {
        return {
          transaction(names, mode) {
            assert.equal(mode, 'readwrite');
            assert.deepEqual(names, ['audits', 'evidence', 'conflicts']);
            const pending = { audits: [], evidence: [], conflicts: [] };
            const updates = { audits: [], evidence: [], conflicts: [] };
            const ids = { audits: 'auditId', evidence: 'evidenceId', conflicts: 'conflictId' };
            let aborted = false;
            const tx = {
              abort() { aborted = true; tx.onabort?.(); },
              objectStore(name) {
                return {
                  get(id) {
                    const request = { result: stores[name].find(item => item[ids[name]] === id) };
                    queueMicrotask(() => request.onsuccess?.());
                    return request;
                  },
                  put(record) { updates[name].push(record); return {}; },
                  add(record) {
                    const id = record[ids[name]];
                    if ([...stores[name], ...pending[name]].some(item => item[ids[name]] === id))
                      throw new Error('Duplicidade');
                    pending[name].push(record);
                    return {};
                  }
                };
              }
            };
            // Simula commit após os callbacks de leitura transacional.
            queueMicrotask(() => queueMicrotask(() => {
              if (aborted) return;
              for (const name of names) {
                for (const update of updates[name]) {
                  const index = stores[name].findIndex(item => item[ids[name]] === update[ids[name]]);
                  if (index < 0) throw new Error('Atualização sem registro');
                  stores[name][index] = update;
                }
                stores[name].push(...pending[name]);
              }
              tx.oncomplete?.();
            }));
            return tx;
          }
        };
      }
    }
  };
  vm.runInNewContext(read('audit-backup.js'), context);
  vm.runInNewContext(read('audit-restore.js'), context);
  const record = {
    auditId: 'AUDIT-FICTICIA', environmentId: 'BLOCO-A-SALA-2',
    ownerId: owner, status: 'IN_PROGRESS', serverRevision: 7,
    syncState: 'SYNCED', evidenceIds: ['EVIDENCIA-FICTICIA'],
    data: { identification: { inspector: 'DADO FICTÍCIO PARA TESTE' } }
  };
  const photoBytes = new Uint8Array([1, 2, 3, 4, 5]);
  const photoPath = 'fotografias/AUDIT-FICTICIA/EVIDENCIA-FICTICIA.jpg';
  const evidence = {
    evidenceId: 'EVIDENCIA-FICTICIA', auditId: record.auditId,
    hasLocalPhoto: true, archivePath: photoPath,
    mimeType: 'image/jpeg', size: photoBytes.length
  };
  const manifest = {
    format: 'CAMPUS_AUDIT_BACKUP_V1', exportedAt: '2026-11-24T13:00:00Z',
    audits: [record], evidence: [evidence], conflicts: []
  };
  async function zip(nextManifest = manifest, files = [{ name: photoPath, blob: new Blob([photoBytes]) }]) {
    return context.AUDIT_BACKUP.buildZip([
      { name: 'manifest.json', blob: new Blob([JSON.stringify(nextManifest)]) }, ...files
    ]);
  }
  return { context, manifest, zip, stores, setUser(next) { user = { id: next }; }, photoBytes };
}

test('ZIP exportado pelo CJV é verificável e preserva fotografia intacta', async () => {
  const f = fixture(), archive = await f.zip();
  const inspected = await f.context.AUDIT_RESTORE.inspect(archive);
  assert.equal(inspected.audits, 1);
  assert.equal(inspected.photos, 1);
  const result = await f.context.AUDIT_RESTORE.restore(archive, inspected);
  assert.equal(result.imported, 1);
  assert.equal(result.photos, 1);
  assert.equal(f.stores.audits[0].data.identification.inspector, 'DADO FICTÍCIO PARA TESTE');
  assert.equal(f.stores.audits[0].syncState, 'CONFLICT');
  assert.deepEqual([...new Uint8Array(await f.stores.evidence[0].blob.arrayBuffer())], [...f.photoBytes]);
});

test('mesmo ZIP importado duas vezes não sobrescreve a auditoria', async () => {
  const f = fixture(), archive = await f.zip();
  await f.context.AUDIT_RESTORE.restore(archive);
  f.stores.audits[0].data.identification.inspector = 'DADO FICTÍCIO PARA TESTE ALTERADO';
  const repeated = await f.context.AUDIT_RESTORE.restore(archive);
  assert.equal(repeated.imported, 0);
  assert.equal(repeated.ignored, 1);
  assert.equal(f.stores.audits[0].data.identification.inspector, 'DADO FICTÍCIO PARA TESTE ALTERADO');
  assert.equal(f.stores.evidence.length, 1);
});

test('arquivo adulterado não importa nem substitui registros', async () => {
  const f = fixture(), archive = await f.zip();
  const bytes = new Uint8Array(await archive.arrayBuffer());
  const needle = new TextEncoder().encode('DADO FICTÍCIO PARA TESTE');
  const index = bytes.findIndex((v, i) =>
    v === needle[0] && needle.every((part, j) => bytes[i + j] === part));
  assert.ok(index > 0);
  bytes[index] ^= 1;
  await assert.rejects(f.context.AUDIT_RESTORE.restore(new Blob([bytes])), /CRC-32/);
  assert.equal(f.stores.audits.length, 0);
});

test('conta diferente não restaura backup privado de outro auditor', async () => {
  const f = fixture({ owner: 'OUTRA-CONTA-FICTICIA' });
  await assert.rejects(f.context.AUDIT_RESTORE.restore(await f.zip()), /outra conta/);
  assert.equal(f.stores.audits.length, 0);
});

test('ZIP com fotografia ausente é recusado quando manifesta arquivo existente', async () => {
  const f = fixture();
  await assert.rejects(f.context.AUDIT_RESTORE.restore(await f.zip(f.manifest, [])), /ausente/);
  assert.equal(f.stores.audits.length, 0);
});

test('backup sem bytes de uma foto é aceito com aviso, sem inventar fotografia', async () => {
  const f = fixture();
  const next = clone(f.manifest);
  next.evidence[0].hasLocalPhoto = false;
  delete next.evidence[0].archivePath;
  const result = await f.context.AUDIT_RESTORE.restore(await f.zip(next, []));
  assert.equal(result.imported, 1);
  assert.equal(result.missingPhotos, 1);
  assert.equal(f.stores.evidence[0].blob, undefined);
  assert.equal(f.stores.evidence[0].syncState, 'ERROR');
});

test('IDs de auditoria duplicados no manifesto cancelam a restauração', async () => {
  const f = fixture(), next = clone(f.manifest);
  next.audits.push(clone(next.audits[0]));
  await assert.rejects(f.context.AUDIT_RESTORE.restore(await f.zip(next)), /duplicado/);
  assert.equal(f.stores.audits.length, 0);
});

test('restauração não mistura dados após troca de sessão', async () => {
  const f = fixture();
  const preview = await f.context.AUDIT_RESTORE.inspect(await f.zip());
  f.setUser('OUTRA-CONTA-FICTICIA');
  await assert.rejects(f.context.AUDIT_RESTORE.restore(await f.zip(), preview), /outra conta/);
  assert.equal(f.stores.audits.length, 0);
});

test('o frontend expõe apenas restauração manual e mantém cache compatível', () => {
  const html = read('index.html');
  const sw = read('sw.js');
  const app = read('audit-app.js');
  assert.match(html, /id="restoreAuditBackupBtn"/);
  assert.match(html, /audit-restore\.js/);
  assert.match(sw, /campus-auditoria-v16-5-7/);
  assert.match(sw, /\.\/audit-restore\.js/);
  assert.match(app, /restoreBackupButton\.hidden = !?false/);
});

test('resumo de outro ZIP não permite ignorar validação da integridade', async () => {
  const f = fixture(), original = await f.zip();
  const preview = await f.context.AUDIT_RESTORE.inspect(original);
  const bytes = new Uint8Array(await original.arrayBuffer());
  const needle = new TextEncoder().encode('DADO FICTÍCIO PARA TESTE');
  const pos = bytes.findIndex((v, i) =>
    v === needle[0] && needle.every((part, j) => bytes[i + j] === part));
  assert.ok(pos > 0);
  bytes[pos] ^= 1;
  await assert.rejects(f.context.AUDIT_RESTORE.restore(new Blob([bytes]), preview), /CRC-32/);
  assert.equal(f.stores.audits.length, 0);
});

test('manifesto sem estrutura de respostas válida é recusado', async () => {
  const f = fixture(), broken = clone(f.manifest);
  broken.audits[0].data = null;
  await assert.rejects(f.context.AUDIT_RESTORE.inspect(await f.zip(broken)), /inválido/);
  assert.equal(f.stores.audits.length, 0);
});

test('ZIP V1 antigo sem tamanho declarado de fotografia preserva bytes e completa metadado', async () => {
  const f = fixture(), legacy = clone(f.manifest);
  delete legacy.evidence[0].size;
  const archive = await f.zip(legacy);
  const result = await f.context.AUDIT_RESTORE.restore(archive);
  assert.equal(result.imported, 1);
  assert.equal(result.photos, 1);
  assert.equal(f.stores.evidence[0].size, f.photoBytes.length);
  assert.deepEqual([...new Uint8Array(await f.stores.evidence[0].blob.arrayBuffer())], [...f.photoBytes]);
});

test('prévia forjada não evita a conferência do ZIP original', async () => {
  const f = fixture(), archive = await f.zip();
  const fake = {
    archive, manifest: { format: 'CAMPUS_AUDIT_BACKUP_V1', audits: [],
      evidence: [], conflicts: [] }, entries: new Map()
  };
  const result = await f.context.AUDIT_RESTORE.restore(archive, fake);
  assert.equal(result.imported, 1);
  assert.equal(f.stores.audits[0].auditId, f.manifest.audits[0].auditId);
});

test('auditoria já existente recebe fotografia faltante sem modificar a coleta', async () => {
  const f = fixture();
  const previous = clone(f.manifest.audits[0]);
  previous.updatedAt = '2026-11-24T13:00:00Z';
  previous.data.identification.inspector = 'DADO FICTÍCIO PARA TESTE PRESERVADO';
  f.stores.audits.push(previous);
  const result = await f.context.AUDIT_RESTORE.restore(await f.zip());
  assert.equal(result.imported, 0);
  assert.equal(result.ignored, 1);
  assert.equal(result.photos, 1);
  assert.equal(f.stores.audits.length, 1);
  assert.equal(f.stores.audits[0].data.identification.inspector,
    previous.data.identification.inspector);
  assert.equal(f.stores.audits[0].updatedAt, previous.updatedAt);
  assert.equal(f.stores.audits[0].syncState, 'CONFLICT');
  assert.equal(f.stores.audits[0].restoreReviewRequired, true);
  assert.equal(f.stores.evidence.length, 1);
  assert.deepEqual([...new Uint8Array(await f.stores.evidence[0].blob.arrayBuffer())], [...f.photoBytes]);
});

test('evidência existente não é substituída por cópia do ZIP', async () => {
  const f = fixture();
  f.stores.audits.push(clone(f.manifest.audits[0]));
  f.stores.evidence.push({
    evidenceId: 'EVIDENCIA-FICTICIA', auditId: 'AUDIT-FICTICIA',
    blob: new Blob([new Uint8Array([9, 8, 7])]), description: 'FOTO ANTERIOR'
  });
  const result = await f.context.AUDIT_RESTORE.restore(await f.zip());
  assert.equal(result.imported, 0);
  assert.equal(result.photos, 0);
  assert.equal(f.stores.evidence.length, 1);
  assert.equal(f.stores.evidence[0].description, 'FOTO ANTERIOR');
  assert.deepEqual([...new Uint8Array(await f.stores.evidence[0].blob.arrayBuffer())], [9, 8, 7]);
});

test('foto sem referência em auditoria existente não é anexada por engano', async () => {
  const f = fixture();
  const existing = clone(f.manifest.audits[0]);
  existing.evidenceIds = [];
  f.stores.audits.push(existing);
  const result = await f.context.AUDIT_RESTORE.restore(await f.zip());
  assert.equal(result.photos, 0);
  assert.equal(f.stores.evidence.length, 0);
  assert.deepEqual(f.stores.audits[0], existing);
});

test('divergência de ambiente em auditoria já existente cancela recuperação de foto', async () => {
  const f = fixture();
  const existing = clone(f.manifest.audits[0]);
  existing.environmentId = 'AMBIENTE-FICTICIO-DIFERENTE';
  f.stores.audits.push(existing);
  await assert.rejects(f.context.AUDIT_RESTORE.restore(await f.zip()), /diverge do backup/);
  assert.equal(f.stores.evidence.length, 0);
  assert.equal(f.stores.audits[0].environmentId, 'AMBIENTE-FICTICIO-DIFERENTE');
});

test('proprietário de evidência não pode divergir do proprietário da auditoria', async () => {
  const f = fixture(), wrong = clone(f.manifest);
  wrong.evidence[0].ownerId = 'OUTRA-CONTA-FICTICIA';
  await assert.rejects(f.context.AUDIT_RESTORE.inspect(await f.zip(wrong)), /proprietário divergente/);
  assert.equal(f.stores.audits.length, 0);
});

test('caminho de foto não pode ser trocado por caminho de outra evidência', async () => {
  const f = fixture(), wrong = clone(f.manifest);
  wrong.evidence[0].archivePath = 'fotografias/AUDIT-FICTICIA/OUTRA-EVIDENCIA.jpg';
  const archive = await f.zip(wrong, [{ name: wrong.evidence[0].archivePath, blob: new Blob([f.photoBytes]) }]);
  await assert.rejects(f.context.AUDIT_RESTORE.inspect(archive), /vinculado ao ID incorreto/);
  assert.equal(f.stores.audits.length, 0);
});
