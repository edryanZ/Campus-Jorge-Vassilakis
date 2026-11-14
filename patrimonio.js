'use strict';
// Inventário de apoio por conta no dispositivo. Não substitui tombos oficiais.
const CAMPUS_PATRIMONY = (() => {
  const DB = 'campus-jorge-vassilakis-patrimonio-auxiliar';
  const modal = document.getElementById('assetModal');
  const form = document.getElementById('assetForm');
  const envPicker = document.getElementById('assetEnvironment');
  const status = document.getElementById('assetStatus');
  const listing = document.getElementById('assetList');
  const countLabel = document.getElementById('assetOverview');
  const button = document.getElementById('overviewAssetsBtn');
  const conditions = Object.freeze({
    NAO_AVALIADO:'Não avaliado', ADEQUADO:'Adequado',
    ATENCAO:'Requer manutenção', FORA_DE_USO:'Fora de uso'
  });
  let database, generation = 0;
  function normalize(data) {
    const tombo = String(data.tombo || '').trim().toUpperCase();
    const description = String(data.description || '').trim();
    const environmentId = String(data.environmentId || '').trim();
    const condition = String(data.condition || 'NAO_AVALIADO');
    const notes = String(data.notes || '').trim();
    if (!/^[A-Z0-9][A-Z0-9._/ -]{0,49}$/.test(tombo))
      throw new Error('Informe o número de tombo existente na etiqueta (até 50 caracteres).');
    if (!description || description.length > 140) throw new Error('Descrição do bem obrigatória (até 140 caracteres).');
    if (!AUDIT_DATA.getEnvironment(environmentId)) throw new Error('Selecione um ambiente cadastrado.');
    if (!Object.hasOwn(conditions, condition)) throw new Error('Condição inválida.');
    if (notes.length > 500) throw new Error('Observações devem ter até 500 caracteres.');
    return { tombo, description, environmentId, condition, notes };
  }
  function openDB() {
    if (database) return database;
    database = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('bens')) {
          const store = db.createObjectStore('bens', { keyPath: 'id' });
          store.createIndex('ownerId', 'ownerId');
          store.createIndex('ownerTombo', ['ownerId','tombo'], { unique:true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { database = null; reject(req.error); };
      req.onblocked = () => { database = null; reject(Error('Feche outras abas para acessar o inventário.')); };
    });
    return database;
  }
  async function listFor(ownerId) {
    const db = await openDB();
    return new Promise((resolve,reject) => {
      const req = db.transaction('bens','readonly').objectStore('bens').index('ownerId').getAll(ownerId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  async function save(record) {
    const db = await openDB();
    return new Promise((resolve,reject) => {
      const tx = db.transaction('bens','readwrite');
      const req = tx.objectStore('bens').add(record);
      req.onerror = () => reject(req.error?.name === 'ConstraintError'
        ? Error('Este tombo já está registrado nesta conta e dispositivo.') : req.error);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error?.name === 'ConstraintError'
        ? Error('Este tombo já está registrado nesta conta e dispositivo.') : tx.error || Error('Falha ao salvar no dispositivo.'));
    });
  }
  async function authorized() {
    const access = await AUDIT_REMOTE.getAccess();
    const user = await AUDIT_REMOTE.sessionUser();
    if (!access?.canAudit || !user || access.userId !== user.id)
      throw Error('Entre com uma conta aprovada para acessar o inventário auxiliar.');
    return user;
  }
  function close() {
    ++generation;
    modal.hidden = true;
    listing.replaceChildren();
    form.hidden = true;
    form.reset();
    if (['authModal','auditModal','auditCenterModal'].every(id => document.getElementById(id).hidden))
      document.body.classList.remove('audit-open');
  }
  function render(item) {
    const card = document.createElement('article');
    card.className = 'asset-record';
    const title = document.createElement('strong');
    title.textContent = 'Tombo ' + item.tombo + ' · ' + item.description;
    const env = AUDIT_DATA.getEnvironment(item.environmentId);
    const location = document.createElement('p');
    location.textContent = env ? env.blockName + ' · ' + (env.roomNumber ? 'Sala ' + env.roomNumber : env.name) : item.environmentId;
    const info = document.createElement('small');
    info.textContent = conditions[item.condition] || conditions.NAO_AVALIADO;
    card.append(title, location, info);
    if (item.notes) {
      const note = document.createElement('small');
      note.textContent = item.notes;
      card.append(note);
    }
    return card;
  }
  async function refresh() {
    const request = ++generation;
    listing.replaceChildren();
    try {
      const user = await authorized();
      const records = await listFor(user.id);
      if (request !== generation) return;
      form.hidden = false;
      countLabel.textContent = records.length ? records.length + ' bem(ns) neste dispositivo' : 'Cadastrar tombos';
      status.textContent = records.length + ' registro(s) auxiliares nesta conta e neste dispositivo.';
      for (const item of records.sort((a,b) => b.createdAt.localeCompare(a.createdAt))) listing.append(render(item));
    } catch (error) {
      if (request !== generation) return;
      form.hidden = true;
      countLabel.textContent = 'Cadastrar tombos';
      status.textContent = error.message || String(error);
    }
  }
  async function open(mapId = '') {
    modal.hidden = false;
    form.hidden = true;
    document.body.classList.add('audit-open');
    const environment = mapId && AUDIT_DATA.getEnvironmentByMapId(mapId);
    envPicker.value = environment?.environmentId || '';
    status.textContent = 'Verificando permissão e registros locais…';
    await refresh();
  }
  for (const env of AUDIT_DATA.environments) {
    envPicker.add(new Option(env.blockName + ' · ' + (env.roomNumber ? 'Sala ' + env.roomNumber : env.name), env.environmentId));
  }
  button.addEventListener('click', () => open());
  window.addEventListener('campus:patrimony-open', event => open(event.detail?.mapId));
  modal.querySelectorAll('[data-asset-close]').forEach(element => element.addEventListener('click', close));
  document.getElementById('assetRefreshBtn').addEventListener('click', refresh);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.hidden) close(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    const room = envPicker.value;
    try {
      const user = await authorized();
      const fields = normalize(Object.fromEntries(new FormData(form).entries()));
      await save({ ...fields, ownerId:user.id, id:crypto.randomUUID(),
        createdAt:new Date().toISOString(), source:'INVENTARIO_AUXILIAR_LOCAL' });
      form.reset();
      envPicker.value = room;
      await refresh();
    } catch (error) { status.textContent = 'Não foi possível salvar: ' + (error.message || error); }
    finally { submit.disabled = false; }
  });
  window.addEventListener('audit:access-updated', event => {
    if (!event.detail?.authorized) { close(); countLabel.textContent = 'Cadastrar tombos'; }
    else if (!modal.hidden) refresh();
  });
  AUDIT_REMOTE.onAuthStateChange(() => {
    if (!modal.hidden) close();
    countLabel.textContent = 'Cadastrar tombos';
  });
  return Object.freeze({ normalize, open, refresh });
})();
globalThis.CAMPUS_PATRIMONY = CAMPUS_PATRIMONY;
