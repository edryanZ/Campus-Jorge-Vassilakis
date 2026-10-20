'use strict';

const AUDIT_APP = (() => {
  const modal = document.getElementById('auditModal');
  const content = document.getElementById('auditContent');
  const title = document.getElementById('auditTitle');
  const environmentLabel = document.getElementById('auditEnvironment');
  const saveState = document.getElementById('auditSaveState');
  let audit = null;
  let environment = null;
  let stepIndex = 0;
  let saveTimer = null;
  let previouslyFocusedElement = null;
  let isDirty = false;
  const openLocks = new Map();

  const uid = prefix => `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16)}`}`;
  const now = () => new Date().toISOString();
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

  function createAudit(target, owner) {
    const timestamp = now();
    return {
      schemaVersion: 2,
      auditId: uid('AUDIT'),
      environmentId: target.environmentId,
      status: AUDIT_DATA.STATUS.DRAFT,
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: null,
      completedAt: null,
      currentStep: 0,
      data: { identification: { date: timestamp.slice(0, 10), startTime: timestamp.slice(11, 16), inspector: '', responsible: '', notes: '' } },
      nonConformities: [],
      evidenceIds: [],
      ownerId: owner?.startsWith('LOCAL:') ? null : owner,
      localOwnerKey: owner?.startsWith('LOCAL:') ? owner : null,
      isPublic: false,
      serverRevision: 0,
      mutationId: uid('MUTATION'),
      syncState: AUDIT_REMOTE.configured ? 'PENDING' : 'LOCAL_ONLY',
      syncError: null,
      lastSyncedAt: null
    };
  }

  async function openAudit(mapId) {
    const target = AUDIT_DATA.getEnvironmentByMapId(mapId);
    if (!target) return;
    const owner = await AUDIT_REMOTE.ownerKey();
    const key = `${owner}::${target.environmentId}`;
    if (openLocks.has(key)) return openLocks.get(key);
    const task = openAuditLocked(target, owner).finally(() => openLocks.delete(key));
    openLocks.set(key, task);
    return task;
  }

  async function openAuditLocked(target, owner) {
    environment = target;
    let local = await AUDIT_STORAGE.findActive(environment.environmentId, owner);
    if (!local && !owner.startsWith('LOCAL:')) {
      local = await AUDIT_STORAGE.findActive(environment.environmentId, `LOCAL:${await AUDIT_STORAGE.getDeviceId()}`);
    }
    if (AUDIT_REMOTE.configured && navigator.onLine && !owner.startsWith('LOCAL:')) {
      const remote = await AUDIT_REMOTE.findRemoteActive(environment.environmentId);
      if (remote && local && remote.auditId !== local.auditId) {
        await AUDIT_REMOTE.preserveConflict(local, remote, 'ACTIVE_IDENTITY');
        saveState.textContent = '⚠ Conflito preservado: existe outro rascunho remoto para este ambiente.';
      } else if (remote && !local) {
        await AUDIT_STORAGE.saveAudit(remote, { allowRemoteMerge: true, enforceActiveUniqueness: true });
        local = remote;
      }
    }
    if (!local) {
      const proposed = createAudit(environment, owner);
      if (AUDIT_REMOTE.configured && navigator.onLine && !owner.startsWith('LOCAL:')) {
        try {
          const result = await AUDIT_REMOTE.resumeOrCreateActive(proposed);
          local = result.audit;
        } catch (error) {
          console.warn('[AuditRemote] Retomada remota indisponível; rascunho local preservado.', error);
          local = proposed;
          local.syncError = `Retomada remota pendente: ${error.message || 'falha de conexão'}`;
        }
      } else local = proposed;
      try {
        await AUDIT_STORAGE.saveAudit(local, { allowRemoteMerge: true, enforceActiveUniqueness: true });
      } catch (error) {
        if (error.code !== 'LOCAL_ACTIVE_CONFLICT') throw error;
        local = await AUDIT_STORAGE.getAudit(error.existingAuditId);
      }
    }
    audit = local;
    isDirty = false;
    stepIndex = Math.min(audit.currentStep || 0, AUDIT_DATA.STEPS.length - 1);
    if (audit.status === AUDIT_DATA.STATUS.DRAFT || !audit.startedAt) {
      audit.status = AUDIT_DATA.STATUS.IN_PROGRESS;
      audit.startedAt ||= now();
      markDirty();
    }
    openModal();
    renderStep();
    await saveNow({ scheduleRemote: false });
    if (AUDIT_REMOTE.configured && navigator.onLine && ['LOCAL_ONLY', 'PENDING', 'ERROR'].includes(audit.syncState)) {
      AUDIT_REMOTE.scheduleSync(audit);
    }
  }

  async function openHistory(mapId) {
    environment = AUDIT_DATA.getEnvironmentByMapId(mapId);
    if (!environment) return;
    if (AUDIT_REMOTE.configured && navigator.onLine) {
      try { await AUDIT_REMOTE.pullRemote(); } catch (error) { console.warn('[AuditRemote] Histórico remoto indisponível.', error); }
    }
    const allLocalItems = await AUDIT_STORAGE.listByEnvironment(environment.environmentId);
    const localItems = allLocalItems.filter(item => !AUDIT_SYNC_CORE.isRecoveryAudit(item));
    const recoveries = await AUDIT_STORAGE.listRecoveries(environment.environmentId);
    let publicItems = [];
    if (AUDIT_REMOTE.configured && navigator.onLine) {
      try { publicItems = await AUDIT_REMOTE.listPublic(environment.environmentId); }
      catch (error) { console.warn('[AuditRemote] Consulta pública indisponível.', error); }
    }
    const localIds = new Set(localItems.map(item => item.auditId));
    const items = [...localItems, ...publicItems.filter(item => !localIds.has(item.auditId))]
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const evidenceByAudit = new Map(await Promise.all(localItems.map(async item => [item.auditId, await AUDIT_STORAGE.evidenceSummary(item.auditId)])));
    audit = null;
    openModal();
    title.textContent = 'Histórico de auditorias';
    environmentLabel.textContent = `${environment.blockName} · ${environment.roomNumber ? `Sala ${environment.roomNumber}` : environment.name}`;
    content.innerHTML = items.length || recoveries.legacy.length || recoveries.conflicts.length ? `<div class="audit-history">${items.map(item => `
      <article><strong>${statusLabel(item.status)}</strong><span>${new Date(item.updatedAt).toLocaleString('pt-BR')}</span>
      <small class="sync-badge">${syncLabel(item.syncState)}</small>
      ${evidenceStatusMarkup(evidenceByAudit.get(item.auditId))}
      ${item.syncState === 'CONFLICT' ? '<small class="sync-badge">Revisão necessária: versões local e remota foram preservadas</small>' : ''}
      ${item.publicOnly ? '<small>Registro público sanitizado</small>' : ''}
      ${item.status !== AUDIT_DATA.STATUS.COMPLETED && !item.publicOnly ? `<button type="button" data-resume="${item.auditId}">Continuar auditoria</button>` : ''}</article>`).join('')}
      ${recoveries.legacy.map(item => `<article><strong>Cópia de recuperação preservada</strong><span>${new Date(item.updatedAt).toLocaleString('pt-BR')}</span><small class="sync-badge">Não é um rascunho ativo e não será sincronizada automaticamente</small></article>`).join('')}
      ${recoveries.conflicts.map(item => `<article><strong>Conflito aguardando resolução</strong><span>${new Date(item.createdAt).toLocaleString('pt-BR')}</span><small class="sync-badge">${escapeHtml(item.reason)} · ambas as versões e o manifesto de evidências foram preservados</small></article>`).join('')}</div>`
      : '<div class="audit-empty"><h3>Nenhuma auditoria registrada</h3><p>O histórico deste ambiente ainda está vazio.</p></div>';
    content.querySelectorAll('[data-resume]').forEach(button => button.addEventListener('click', async () => {
      const candidate = await AUDIT_STORAGE.getAudit(button.dataset.resume);
      if (!candidate || AUDIT_SYNC_CORE.isRecoveryAudit(candidate)) return;
      audit = candidate;
      isDirty = false;
      stepIndex = audit.currentStep || 0;
      renderStep();
    }));
  }

  async function showBlockEnvironments(item) {
    if (item.kind !== 'block') return;
    const panel = document.querySelector('.details-content');
    if (!panel) return;
    const section = document.createElement('section');
    section.className = 'block-environment-list';
    if (item.auditPending) {
      section.innerHTML = '<h3>Auditoria ambiental</h3><p>O levantamento do Bloco K ainda está incompleto. Nenhum ambiente foi habilitado para coleta nesta etapa.</p>';
    } else {
      const environments = AUDIT_DATA.environments.filter(environment => environment.blockId === item.id);
      const owner = await AUDIT_REMOTE.ownerKey();
      const rows = await Promise.all(environments.map(async target => {
        const records = (await AUDIT_STORAGE.listByEnvironment(target.environmentId)).filter(record => !AUDIT_SYNC_CORE.isRecoveryAudit(record));
        const active = await AUDIT_STORAGE.findActive(target.environmentId, owner);
        const last = records[0];
        return `<button type="button" data-map-id="${target.mapId}"><span>${target.roomNumber ? `Sala ${target.roomNumber} — ` : ''}${escapeHtml(target.name)}</span><small>${active ? 'Em andamento · continuar' : last ? `Última: ${statusLabel(last.status)}` : 'Não auditado'}</small></button>`;
      }));
      section.innerHTML = `<h3>Ambientes</h3>${rows.join('')}`;
      section.querySelectorAll('[data-map-id]').forEach(button => button.addEventListener('click', () => openAudit(button.dataset.mapId)));
    }
    panel.insertBefore(section, panel.querySelector('.details-actions'));
  }

  function openModal() {
    previouslyFocusedElement = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('audit-open');
    requestAnimationFrame(() => modal.querySelector('.audit-close')?.focus());
  }

  async function closeModal() {
    if (audit) {
      await saveNow({ scheduleRemote: false });
      if (AUDIT_REMOTE.configured && navigator.onLine) AUDIT_REMOTE.flushSync(audit.auditId).catch(error => console.warn('[AuditRemote]', error));
    }
    modal.hidden = true;
    document.body.classList.remove('audit-open');
    previouslyFocusedElement?.focus?.();
  }

  function renderStep() {
    const step = AUDIT_DATA.STEPS[stepIndex];
    title.textContent = step.title;
    environmentLabel.textContent = `${environment.blockName} · ${environment.roomNumber ? `Sala ${environment.roomNumber} — ` : ''}${environment.name}`;
    const progress = Math.round(((stepIndex + 1) / AUDIT_DATA.STEPS.length) * 100);
    content.innerHTML = `
      <div class="audit-progress"><div style="width:${progress}%"></div></div>
      <p class="audit-step-count">Etapa ${stepIndex + 1} de ${AUDIT_DATA.STEPS.length} · ${progress}%</p>
      <form id="auditForm" class="audit-form">${stepMarkup(step.id)}</form>
      <nav class="audit-nav">
        <button type="button" class="audit-secondary" data-prev ${stepIndex === 0 ? 'disabled' : ''}>Voltar</button>
        ${stepIndex === AUDIT_DATA.STEPS.length - 1
          ? '<button type="button" class="audit-primary" data-complete>Concluir auditoria</button>'
          : '<button type="button" class="audit-primary" data-next>Avançar</button>'}
      </nav>`;
    hydrateForm();
    const form = content.querySelector('#auditForm');
    form.addEventListener('input', captureForm);
    form.addEventListener('change', captureForm);
    content.querySelector('[data-prev]')?.addEventListener('click', () => navigate(-1));
    content.querySelector('[data-next]')?.addEventListener('click', () => navigate(1));
    content.querySelector('[data-complete]')?.addEventListener('click', completeAudit);
    content.querySelector('[data-add-nc]')?.addEventListener('click', addNonConformity);
    content.querySelector('[data-evidence]')?.addEventListener('change', storeEvidence);
    toggleConditionalFields();
  }

  function field(name, label, type = 'text', options = '') {
    if (type === 'select') return `<label><span>${label}</span><select name="${name}"><option value="">Selecione</option>${options}</select></label>`;
    if (type === 'textarea') return `<label class="full"><span>${label}</span><textarea name="${name}" rows="3"></textarea></label>`;
    return `<label><span>${label}</span><input name="${name}" type="${type}" /></label>`;
  }

  const yesNoNa = '<option>Sim</option><option>Não</option><option>N/A</option>';
  const conditionOptions = '<option>Adequado</option><option>Atenção</option><option>Não avaliado</option>';

  function stepMarkup(id) {
    const info = audit.data.identification || {};
    const sections = {
      identification: `<div class="audit-context"><strong>${escapeHtml(environment.environmentId)}</strong><span>${escapeHtml(environment.blockName)} · ${escapeHtml(environment.name)}</span></div>
        ${field('date', 'Data da auditoria', 'date')}${field('startTime', 'Hora de início', 'time')}${field('inspector', 'Auditor(a) responsável *')}${field('responsible', 'Responsável/acompanhante')}${field('sector', 'Setor')}${field('capacity', 'Capacidade do ambiente', 'number')}${field('notes', 'Observações de identificação', 'textarea')}`,
      lighting: `${field('total', 'Quantidade total de lâmpadas', 'number')}${field('led', 'LED', 'number')}${field('fluorescent', 'Fluorescentes', 'number')}${field('other', 'Outras', 'number')}${field('powerKnown', 'Potência conhecida?', 'select', yesNoNa)}${field('working', 'Em funcionamento', 'number')}${field('defective', 'Defeituosas', 'number')}${field('damagedFixtures', 'Luminárias danificadas', 'number')}${field('naturalLight', 'Iluminação natural', 'select', conditionOptions)}${field('notes', 'Observações', 'textarea')}`,
      airConditioning: `${field('hasAC', 'Há ar-condicionado?', 'select', yesNoNa)}<div data-conditional="hasAC:Sim">${field('units', 'Quantidade de unidades', 'number')}${field('details', 'Marca, modelo, tipo, BTU/h, potência, inverter/eficiência, estado, funcionamento e uso médio', 'textarea')}${field('issues', 'Gotejamento, ruído, sujeira ou defeitos observados', 'textarea')}</div>${field('notes', 'Observações', 'textarea')}`,
      equipment: `${['Computadores','Monitores','Impressoras','Projetores','TVs','Ventiladores','Bebedouros'].map(label => field(slugName(label), label, 'number')).join('')}${field('otherEquipment', 'Outros equipamentos: quantidade, potência, uso e estado', 'textarea')}${field('installedPower', 'Potência instalada estimada (W)', 'number')}${field('estimatedConsumption', 'Consumo energético estimado (kWh/mês)', 'number')}${field('calculationBasis', 'Fonte e memória do cálculo/estimativa', 'textarea')}${field('notes', 'Observações', 'textarea')}`,
      waterWaste: `${field('hasHydraulics', 'Há instalação hidráulica?', 'select', yesNoNa)}<div data-conditional="hasHydraulics:Sim">${field('hydraulicItems', 'Torneiras, pias, vasos, mictórios, chuveiros, bebedouros e outros', 'textarea')}${field('waterIssues', 'Vazamento, gotejamento, descarga, infiltração ou água parada', 'textarea')}</div>${field('bins', 'Lixeiras: quantidade, tipo, identificação e estado', 'textarea')}${field('separation', 'Há separação de resíduos?', 'select', yesNoNa)}${field('wasteTypes', 'Tipos observados e destinação conhecida', 'textarea')}${field('notes', 'Observações', 'textarea')}`,
      conditions: `${field('naturalLight', 'Iluminação natural', 'select', conditionOptions)}${field('ventilation', 'Ventilação', 'select', conditionOptions)}${field('thermalComfort', 'Conforto térmico (avaliação subjetiva)', 'select', conditionOptions)}${field('noise', 'Ruído (avaliação subjetiva)', 'select', conditionOptions)}${field('temperature', 'Temperatura medida (°C)', 'number')}${field('noiseDb', 'Ruído medido (dB)', 'number')}${field('lux', 'Iluminância medida (lux)', 'number')}${field('source', 'Fonte da informação', 'select', AUDIT_DATA.INFORMATION_SOURCES.map(v => `<option value="${v}">${v}</option>`).join(''))}${field('notes', 'Observações', 'textarea')}`,
      infrastructure: `${['Paredes','Teto','Piso','Portas','Janelas','Mobiliário','Conservação geral'].map(label => field(slugName(label), label, 'select', conditionOptions)).join('')}${field('problems', 'Infiltração, umidade, mofo aparente, trincas aparentes, danos ou materiais acumulados', 'textarea')}${field('accessibility', 'Observação preliminar de acessibilidade', 'textarea')}${field('notes', 'Observações', 'textarea')}`,
      nonConformities: `<div id="ncList">${renderNonConformities()}</div>
        ${field('ncCategory', 'Categoria', 'select', AUDIT_DATA.NON_CONFORMITY_CATEGORIES.map(value => `<option value="${value}">${value}</option>`).join(''))}
        ${field('ncPriority', 'Prioridade', 'select', AUDIT_DATA.PRIORITIES.map(value => `<option value="${value}">${value}</option>`).join(''))}
        ${field('ncDescription', 'Descrição', 'textarea')}${field('ncLocation', 'Localização específica')}
        ${field('ncRecommendation', 'Recomendação', 'textarea')}${field('ncDeadline', 'Prazo sugerido', 'date')}
        <button class="audit-add" type="button" data-add-nc>+ Registrar não conformidade</button>
        <label class="full"><span>Adicionar evidência (arquivo ou câmera)</span><input data-evidence type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" /></label><p class="audit-note">A evidência é salva primeiro neste dispositivo e enviada ao armazenamento privado somente após confirmação do Supabase.</p>`,
      review: `<div class="audit-review"><h3>Revise antes de concluir</h3><p><strong>Ambiente:</strong> ${escapeHtml(environment.environmentId)}</p><p><strong>Auditor(a):</strong> ${escapeHtml(info.inspector || 'Não informado')}</p><p><strong>Não conformidades:</strong> ${audit.nonConformities.length}</p><p><strong>Evidências:</strong> ${audit.evidenceIds.length}</p><p>A conclusão preserva este registro no histórico. Não há classificação automática nesta etapa.</p></div>${field('conclusion', 'Conclusão geral', 'textarea')}`
    };
    return sections[id];
  }

  function slugName(value) { return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_'); }

  function captureForm() {
    const stepId = AUDIT_DATA.STEPS[stepIndex].id;
    const form = content.querySelector('#auditForm');
    const values = Object.fromEntries(new FormData(form).entries());
    audit.data[stepId] = { ...(audit.data[stepId] || {}), ...values };
    markDirty();
    toggleConditionalFields();
    scheduleSave();
  }

  function hydrateForm() {
    const values = audit.data[AUDIT_DATA.STEPS[stepIndex].id] || {};
    Object.entries(values).forEach(([name, value]) => {
      const element = content.querySelector(`[name="${CSS.escape(name)}"]`);
      if (element) element.value = value;
    });
  }

  function toggleConditionalFields() {
    content.querySelectorAll('[data-conditional]').forEach(section => {
      const [name, expected] = section.dataset.conditional.split(':');
      section.hidden = content.querySelector(`[name="${name}"]`)?.value !== expected;
    });
  }

  function navigate(delta) {
    captureForm();
    stepIndex = Math.max(0, Math.min(AUDIT_DATA.STEPS.length - 1, stepIndex + delta));
    audit.currentStep = stepIndex;
    scheduleSave(true);
    renderStep();
  }

  function renderNonConformities() {
    if (!audit.nonConformities.length) return '<p class="audit-note">Nenhuma não conformidade registrada.</p>';
    return audit.nonConformities.map((item, index) => `<article class="nc-card"><strong>Não conformidade ${index + 1}</strong><span>${escapeHtml(item.category)} · ${escapeHtml(item.priority)}</span><p>${escapeHtml(item.description || 'Sem descrição')}</p></article>`).join('');
  }

  function addNonConformity() {
    const category = content.querySelector('[name="ncCategory"]')?.value;
    if (!AUDIT_DATA.NON_CONFORMITY_CATEGORIES.includes(category)) return;
    const description = content.querySelector('[name="ncDescription"]')?.value.trim() || '';
    const priority = content.querySelector('[name="ncPriority"]')?.value;
    if (!AUDIT_DATA.PRIORITIES.includes(priority)) return;
    audit.nonConformities.push({
      nonConformityId: uid('NC'), category, description,
      location: content.querySelector('[name="ncLocation"]')?.value.trim() || '',
      recommendation: content.querySelector('[name="ncRecommendation"]')?.value.trim() || '',
      priority,
      suggestedDeadline: content.querySelector('[name="ncDeadline"]')?.value || '',
      status: 'OPEN', evidenceIds: []
    });
    scheduleSave(true);
    renderStep();
  }

  async function storeEvidence(event) {
    const file = event.target.files[0];
    if (!file) return;
    const evidenceId = uid('EVIDENCE');
    if (file.size > 10 * 1024 * 1024) {
      alert('A evidência excede o limite de 10 MB. Reduza a imagem antes de anexar.');
      event.target.value = '';
      return;
    }
    await AUDIT_STORAGE.saveEvidence({
      evidenceId, auditId: audit.auditId, nonConformityId: null,
      description: file.name, mimeType: file.type, size: file.size,
      createdAt: now(), blob: file, syncState: AUDIT_REMOTE.configured ? 'PENDING' : 'LOCAL_ONLY', syncError: null
    });
    audit.evidenceIds.push(evidenceId);
    markDirty();
    scheduleSave(true);
    saveState.textContent = '✓ Evidência salva neste dispositivo';
  }

  function scheduleSave(immediate = false) {
    clearTimeout(saveTimer);
    saveState.textContent = 'Salvando…';
    if (immediate) return saveNow();
    saveTimer = setTimeout(saveNow, 350);
  }

  async function saveNow({ scheduleRemote = true } = {}) {
    if (!audit || audit.status === AUDIT_DATA.STATUS.COMPLETED) return;
    if (!isDirty) return { skipped: true };
    audit.updatedAt = now();
    audit.currentStep = stepIndex;
    await AUDIT_STORAGE.saveAudit(audit, { enforceActiveUniqueness: true });
    isDirty = false;
    saveState.textContent = AUDIT_REMOTE.configured
      ? (navigator.onLine ? '✓ Salvo localmente · aguardando sincronização' : '✓ Salvo localmente · aguardando internet')
      : '✓ Salvo localmente · Supabase não configurado';
    if (scheduleRemote && AUDIT_REMOTE.configured && navigator.onLine) {
      const scheduledAuditId = audit.auditId;
      AUDIT_REMOTE.scheduleSync(audit).then(result => {
        if (result?.synced && audit?.auditId === result.audit.auditId) {
          audit = result.audit;
          saveState.textContent = `✓ Sincronizado com o Supabase · ${new Date(audit.lastSyncedAt).toLocaleTimeString('pt-BR')}`;
        } else if (result?.evidence && audit?.auditId === result.audit.auditId) {
          saveState.textContent = `⚠ Dados salvos · evidências: ${result.evidence.synced} sincronizada(s), ${result.evidence.pending} pendente(s), ${result.evidence.errors} com erro`;
        } else if (result?.error && audit?.auditId === scheduledAuditId) {
          saveState.textContent = `⚠ Salvo localmente · erro de sincronização: ${result.error.message || 'tente novamente'}`;
        }
      });
    }
  }

  async function completeAudit() {
    captureForm();
    if (!audit.data.identification?.inspector?.trim()) {
      alert('Informe o nome do(a) auditor(a) na etapa de identificação antes de concluir.');
      stepIndex = 0;
      renderStep();
      return;
    }
    audit.status = AUDIT_DATA.STATUS.COMPLETED;
    audit.completedAt = now();
    audit.updatedAt = audit.completedAt;
    markDirty();
    await AUDIT_STORAGE.saveAudit(audit);
    isDirty = false;
    saveState.textContent = '✓ Auditoria concluída e salva localmente · aguardando sincronização';
    let remoteMessage = 'O registro permanece neste dispositivo até que a sincronização seja confirmada.';
    if (AUDIT_REMOTE.configured && navigator.onLine) {
      try {
        const result = await AUDIT_REMOTE.syncAudit(audit);
        if (result.synced) {
          audit = result.audit;
          saveState.textContent = '✓ Auditoria concluída e sincronizada com o Supabase';
          remoteMessage = 'O Supabase confirmou o registro. A auditoria poderá ser recuperada em outro dispositivo autorizado.';
        } else if (result.evidence) {
          audit = result.audit;
          saveState.textContent = `⚠ Concluída e salva · ${result.evidence.pending} fotografia(s) pendente(s), ${result.evidence.errors} com erro`;
          remoteMessage = 'Os dados foram preservados, mas a auditoria não está completamente sincronizada enquanto houver evidências pendentes.';
        }
      } catch (error) {
        saveState.textContent = `⚠ Concluída e salva localmente · erro de sincronização: ${error.message || 'tente novamente'}`;
      }
    }
    content.innerHTML = `<div class="audit-empty"><h3>Auditoria concluída</h3><p>O registro não substitui auditorias anteriores. ${escapeHtml(remoteMessage)}</p><button class="audit-primary" type="button" data-done>Fechar</button></div>`;
    content.querySelector('[data-done]').addEventListener('click', closeModal);
  }

  function statusLabel(status) { return ({ DRAFT: 'Rascunho', IN_PROGRESS: 'Em andamento', COMPLETED: 'Concluída' })[status] || status; }

  function syncLabel(state) {
    return ({
      SYNCED: '✓ Sincronizado', PENDING: 'Aguardando sincronização', ERROR: 'Erro de sincronização',
      CONFLICT: 'Conflito preservado', LOCAL_ONLY: 'Somente neste dispositivo'
    })[state] || 'Somente neste dispositivo';
  }

  function evidenceStatusMarkup(summary) {
    if (!summary?.total) return '<small>Sem fotografias</small>';
    if (summary.errors) return `<small class="sync-badge">${summary.errors} fotografia(s) com erro · ${summary.pending} pendente(s)</small>`;
    if (summary.pending) return `<small class="sync-badge">${summary.pending} fotografia(s) pendente(s)</small>`;
    return `<small class="sync-badge">✓ ${summary.synced} fotografia(s) confirmada(s)</small>`;
  }

  function markDirty() {
    isDirty = true;
    audit.mutationId = uid('MUTATION');
    audit.syncState = AUDIT_REMOTE.configured ? 'PENDING' : 'LOCAL_ONLY';
    audit.syncError = null;
  }

  const authModal = document.getElementById('authModal');
  const authButton = document.getElementById('authBtn');
  const authForm = document.getElementById('authForm');
  const authStatus = document.getElementById('authStatus');
  const signOutButton = document.getElementById('signOutBtn');
  const syncNowButton = document.getElementById('syncNowBtn');

  function setAuthState(user, message = '') {
    const authenticated = Boolean(user);
    authButton.textContent = authenticated ? 'Conta e sincronização' : 'Entrar';
    authForm.hidden = authenticated || !AUDIT_REMOTE.configured;
    signOutButton.hidden = !authenticated;
    syncNowButton.hidden = !authenticated;
    authStatus.className = `auth-status ${authenticated ? 'is-success' : (!AUDIT_REMOTE.configured ? 'is-error' : '')}`;
    authStatus.textContent = message || (authenticated
      ? `Conectado como ${user.email}. Registros pendentes serão sincronizados.`
      : AUDIT_REMOTE.configured
        ? 'Entre com uma conta autorizada para recuperar e sincronizar auditorias.'
        : 'Supabase não configurado. O modo local continua disponível.');
  }

  function openAuthModal() {
    authModal.hidden = false;
    requestAnimationFrame(() => authModal.querySelector('input:not([hidden]), button')?.focus());
  }

  function closeAuthModal() { authModal.hidden = true; authButton.focus(); }

  authButton.addEventListener('click', openAuthModal);
  authModal.querySelectorAll('[data-auth-close]').forEach(element => element.addEventListener('click', closeAuthModal));
  authForm.addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(authForm);
    authStatus.className = 'auth-status';
    authStatus.textContent = 'Autenticando…';
    try {
      const user = await AUDIT_REMOTE.signIn(values.get('email'), values.get('password'));
      authForm.reset();
      setAuthState(user, `Conectado como ${user.email}. Sincronização iniciada.`);
    } catch (error) {
      authStatus.className = 'auth-status is-error';
      authStatus.textContent = `Não foi possível entrar: ${error.message || 'verifique os dados e a configuração.'}`;
    }
  });
  signOutButton.addEventListener('click', async () => {
    try { await AUDIT_REMOTE.signOut(); setAuthState(null, 'Sessão encerrada. Os dados locais foram preservados.'); }
    catch (error) { setAuthState(null, `Falha ao sair: ${error.message}`); }
  });
  syncNowButton.addEventListener('click', async () => {
    authStatus.className = 'auth-status';
    authStatus.textContent = 'Sincronizando registros pendentes…';
    try {
      const result = await AUDIT_REMOTE.syncPending();
      authStatus.className = result.failed ? 'auth-status is-error' : 'auth-status is-success';
      authStatus.textContent = result.skipped
        ? 'Nada foi enviado. Verifique a conexão e a autenticação.'
        : `${result.synced} registro(s) sincronizado(s); ${result.failed} falha(s); ${result.pendingEvidence || 0} evidência(s) pendente(s).`;
    } catch (error) {
      authStatus.className = 'auth-status is-error';
      authStatus.textContent = `Falha na sincronização: ${error.message}`;
    }
  });
  AUDIT_REMOTE.onAuthStateChange((_event, user) => setAuthState(user));

  // v16: central de consulta, sem regravar auditorias nem iniciar sincronizacao automatica.
  const centerModal = document.getElementById('auditCenterModal');
  const centerButton = document.getElementById('auditCenterBtn');
  const centerSearch = document.getElementById('auditCenterSearch');
  const centerFilter = document.getElementById('auditCenterFilter');
  const centerResults = document.getElementById('auditCenterResults');
  const centerSummary = document.getElementById('auditCenterSummary');
  let centerRecords = [];
  let centerFocus = null;

  function centerStatus(item) {
    return item.status === 'COMPLETED' ? 'Concluída' : item.status === 'IN_PROGRESS' ? 'Em andamento' : 'Rascunho';
  }

  function renderCenter() {
    const query = centerSearch.value.trim().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
    const filter = centerFilter.value;
    const rows = centerRecords.filter(item => {
      const env = AUDIT_DATA.getEnvironment(item.environmentId);
      const searchable = [env?.name, env?.blockName, env?.roomNumber, item.environmentId, item.auditId].join(' ')
        .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
      if (query && !searchable.includes(query)) return false;
      if (filter === 'COMPLETED' && item.status !== 'COMPLETED') return false;
      if (filter === 'ACTIVE' && item.status === 'COMPLETED') return false;
      if (filter === 'PENDING' && !['LOCAL_ONLY', 'PENDING', 'ERROR', 'CONFLICT'].includes(item.syncState)) return false;
      return true;
    });
    centerSummary.textContent = `${rows.length} de ${centerRecords.length} auditoria(s) disponível(is) neste dispositivo`;
    centerResults.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'audit-center-empty';
      empty.textContent = 'Nenhuma auditoria encontrada para estes filtros.';
      centerResults.append(empty);
      return;
    }
    for (const item of rows) {
      const env = AUDIT_DATA.getEnvironment(item.environmentId);
      const card = document.createElement('article');
      card.className = 'audit-center-card';
      const heading = document.createElement('strong');
      heading.textContent = env ? `${env.blockName} · ${env.roomNumber ? 'Sala ' + env.roomNumber + ' — ' : ''}${env.name}` : item.environmentId;
      const info = document.createElement('p');
      info.textContent = `${centerStatus(item)} · ${item.syncState === 'SYNCED' ? 'Sincronizada' : item.syncState === 'CONFLICT' ? 'Conflito preservado' : 'Local / pendente'} · ${item.updatedAt ? new Date(item.updatedAt).toLocaleString('pt-BR') : 'Sem data'}`;
      const action = document.createElement('button');
      action.type = 'button';
      action.textContent = 'Ver histórico';
      action.disabled = !env?.mapId;
      action.addEventListener('click', async () => {
        centerModal.hidden = true;
        try { await openHistory(env.mapId); }
        catch (error) { console.error('[AuditCenter]', error); centerModal.hidden = false; }
      });
      card.append(heading, info, action);
      centerResults.append(card);
    }
  }

  async function openCenter() {
    centerFocus = document.activeElement;
    centerModal.hidden = false;
    document.body.classList.add('audit-open');
    centerSummary.textContent = 'Carregando registros locais…';
    centerResults.replaceChildren();
    try {
      const owner = await AUDIT_REMOTE.ownerKey();
      const all = await AUDIT_STORAGE.listAudits();
      centerRecords = all.filter(item => {
        if (AUDIT_SYNC_CORE.isRecoveryAudit(item)) return false;
        const recordOwner = AUDIT_SYNC_CORE.ownerKey(item);
        return !recordOwner || recordOwner === owner ||
          (recordOwner.startsWith('LOCAL:') && item.ownerId == null);
      }).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      renderCenter();
    } catch (error) {
      centerSummary.textContent = 'Não foi possível carregar as auditorias locais.';
      console.error('[AuditCenter]', error);
    }
    centerSearch.focus();
  }

  function closeCenter() {
    centerModal.hidden = true;
    if (modal.hidden && authModal.hidden) document.body.classList.remove('audit-open');
    centerFocus?.focus();
  }

  centerButton.addEventListener('click', openCenter);
  centerModal.querySelectorAll('[data-center-close]').forEach(button => button.addEventListener('click', closeCenter));
  centerSearch.addEventListener('input', renderCenter);
  centerFilter.addEventListener('change', renderCenter);
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !centerModal.hidden) {
      event.preventDefault();
      closeCenter();
    }
  });

  window.addEventListener('audit:start', event => openAudit(event.detail.mapId));
  window.addEventListener('audit:history', event => openHistory(event.detail.mapId));
  window.addEventListener('campus:location-selected', event => showBlockEnvironments(event.detail.item));
  modal.querySelectorAll('[data-audit-close]').forEach(element => element.addEventListener('click', closeModal));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.hidden) {
      event.preventDefault();
      closeModal();
    }
  });
  window.addEventListener('online', () => { if (!modal.hidden) saveState.textContent = 'Conexão restabelecida · sincronização será tentada'; });
  window.addEventListener('offline', () => { if (!modal.hidden) saveState.textContent = 'Modo offline · dados permanecem salvos neste dispositivo'; });
  AUDIT_STORAGE.openDatabase().catch(error => console.error('[AuditStorage]', error));

  return Object.freeze({ openAudit, openHistory });
})();

globalThis.AUDIT_APP = AUDIT_APP;
