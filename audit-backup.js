'use strict';
// Arquivo ZIP local sem dependências: inclui registros e bytes das evidências.
// Nenhum dado é enviado a serviços externos. O backup não restaura automaticamente.
const AUDIT_BACKUP = (() => {
  const button = document.getElementById('exportAuditBackupBtn');
  const status = document.getElementById('auditBackupStatus');
  const encoder = new TextEncoder();
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let k = 0; k < 8; k++) value = (value & 1) ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
    crcTable[n] = value >>> 0;
  }
  async function crc32(blob) {
    let crc = 0xFFFFFFFF;
    // 64 KB por leitura: não carregar várias fotografias grandes na memória RAM.
    for (let pos = 0; pos < blob.size; pos += 65536) {
      const bytes = new Uint8Array(await blob.slice(pos, pos + 65536).arrayBuffer());
      for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function recordHeader(name, size, crc, offset = null) {
    const bytes = encoder.encode(name);
    if (bytes.length > 65535) throw Error('Nome de arquivo muito longo.');
    const central = offset !== null;
    const data = new Uint8Array((central ? 46 : 30) + bytes.length);
    const view = new DataView(data.buffer);
    view.setUint32(0, central ? 0x02014b50 : 0x04034b50, true);
    if (central) {
      view.setUint16(4, 20, true);
      view.setUint16(6, 20, true);
      view.setUint16(8, 0x0800, true);
      view.setUint16(10, 0, true);
      view.setUint32(16, crc, true);
      view.setUint32(20, size, true);
      view.setUint32(24, size, true);
      view.setUint16(28, bytes.length, true);
      view.setUint32(42, offset, true);
      data.set(bytes, 46);
    } else {
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x0800, true);
      view.setUint16(8, 0, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, size, true);
      view.setUint32(22, size, true);
      view.setUint16(26, bytes.length, true);
      data.set(bytes, 30);
    }
    return data;
  }
  async function buildZip(entries) {
    if (!entries.length || entries.length > 65535) throw Error('Quantidade de arquivos incompatível com ZIP.');
    const parts = [], directory = [];
    let offset = 0, directoryBytes = 0;
    for (const entry of entries) {
      const blob = entry.blob instanceof Blob ? entry.blob : new Blob([entry.blob]);
      const size = blob.size;
      if (size > 0xFFFFFFFF || offset + size + 100 > 0xFFFFFFFF)
        throw Error('Backup muito grande para ZIP padrão; divida as coletas em dispositivos.');
      const sum = await crc32(blob);
      const local = recordHeader(entry.name, size, sum);
      const central = recordHeader(entry.name, size, sum, offset);
      parts.push(local, blob);
      directory.push(central);
      offset += local.byteLength + size;
      directoryBytes += central.byteLength;
    }
    if (offset + directoryBytes > 0xFFFFFFFF)
      throw Error('Backup excede o tamanho permitido pelo ZIP padrão.');
    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, entries.length, true);
    view.setUint16(10, entries.length, true);
    view.setUint32(12, directoryBytes, true);
    view.setUint32(16, offset, true);
    return new Blob([...parts, ...directory, end], { type: 'application/zip' });
  }
  const safe = id => String(id || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 160);
  async function collect() {
    const access = await AUDIT_REMOTE.getAccess({ forceRefresh: navigator.onLine });
    const user = await AUDIT_REMOTE.sessionUser();
    if (!user || !access?.canAudit || access.userId !== user.id)
      throw Error('Entre com uma conta de auditor aprovada para exportar o backup.');
    const deviceKey = 'LOCAL:' + await AUDIT_STORAGE.getDeviceId();
    const [allAudits, allEvidence, allConflicts] = await Promise.all([
      AUDIT_STORAGE.listAudits(), AUDIT_STORAGE.listEvidence(), AUDIT_STORAGE.listConflicts()
    ]);
    const canInclude = record => access.admin || record.ownerId === user.id ||
      record.collaborationEditorId === user.id ||
      // Registros v13/v14 podem existir sem qualquer proprietário. Não ignorá-los
      // no backup do aparelho em que já se encontram, mantendo identificação legada.
      (!record.ownerId && (!record.localOwnerKey || record.localOwnerKey === deviceKey));
    const audits = allAudits.filter(canInclude);
    const ids = new Set(audits.map(item => item.auditId));
    const evidence = allEvidence.filter(item => ids.has(item.auditId));
    const conflicts = allConflicts.filter(item => canInclude(item) && ids.has(item.sourceAuditId));
    if (!audits.length && !evidence.length && !conflicts.length)
      throw Error('Nenhuma auditoria desta conta encontrada neste dispositivo.');
    const files = [];
    const metadata = evidence.map(entry => {
      const result = { ...entry };
      delete result.blob;
      result.hasLocalPhoto = entry.blob instanceof Blob;
      if (result.hasLocalPhoto) {
        // Extensão coerente com o formato real para abrir a imagem fora do app.
        const imageExtensions = {
          'image/jpeg': '.jpg', 'image/png': '.png',
          'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif'
        };
        const extension = imageExtensions[entry.mimeType || entry.blob.type] || '.bin';
        const fileName = 'fotografias/' + safe(entry.auditId) + '/' +
          safe(entry.evidenceId) + extension;
        result.archivePath = fileName;
        files.push({ name: fileName, blob: entry.blob });
      }
      return result;
    });
    const missingPhotos = metadata.filter(item => !item.hasLocalPhoto).length;
    const manifest = {
      format: 'CAMPUS_AUDIT_BACKUP_V1',
      exportedAt: new Date().toISOString(),
      warning: 'CONFIDENCIAL: contém dados de auditoria e possivelmente informações pessoais. Não publicar. A restauração é manual e deve preservar IDs e revisões.',
      ownerScope: access.admin ? 'ADMIN_LOCAL_DEVICE' : 'AUTHORIZED_ACCOUNT_LOCAL_DEVICE',
      audits, conflicts, evidence: metadata, missingLocalPhotoCount: missingPhotos
    };
    // O JSON fica no ZIP; a versão pública não contém dados privados.
    const entries = [{ name: 'manifest.json', blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }) }, ...files];
    return { archive: await buildZip(entries), auditCount: audits.length, photoCount: files.length, missingPhotos };
  }
  async function download() {
    button.disabled = true;
    status.textContent = 'Preparando backup local e conferindo fotografias…';
    try {
      const result = await collect();
      const url = URL.createObjectURL(result.archive);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'campus-auditorias-backup-' + new Date().toISOString().slice(0, 10) + '.zip';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = 'Backup gerado: ' + result.auditCount + ' auditoria(s), ' +
        result.photoCount + ' fotografia(s) incluída(s).' +
        (result.missingPhotos ? ' ATENÇÃO: ' + result.missingPhotos + ' evidência(s) sem arquivo local; confira no Supabase.' : '') +
        ' Guarde o ZIP em local seguro.';
    } catch (error) {
      status.textContent = 'Não foi possível criar o backup: ' + (error.message || error);
    } finally { button.disabled = false; }
  }
  button.addEventListener('click', download);
  return Object.freeze({ buildZip, collect });
})();
globalThis.AUDIT_BACKUP = AUDIT_BACKUP;
