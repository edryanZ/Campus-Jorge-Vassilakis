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
  let editGeneration = 0;
  let editorUserId = null;
  let localSaveQueue = Promise.resolve();
  let evidenceWriteActive = false;
  let evidenceSaveFinished = Promise.resolve();
  const openLocks = new Map();

  const uid = prefix => `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16)}`}`;
  const now = () => new Date().toISOString();
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

  function createAudit(target, owner) {
    const timestamp = now();
    // O ISO é UTC; campos de data/hora da coleta usam o relógio local
    // do dispositivo para evitar registrar o dia seguinte à noite.
    const clock = new Date();
    const pad = value => String(value).padStart(2, '0');
    const localDate = `${clock.getFullYear()}-${pad(clock.getMonth() + 1)}-${pad(clock.getDate())}`;
    const localTime = `${pad(clock.getHours())}:${pad(clock.getMinutes())}`;
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
      data: { identification: { date: localDate, startTime: localTime, inspector: '', responsible: '', notes: '' } },
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
    let access;
    try { access = await AUDIT_REMOTE.getAccess(); }
    catch (error) { console.warn('[AuditAccess] Falha ao validar autorização:', error); }
    if (!access?.canAudit) {
      openAuthModal();
      authStatus.className = 'auth-status';
      authStatus.textContent = access?.reviewStatus === 'REJECTED'
        ? 'Seu acesso de auditor foi recusado ou revogado. Consulte apenas resultados publicados.'
        : 'Para criar ou continuar uma auditoria, entre com uma conta aprovada pelo administrador.';
      return;
    }
    const owner = await AUDIT_REMOTE.ownerKey();
    const key = `${owner}::${target.environmentId}`;
    if (openLocks.has(key)) return openLocks.get(key);
    const task = openAuditLocked(target, owner).finally(() => openLocks.delete(key));
    openLocks.set(key, task);
    return task;
  }

  async function openSharedAudit(auditId) {
    const access = await AUDIT_REMOTE.getAccess();
    if (!access?.canAudit || access.offline || !navigator.onLine) {
      window.alert('A participação compartilhada exige conexão e autorização atualizada.');
      return;
    }
    // Só retorna o payload completo depois da aprovação verificada no servidor.
    const remote = await AUDIT_REMOTE.getSharedAudit(auditId);
    if (!remote.collaborationEditorId) {
      const target = AUDIT_DATA.getEnvironment(remote.environmentId);
      if (target?.mapId) return openAudit(target.mapId);
      throw new Error('Ambiente não encontrado no mapa.');
    }
    const existing = await AUDIT_STORAGE.getAudit(auditId);
    // PENDING também pode significar evidência remota ainda não confirmada.
    // Só impedir a abertura quando houver edição local distinta da revisão remota.
    const hasLocalEdit = existing && ['LOCAL_ONLY', 'PENDING', 'ERROR', 'CONFLICT'].includes(existing.syncState) &&
      (existing.syncError || existing.syncState === 'LOCAL_ONLY' ||
       existing.syncState === 'CONFLICT' || existing.mutationId !== remote.mutationId);
    if (hasLocalEdit) {
      window.alert('Existe uma cópia local com alterações pendentes ou em conflito neste dispositivo. Ela foi preservada. Resolva a sincronização antes de abrir a versão compartilhada.');
      return;
    }
    environment = AUDIT_DATA.getEnvironment(remote.environmentId);
    if (!environment) throw new Error('Ambiente da auditoria não encontrado no mapa.');
    await AUDIT_STORAGE.saveAudit(remote, { allowRemoteMerge: true, enforceActiveUniqueness: true });
    audit = remote;
    editorUserId = await AUDIT_REMOTE.ownerKey();
    isDirty = false;
    stepIndex = Math.min(audit.currentStep || 0, AUDIT_DATA.STEPS.length - 1);
    openModal();
    renderStep();
    saveState.textContent = 'Participação autorizada · dados compartilhados · edição online';
  }

  async function openAuditLocked(target, owner) {
    environment = target;
    let local = await AUDIT_STORAGE.findActive(environment.environmentId, owner);
    if (local?.collaborationEditorId && local.collaborationEditorId !== owner) {
      if (['LOCAL_ONLY','PENDING','ERROR','CONFLICT'].includes(local.syncState)) {
        window.alert('Existe uma edição compartilhada pendente neste dispositivo. O rascunho foi preservado e não será assumido por outra conta.');
        return;
      }
      local = null; // O proprietário buscará seu próprio registro remoto atualizado.
    }
    if (!local && !owner.startsWith('LOCAL:')) {
      local = await AUDIT_STORAGE.findActive(environment.environmentId, `LOCAL:${await AUDIT_STORAGE.getDeviceId()}`);
    }
    let ownedRemote = null;
    if (AUDIT_REMOTE.configured && navigator.onLine && !owner.startsWith('LOCAL:')) {
      ownedRemote = await AUDIT_REMOTE.findRemoteActive(environment.environmentId);
      if (ownedRemote && local && ownedRemote.auditId !== local.auditId) {
        await AUDIT_REMOTE.preserveConflict(local, ownedRemote, 'ACTIVE_IDENTITY');
        window.alert('Existe um rascunho remoto diferente para esta sala. O conflito foi preservado e nenhuma cópia será sobrescrita.');
        return;
      } else if (ownedRemote && !local) {
        await AUDIT_STORAGE.saveAudit(ownedRemote, { allowRemoteMerge: true, enforceActiveUniqueness: true });
        local = ownedRemote;
      }
    }
    if (AUDIT_REMOTE.configured && navigator.onLine && !owner.startsWith('LOCAL:')) {
      // Mesmo que haja rascunho local legado, a sala ocupada por outra
      // conta nunca pode ser assumida ou sincronizada automaticamente.
      // Não oferecer criação local quando há auditoria ativa de outro usuário.
      let occupancy;
      try {
        occupancy = await AUDIT_REMOTE.listActiveOccupancy();
      } catch (error) {
        window.alert('Não foi possível verificar se já existe uma auditoria ativa nesta sala. Por segurança, tente novamente quando a consulta estiver disponível.');
        return;
      }
      const occupied = occupancy.find(item => item.environment_id === environment.environmentId);
      if (occupied && ownedRemote?.auditId !== occupied.audit_id &&
          !(local?.auditId === occupied.audit_id && local.ownerId === owner)) {
        const requests = await AUDIT_REMOTE.listMyParticipation();
        const status = requests.find(item => item.audit_id === occupied.audit_id)?.status;
        if (status === 'APPROVED') return openSharedAudit(occupied.audit_id);
        if (status === 'PENDING') {
          window.alert('A auditoria desta sala está sob responsabilidade de ' +
            (occupied.responsible_name || 'outro auditor') + '. Sua participação aguarda aprovação do administrador.');
          return;
        }
        if (window.confirm('Esta sala já está sendo auditada por ' +
          (occupied.responsible_name || 'outro auditor') +
          '. Deseja solicitar ao administrador autorização para participar da auditoria existente?')) {
          await AUDIT_REMOTE.requestAuditParticipation(occupied.audit_id);
          window.alert('Solicitação enviada. Você poderá continuar a auditoria após aprovação do administrador.');
        }
        return;
      }
    }
    if (local && !local.ownerId && !owner.startsWith('LOCAL:')) {
      const accepted = window.confirm(
        'Existe uma auditoria antiga neste dispositivo sem conta vinculada. Deseja assumir este rascunho na sua conta? ' +
        'Se escolher Cancelar, ele ficará preservado e não será enviado ao Supabase.'
      );
      if (!accepted) return;
      await AUDIT_REMOTE.approveLegacyAdoption(local);
    }
    if (!local) {
      // Não iniciar rascunho novo offline sem conferir a ocupação global.
      // Uma auditoria já existente no dispositivo continua acessível offline.
      if (AUDIT_REMOTE.configured && !navigator.onLine) {
        window.alert('Para iniciar uma nova auditoria, conecte-se à internet para verificar se o ambiente já está sendo auditado. Auditorias existentes neste dispositivo continuam preservadas.');
        return;
      }
      const proposed = createAudit(environment, owner);
      if (AUDIT_REMOTE.configured && navigator.onLine && !owner.startsWith('LOCAL:')) {
        try {
          const result = await AUDIT_REMOTE.resumeOrCreateActive(proposed);
          local = result.audit;
        } catch (error) {
          // Sem confirmação remota, não criar um novo rascunho ativo:
          // outro auditor pode ter ocupado a sala entre a consulta e o RPC.
          console.warn('[AuditRemote] Criação não confirmada; ambiente protegido contra duplicidade.', error);
          window.alert('Não foi possível confirmar a criação da auditoria no servidor. Nenhum novo rascunho foi criado. Atualize e tente novamente.');
          return;
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
    editorUserId = owner;
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
    let access = null;
    try { access = await AUDIT_REMOTE.getAccess(); }
    catch (error) { console.warn('[AuditAccess] Histórico privado indisponível:', error); }
    if (access?.canAudit && AUDIT_REMOTE.configured && navigator.onLine) {
      try { await AUDIT_REMOTE.pullRemote(); } catch (error) { console.warn('[AuditRemote] Histórico remoto indisponível.', error); }
    }
    const owner = access?.canAudit ? await AUDIT_REMOTE.ownerKey() : null;
    const deviceKey = owner ? `LOCAL:${await AUDIT_STORAGE.getDeviceId()}` : null;
    const allLocalItems = access?.canAudit ? await AUDIT_STORAGE.listByEnvironment(environment.environmentId) : [];
    const localItems = allLocalItems.filter(item =>
      !AUDIT_SYNC_CORE.isRecoveryAudit(item) &&
      (access.admin || AUDIT_SYNC_CORE.ownerKey(item) === owner ||
       (AUDIT_SYNC_CORE.ownerKey(item) === deviceKey && item.ownerId == null)));
    const recoveries = access?.admin
      ? await AUDIT_STORAGE.listRecoveries(environment.environmentId)
      : { legacy: [], conflicts: [] };
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
    editorUserId = null;
    openModal();
    title.textContent = 'Histórico de auditorias';
    environmentLabel.textContent = `${environment.blockName} · ${environment.roomNumber ? `Sala ${environment.roomNumber}` : environment.name}`;
    content.innerHTML = items.length || recoveries.legacy.length || recoveries.conflicts.length ? `<div class="audit-history">${items.map(item => `
      <article><strong>${statusLabel(item.status)}</strong><span>${new Date(item.updatedAt).toLocaleString('pt-BR')}</span>
      <small class="sync-badge">${syncLabel(item.syncState)}</small>
      ${evidenceStatusMarkup(evidenceByAudit.get(item.auditId))}
      ${item.syncState === 'CONFLICT' ? '<small class="sync-badge">Revisão necessária: versões local e remota foram preservadas</small>' : ''}
      ${item.publicOnly || item.isPublic ? `<button type="button" data-public-id="${escapeHtml(item.auditId)}">Ver resultados públicos</button>` : ''}
      ${item.status !== AUDIT_DATA.STATUS.COMPLETED && !item.publicOnly &&
        (AUDIT_SYNC_CORE.ownerKey(item) === owner || AUDIT_SYNC_CORE.ownerKey(item) === deviceKey)
          ? `<button type="button" data-resume="${escapeHtml(item.auditId)}">Continuar auditoria</button>` : ''}</article>`).join('')}
      ${recoveries.legacy.map(item => `<article><strong>Cópia de recuperação preservada</strong><span>${new Date(item.updatedAt).toLocaleString('pt-BR')}</span><small class="sync-badge">Não é um rascunho ativo e não será sincronizada automaticamente</small></article>`).join('')}
      ${recoveries.conflicts.map(item => `<article><strong>Conflito aguardando resolução</strong><span>${new Date(item.createdAt).toLocaleString('pt-BR')}</span><small class="sync-badge">${escapeHtml(item.reason)} · ambas as versões e o manifesto de evidências foram preservados</small></article>`).join('')}</div>`
      : '<div class="audit-empty"><h3>Nenhuma auditoria registrada</h3><p>O histórico deste ambiente ainda está vazio.</p></div>';
    content.querySelectorAll('[data-public-id]').forEach(button =>
      button.addEventListener('click', () => showPublicAudit(button.dataset.publicId)));
    content.querySelectorAll('[data-resume]').forEach(button => button.addEventListener('click', async () => {
      if (!(await AUDIT_REMOTE.getAccess())?.canAudit) return;
      const candidate = await AUDIT_STORAGE.getAudit(button.dataset.resume);
      if (!candidate || AUDIT_SYNC_CORE.isRecoveryAudit(candidate)) return;
      const ownerKey = AUDIT_SYNC_CORE.ownerKey(candidate);
      if (ownerKey !== (await AUDIT_REMOTE.ownerKey()) &&
          ownerKey !== `LOCAL:${await AUDIT_STORAGE.getDeviceId()}` && ownerKey !== null) return;
      if (!candidate.ownerId) {
        const accepted = window.confirm(
          'Este é um rascunho antigo sem conta vinculada. Deseja recuperá-lo na sua conta? ' +
          'Se cancelar, o registro será preservado sem sincronização.'
        );
        if (!accepted) return;
        await AUDIT_REMOTE.approveLegacyAdoption(candidate);
      }
      audit = candidate;
      editorUserId = await AUDIT_REMOTE.ownerKey();
      isDirty = false;
      stepIndex = audit.currentStep || 0;
      renderStep();
    }));
  }

  async function showPublicAudit(auditId) {
    if (typeof centerModal !== 'undefined') centerModal.hidden = true;
    audit = null;
    editorUserId = null;
    openModal();
    title.textContent = 'Resultado público da auditoria';
    environmentLabel.textContent = 'Consultando resultado aprovado…';
    content.replaceChildren();
    const notice = document.createElement('p');
    notice.className = 'audit-note';
    notice.textContent = 'Carregando os dados públicos autorizados…';
    content.append(notice);
    try {
      const result = await AUDIT_REMOTE.getPublishedAudit(auditId);
      const target = AUDIT_DATA.getEnvironment(result.environmentId);
      environmentLabel.textContent = target
        ? `${target.blockName} · ${target.roomNumber ? 'Sala ' + target.roomNumber + ' · ' : ''}${target.name}`
        : result.environmentId;
      content.replaceChildren();
      const introduction = document.createElement('p');
      introduction.className = 'audit-note';
      introduction.textContent = 'Consulta pública, somente leitura. Dados pessoais, observações internas e fotografias privadas não são disponibilizados.';
      content.append(introduction);
      const completion = document.createElement('p');
      completion.textContent = `Auditoria concluída${result.completedAt ? ' em ' + new Date(result.completedAt).toLocaleDateString('pt-BR') : ''} · Não conformidades registradas: ${Number(result.summary?.nonConformityCount || 0)}`;
      content.append(completion);
      const groups = {
        lighting: ['Iluminação', { total: 'Total de lâmpadas', led: 'Lâmpadas LED',
          fluorescent: 'Lâmpadas fluorescentes', other: 'Outras lâmpadas',
          working: 'Em funcionamento', defective: 'Defeituosas',
          damagedFixtures: 'Luminárias danificadas', naturalLight: 'Luz natural' }],
        airConditioning: ['Ar-condicionado', { hasAC: 'Possui ar-condicionado', units: 'Unidades' }],
        equipment: ['Equipamentos e consumo', { computadores: 'Computadores', monitores: 'Monitores',
          impressoras: 'Impressoras', projetores: 'Projetores', tvs: 'Televisores',
          ventiladores: 'Ventiladores', bebedouros: 'Bebedouros',
          installedPower: 'Potência instalada', estimatedConsumption: 'Consumo estimado' }],
        waterWaste: ['Água e resíduos', { hasHydraulics: 'Instalação hidráulica', separation: 'Separação de resíduos' }],
        infrastructure: ['Infraestrutura', { paredes: 'Paredes', teto: 'Teto', piso: 'Piso',
          portas: 'Portas', janelas: 'Janelas', mobiliario: 'Mobiliário',
          conservacao_geral: 'Conservação geral' }],
        conditions: ['Condições ambientais', { naturalLight: 'Iluminação natural',
          ventilation: 'Ventilação', thermalComfort: 'Conforto térmico',
          noise: 'Ruído', temperature: 'Temperatura (°C)', noiseDb: 'Ruído (dB)',
          lux: 'Iluminância (lux)', source: 'Fonte dos dados' }]
      };
      let found = false;
      for (const [key, [label, fields]] of Object.entries(groups)) {
        const values = result.data?.[key];
        if (!values || typeof values !== 'object') continue;
        const present = Object.entries(fields).filter(([field]) =>
          values[field] !== undefined && values[field] !== null && values[field] !== '');
        if (!present.length) continue;
        found = true;
        const section = document.createElement('section');
        section.className = 'public-audit-section';
        const heading = document.createElement('h3');
        heading.textContent = label;
        section.append(heading);
        const list = document.createElement('dl');
        for (const [field, fieldLabel] of present) {
          const row = document.createElement('div');
          row.className = 'public-audit-field';
          const dt = document.createElement('dt');
          dt.textContent = fieldLabel;
          const dd = document.createElement('dd');
          const value = values[field];
          dd.textContent = typeof value === 'boolean' ? (value ? 'Sim' : 'Não')
            : typeof value === 'object' ? JSON.stringify(value) : String(value);
          row.append(dt, dd);
          list.append(row);
        }
        section.append(list);
        content.append(section);
      }
      if (!found) {
        const empty = document.createElement('p');
        empty.textContent = 'Não há indicadores ambientais liberados nesta publicação.';
        content.append(empty);
      }
    } catch (error) {
      environmentLabel.textContent = 'Consulta pública';
      content.replaceChildren();
      notice.textContent = `Não foi possível abrir os resultados publicados: ${error.message || error}`;
      content.append(notice);
    }
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
      let access = null;
      try { access = await AUDIT_REMOTE.getAccess(); } catch (_error) { /* Visita pública. */ }
      const canAudit = Boolean(access?.canAudit);
      const owner = canAudit ? await AUDIT_REMOTE.ownerKey() : null;
      let occupancy = [];
      if (canAudit && navigator.onLine && AUDIT_REMOTE.configured) {
        try { occupancy = await AUDIT_REMOTE.listActiveOccupancy(); }
        catch (error) { console.warn('[AuditOccupancy] Ocupação não disponível:', error); }
      }
      const occupiedByEnvironment = new Map(occupancy.map(slot => [slot.environment_id, slot]));
      const rows = await Promise.all(environments.map(async target => {
        if (!canAudit) return `<button type="button" data-map-id="${target.mapId}"><span>${target.roomNumber ? `Sala ${target.roomNumber} — ` : ''}${escapeHtml(target.name)}</span><small>Consultar resultados publicados</small></button>`;
        const records = (await AUDIT_STORAGE.listByEnvironment(target.environmentId))
          .filter(record => !AUDIT_SYNC_CORE.isRecoveryAudit(record) && (access.admin || AUDIT_SYNC_CORE.ownerKey(record) === owner));
        const active = await AUDIT_STORAGE.findActive(target.environmentId, owner);
        const last = records[0];
        const occupied = occupiedByEnvironment.get(target.environmentId);
        const ownerIsCurrent = active?.auditId === occupied?.audit_id && active?.ownerId === owner;
        const situation = occupied
          ? ownerIsCurrent
            ? 'Em andamento · continuar'
            : `Em andamento · Responsável: ${occupied.responsible_name || 'Auditor responsável'}`
          : active ? 'Em andamento · rascunho local'
            : last ? `Última: ${statusLabel(last.status)}` : 'Não auditado';
        return `<button type="button" data-map-id="${target.mapId}"><span>${target.roomNumber ? `Sala ${target.roomNumber} — ` : ''}${escapeHtml(target.name)}</span><small>${escapeHtml(situation)}</small></button>`;
      }));
      section.innerHTML = `<h3>Ambientes</h3>${rows.join('')}`;
      section.querySelectorAll('[data-map-id]').forEach(button => button.addEventListener('click',
        () => canAudit ? openAudit(button.dataset.mapId) : openHistory(button.dataset.mapId)));
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
    clearTimeout(saveTimer);
    if (audit) {
      try {
        await evidenceSaveFinished;
        // Uma edição pode chegar durante uma gravação assíncrona. Repetir
        // até que o formulário esteja efetivamente persistido.
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const result = await saveNow({ scheduleRemote: false });
          if (!isDirty && !result?.superseded) break;
        }
        if (isDirty) throw new Error('O formulário ainda possui alterações pendentes. Tente fechar novamente.');
        clearTimeout(saveTimer);
      } catch (error) {
        showLocalSaveError(error);
        return; // Não fechar com mudanças ainda não gravadas.
      }
      if (AUDIT_REMOTE.configured && navigator.onLine) AUDIT_REMOTE.flushSync(audit.auditId).catch(error => console.warn('[AuditRemote]', error));
    }
    modal.hidden = true;
    if (typeof authModal === 'undefined' || authModal.hidden) {
      if (typeof centerModal === 'undefined' || centerModal.hidden)
        document.body.classList.remove('audit-open');
    }
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
    if (audit?.collaborationEditorId) {
      const photo = content.querySelector('[data-evidence]');
      if (photo) {
        photo.disabled = true;
        photo.title = 'Fotografias de participantes serão liberadas após a validação da sincronização compartilhada de evidências.';
        const note = document.createElement('p');
        note.className = 'audit-note';
        note.textContent = 'Participação compartilhada: você pode editar os dados, mas novas fotografias devem ser adicionadas pelo responsável original.';
        photo.closest('label')?.after(note);
      }
    }
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
    const measuredValues = ['temperature', 'noiseDb', 'lux', 'installedPower', 'estimatedConsumption'];
    const numeric = type === 'number'
      ? (measuredValues.includes(name)
          ? ` step="any"${name === 'temperature' ? '' : ' min="0"'} inputmode="decimal"`
          : ' step="1" min="0" inputmode="numeric"')
      : '';
    return `<label><span>${label}</span><input name="${name}" type="${type}"${numeric} /></label>`;
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
    if (!description) {
      window.alert('Descreva a não conformidade antes de registrá-la.');
      content.querySelector('[name="ncDescription"]')?.focus();
      return;
    }
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
    // Os campos são apenas um formulário temporário de inclusão. Não
    // reidratar a descrição anterior nem perder a inclusão no autosave.
    audit.data.nonConformities = {};
    markDirty();
    scheduleSave(true);
    renderStep();
  }

  async function storeEvidence(event) {
    if (evidenceWriteActive) {
      window.alert('Aguarde a confirmação da fotografia anterior antes de selecionar outra.');
      event.target.value = '';
      return;
    }
    if (audit?.collaborationEditorId) {
      window.alert('A inclusão de novas evidências está restrita ao responsável original por enquanto.');
      event.target.value = '';
      return;
    }
    const file = event.target.files[0];
    if (!file) return;
    const evidenceId = uid('EVIDENCE');
    const targetAuditId = audit?.auditId;
    if (!targetAuditId) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('A evidência excede o limite de 10 MB. Reduza a imagem antes de anexar.');
      event.target.value = '';
      return;
    }
    evidenceWriteActive = true;
    let releaseEvidenceSave;
    evidenceSaveFinished = new Promise(resolve => { releaseEvidenceSave = resolve; });
    try {
      await AUDIT_STORAGE.saveEvidence({
        evidenceId, auditId: targetAuditId, nonConformityId: null,
        description: file.name, mimeType: file.type, size: file.size,
        createdAt: now(), blob: file, syncState: AUDIT_REMOTE.configured ? 'PENDING' : 'LOCAL_ONLY', syncError: null
      });
      if (!audit || audit.auditId !== targetAuditId) {
        throw new Error('O ambiente ativo mudou durante o salvamento da fotografia; o arquivo ficou preservado no dispositivo sem vínculo automático.');
      }
      audit.evidenceIds.push(evidenceId);
      markDirty();
      const saved = await scheduleSave(true);
      if (saved?.error) throw saved.error;
      saveState.textContent = saved?.superseded
        ? 'Fotografia armazenada · confirmação do vínculo ainda pendente'
        : '✓ Evidência salva neste dispositivo';
    } catch (error) {
      showLocalSaveError(error);
      window.alert('A fotografia não foi completamente salva. Não feche a auditoria até tentar novamente.');
    } finally {
      evidenceWriteActive = false;
      releaseEvidenceSave();
      event.target.value = '';
    }
  }

  function showLocalSaveError(error) {
    saveState.textContent = `⚠ Falha ao salvar no dispositivo: ${error?.message || 'verifique o armazenamento e tente novamente'}`;
    console.error('[AuditLocalSave]', error);
  }

  function scheduleSave(immediate = false) {
    clearTimeout(saveTimer);
    saveState.textContent = 'Salvando…';
    if (immediate) return saveNow().catch(error => {
      showLocalSaveError(error);
      return { error };
    });
    saveTimer = setTimeout(() => {
      saveNow().catch(showLocalSaveError);
    }, 350);
  }

  async function saveNow({ scheduleRemote = true } = {}) {
    if (!audit || audit.status === AUDIT_DATA.STATUS.COMPLETED) return;
    if (!isDirty) {
      await localSaveQueue;
      return { skipped: true };
    }
    audit.updatedAt = now();
    audit.currentStep = stepIndex;
    // Guarde uma cópia e nunca confirme um salvamento antigo se o usuário
    // continuar digitando enquanto o IndexedDB trabalha.
    const snapshot = structuredClone(audit);
    const savedGeneration = editGeneration;
    // Serializa gravações iniciadas em rápida sequência. Assim, uma escrita
    // antiga não pode terminar depois da escrita mais recente.
    const transaction = localSaveQueue.catch(() => {}).then(() =>
      AUDIT_STORAGE.saveAudit(snapshot, { enforceActiveUniqueness: true }));
    localSaveQueue = transaction;
    await transaction;
    if (!audit || audit.auditId !== snapshot.auditId) return { superseded: true };
    if (editGeneration !== savedGeneration) {
      scheduleSave();
      return { superseded: true };
    }
    isDirty = false;
    saveState.textContent = AUDIT_REMOTE.configured
      ? (navigator.onLine ? '✓ Salvo localmente · aguardando sincronização' : '✓ Salvo localmente · aguardando internet')
      : '✓ Salvo localmente · Supabase não configurado';
    if (scheduleRemote && AUDIT_REMOTE.configured && navigator.onLine) {
      const scheduledAuditId = snapshot.auditId;
      AUDIT_REMOTE.scheduleSync(snapshot).then(result => {
        // Uma resposta do servidor pode chegar depois de outra edição.
        // Nunca substituir o formulário atual por uma revisão antiga.
        if (!audit || audit.auditId !== scheduledAuditId || editGeneration !== savedGeneration) return;
        if (result?.synced && result.audit?.auditId === scheduledAuditId) {
          audit = result.audit;
          saveState.textContent = `✓ Sincronizado com o Supabase · ${new Date(audit.lastSyncedAt).toLocaleTimeString('pt-BR')}`;
        } else if (result?.evidence && result.audit?.auditId === scheduledAuditId) {
          saveState.textContent = `⚠ Dados salvos · evidências: ${result.evidence.synced} sincronizada(s), ${result.evidence.pending} pendente(s), ${result.evidence.errors} com erro`;
        } else if (result?.error && audit?.auditId === scheduledAuditId) {
          saveState.textContent = `⚠ Salvo localmente · erro de sincronização: ${result.error.message || 'tente novamente'}`;
        }
      });
    }
  }

  async function completeAudit() {
    // Uma fotografia grande pode estar sendo salva enquanto a pessoa clica
    // em concluir. Aguardar para não finalizar com o manifesto incompleto.
    await evidenceSaveFinished;
    captureForm();
    if (!audit.data.identification?.inspector?.trim()) {
      alert('Informe o nome do(a) auditor(a) na etapa de identificação antes de concluir.');
      stepIndex = 0;
      renderStep();
      return;
    }
    const previousStatus = audit.status;
    const previousCompletedAt = audit.completedAt;
    audit.status = AUDIT_DATA.STATUS.COMPLETED;
    audit.completedAt = now();
    audit.updatedAt = audit.completedAt;
    markDirty();
    try {
      await localSaveQueue.catch(() => {});
      await AUDIT_STORAGE.saveAudit(audit);
    } catch (error) {
      audit.status = previousStatus;
      audit.completedAt = previousCompletedAt;
      isDirty = true;
      showLocalSaveError(error);
      window.alert('Não foi possível gravar a conclusão neste dispositivo. A auditoria não será fechada.');
      return;
    }
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
    editGeneration += 1;
    audit.mutationId = uid('MUTATION');
    audit.syncState = AUDIT_REMOTE.configured ? 'PENDING' : 'LOCAL_ONLY';
    audit.syncError = null;
  }

  const authModal = document.getElementById('authModal');
  const authButton = document.getElementById('authBtn');
  const authForm = document.getElementById('authForm');
  const signupForm = document.getElementById('signupForm');
  const showSignupButton = document.getElementById('showSignupBtn');
  const backToLoginButton = document.getElementById('backToLoginBtn');
  const authStatus = document.getElementById('authStatus');
  const signOutButton = document.getElementById('signOutBtn');
  const syncNowButton = document.getElementById('syncNowBtn');
  const adminPanel = document.getElementById('adminRequestsPanel');
  const adminList = document.getElementById('accountRequestsList');
  const adminStatus = document.getElementById('accountRequestsStatus');
  const refreshAccounts = document.getElementById('refreshAccountRequests');
  const participationList = document.getElementById('participationRequestsList');
  const participationStatus = document.getElementById('participationRequestsStatus');
  const refreshParticipation = document.getElementById('refreshParticipationRequests');
  let currentAccess = null;
  let authGeneration = 0;

  async function loadAccessRequests() {
    adminStatus.textContent = 'Consultando solicitações…';
    adminList.replaceChildren();
    try {
      const rows = await AUDIT_REMOTE.listAccessRequests();
      adminStatus.textContent = rows.length ? `${rows.length} conta(s) encontrada(s)` : 'Nenhuma solicitação até agora.';
      for (const item of rows) {
        const card = document.createElement('article');
        card.className = 'admin-request-card';
        const heading = document.createElement('strong');
        heading.textContent = item.display_name || 'Sem nome informado';
        const info = document.createElement('p');
        info.textContent = `${item.email || 'Sem e-mail'} · ${item.confirmed ? 'E-mail confirmado' : 'Aguardando confirmação do e-mail'}`;
        const situation = document.createElement('small');
        situation.textContent = item.active ? 'Conta aprovada' : item.review_status === 'REJECTED' ? 'Acesso recusado' : 'Aguardando aprovação';
        card.append(heading, info, situation);
        const buttons = document.createElement('div');
        buttons.className = 'admin-request-actions';
        if (!item.active) {
          const approve = document.createElement('button');
          approve.type = 'button';
          approve.className = 'audit-primary';
          approve.textContent = 'Aprovar';
          approve.disabled = !item.confirmed;
          if (!item.confirmed) approve.title = 'A pessoa precisa confirmar seu e-mail.';
          approve.addEventListener('click', () => reviewRequest(item.user_id, true));
          buttons.append(approve);
        }
        if (item.review_status !== 'REJECTED' || item.active) {
          const reject = document.createElement('button');
          reject.type = 'button';
          reject.className = 'audit-secondary';
          reject.textContent = item.active ? 'Revogar acesso' : 'Recusar';
          reject.addEventListener('click', () => reviewRequest(item.user_id, false));
          buttons.append(reject);
        }
        card.append(buttons);
        adminList.append(card);
      }
    } catch (error) {
      adminStatus.textContent = `Não foi possível carregar solicitações: ${error.message || error}`;
    }
  }

  async function reviewRequest(userId, approve) {
    const action = approve ? 'aprovar' : 'recusar/revogar';
    if (!window.confirm(`Deseja realmente ${action} o acesso desta conta?`)) return;
    adminStatus.textContent = 'Salvando decisão…';
    try {
      await AUDIT_REMOTE.reviewAccessRequest(userId, approve);
      await loadAccessRequests();
      adminStatus.textContent = approve ? 'Conta aprovada. A pessoa já pode realizar auditorias.' : 'Acesso recusado ou revogado.';
    } catch (error) {
      adminStatus.textContent = `Não foi possível salvar: ${error.message || error}`;
    }
  }

  async function loadAuditParticipationRequests() {
    participationStatus.textContent = 'Consultando solicitações de participação…';
    participationList.replaceChildren();
    try {
      const rows = await AUDIT_REMOTE.listAuditParticipationRequests();
      participationStatus.textContent = rows.length
        ? `${rows.length} solicitação(ões) de participação.`
        : 'Nenhuma solicitação de participação.';
      for (const item of rows) {
        const env = AUDIT_DATA.getEnvironment(item.environment_id);
        const card = document.createElement('article');
        card.className = 'admin-request-card';
        const heading = document.createElement('strong');
        heading.textContent = env
          ? `${env.blockName} · ${env.roomNumber ? 'Sala ' + env.roomNumber : env.name}`
          : item.environment_id;
        const info = document.createElement('p');
        info.textContent = `${item.requester_name || 'Auditor'} (${item.requester_email || 'sem e-mail'}) · Responsável: ${item.responsible_name || 'Não informado'}`;
        const state = document.createElement('small');
        state.textContent = ({ PENDING: 'Aguardando aprovação', APPROVED: 'Participação autorizada',
          REJECTED: 'Solicitação recusada', REVOKED: 'Autorização revogada' })[item.status] || item.status;
        const actions = document.createElement('div');
        actions.className = 'admin-request-actions';
        if (item.status !== 'APPROVED') {
          const approve = document.createElement('button');
          approve.type = 'button';
          approve.className = 'audit-primary';
          approve.textContent = 'Autorizar participação';
          approve.addEventListener('click', () => reviewAuditParticipation(item.audit_id, item.requester_id, true));
          actions.append(approve);
        } else {
          const revoke = document.createElement('button');
          revoke.type = 'button';
          revoke.className = 'audit-secondary';
          revoke.textContent = 'Revogar participação';
          revoke.addEventListener('click', () => reviewAuditParticipation(item.audit_id, item.requester_id, false));
          actions.append(revoke);
        }
        card.append(heading, info, state, actions);
        participationList.append(card);
      }
    } catch (error) {
      participationStatus.textContent = 'Falha ao consultar participações: ' + (error.message || error);
    }
  }

  async function reviewAuditParticipation(auditId, requesterId, approve) {
    if (!window.confirm(approve
      ? 'Autorizar este usuário a editar a auditoria indicada? O responsável original será mantido.'
      : 'Revogar a permissão de editar esta auditoria?')) return;
    participationStatus.textContent = 'Registrando decisão…';
    try {
      await AUDIT_REMOTE.reviewAuditParticipation(auditId, requesterId, approve);
      await loadAuditParticipationRequests();
      participationStatus.textContent = approve
        ? 'Participação autorizada. A pessoa já pode continuar a auditoria existente.'
        : 'Permissão de participação revogada.';
    } catch (error) {
      participationStatus.textContent = 'Falha ao registrar decisão: ' + (error.message || error);
    }
  }

  async function setAuthState(user, message = '') {
    const generation = ++authGeneration;
    const authenticated = Boolean(user);
    authButton.textContent = authenticated ? 'Minha conta' : 'Entrar';
    authForm.hidden = authenticated || !AUDIT_REMOTE.configured;
    signupForm.hidden = true;
    showSignupButton.hidden = authenticated || !AUDIT_REMOTE.configured;
    signOutButton.hidden = !authenticated;
    syncNowButton.hidden = true;
    adminPanel.hidden = true;
    currentAccess = null;
    if (!authenticated) {
      authStatus.className = AUDIT_REMOTE.configured ? 'auth-status' : 'auth-status is-error';
      authStatus.textContent = message || (AUDIT_REMOTE.configured
        ? 'Consulte resultados publicados sem login ou entre com uma conta autorizada para auditar.'
        : 'Cadastro temporariamente indisponível. Supabase não configurado.');
      return;
    }
    authStatus.className = 'auth-status';
    authStatus.textContent = 'Verificando autorização da conta…';
    try {
      const access = await AUDIT_REMOTE.getAccess();
      if (generation !== authGeneration) return;
      currentAccess = access;
      if (access?.canAudit) {
        authStatus.className = 'auth-status is-success';
        authStatus.textContent = message || `Conta autorizada (${access.admin ? 'Administrador' : 'Auditor'})${access.offline ? ' · autorização offline temporária' : ''}.`;
        syncNowButton.hidden = Boolean(access.offline);
        adminPanel.hidden = !access.admin || access.offline;
        if (access.admin && !access.offline) {
          loadAccessRequests();
          loadAuditParticipationRequests();
        }
      } else {
        authStatus.className = 'auth-status';
        authStatus.textContent = access?.reviewStatus === 'REJECTED'
          ? 'O acesso de auditor desta conta foi recusado ou revogado. Você ainda pode consultar resultados publicados.'
          : access?.reviewStatus === 'OFFLINE'
            ? 'Sem conexão para validar a autorização. Conecte-se à internet para continuar.'
            : 'Conta cadastrada, mas ainda sem autorização para realizar auditorias. Aguarde aprovação do administrador.';
      }
    } catch (error) {
      if (generation !== authGeneration) return;
      authStatus.className = 'auth-status is-error';
      authStatus.textContent = `Falha ao verificar autorização: ${error.message || error}`;
    }
  }

  function openAuthModal() {
    authModal.hidden = false;
    document.body.classList.add('audit-open');
    requestAnimationFrame(() => authModal.querySelector('input:not([hidden]), button')?.focus());
  }
  function closeAuthModal() {
    authModal.hidden = true;
    if (modal.hidden && centerModal.hidden) document.body.classList.remove('audit-open');
    authButton.focus();
  }
  authButton.addEventListener('click', openAuthModal);
  authModal.querySelectorAll('[data-auth-close]').forEach(element => element.addEventListener('click', closeAuthModal));
  showSignupButton.addEventListener('click', () => {
    authForm.hidden = true;
    signupForm.hidden = false;
    showSignupButton.hidden = true;
    authStatus.className = 'auth-status';
    authStatus.textContent = 'Solicite sua conta. O administrador precisará aprovar o acesso.';
    signupForm.querySelector('input')?.focus();
  });
  backToLoginButton.addEventListener('click', () => {
    signupForm.hidden = true;
    authForm.hidden = false;
    showSignupButton.hidden = false;
  });
  signupForm.addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(signupForm);
    const button = signupForm.querySelector('button[type="submit"]');
    button.disabled = true;
    authStatus.textContent = 'Enviando solicitação…';
    try {
      const result = await AUDIT_REMOTE.requestAccount(values.get('displayName'), values.get('email'), values.get('password'));
      signupForm.reset();
      signupForm.hidden = true;
      if (result?.session?.user) {
        await setAuthState(result.session.user);
      } else {
        authForm.hidden = false;
        showSignupButton.hidden = false;
      }
      authStatus.className = 'auth-status is-success';
      authStatus.textContent = 'Solicitação registrada. Se receber um e-mail de confirmação, confirme o endereço. A autorização para auditar depende de aprovação do administrador.';
    } catch (error) {
      authStatus.className = 'auth-status is-error';
      authStatus.textContent = `Não foi possível solicitar a conta: ${error.message || error}`;
    } finally { button.disabled = false; }
  });
  authForm.addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(authForm);
    authStatus.className = 'auth-status';
    authStatus.textContent = 'Autenticando…';
    try {
      const user = await AUDIT_REMOTE.signIn(values.get('email'), values.get('password'));
      authForm.reset();
      await setAuthState(user);
    } catch (error) {
      authStatus.className = 'auth-status is-error';
      authStatus.textContent = `Não foi possível entrar: ${error.message || error}`;
    }
  });
  async function hidePrivateEditorBeforeAccountChange() {
    if (modal.hidden || !audit || !editorUserId) return;
    // Persistir os campos ainda visíveis antes de retirar o formulário.
    await evidenceSaveFinished;
    if (content.querySelector('#auditForm') && audit.status !== AUDIT_DATA.STATUS.COMPLETED) captureForm();
    clearTimeout(saveTimer);
    await saveNow({ scheduleRemote: false });
    if (isDirty) throw new Error('Existem alterações ainda não gravadas neste dispositivo.');
    modal.hidden = true;
    content.replaceChildren();
    audit = null;
    environment = null;
    editorUserId = null;
    editGeneration += 1;
    if (authModal.hidden && centerModal.hidden) document.body.classList.remove('audit-open');
  }

  signOutButton.addEventListener('click', async () => {
    try {
      await hidePrivateEditorBeforeAccountChange();
      await AUDIT_REMOTE.signOut();
      await setAuthState(null, 'Sessão encerrada. Nenhuma auditoria local foi apagada.');
    } catch (error) {
      authStatus.className = 'auth-status is-error';
      authStatus.textContent = `Falha ao sair: ${error.message || error}`;
    }
  });
  syncNowButton.addEventListener('click', async () => {
    authStatus.className = 'auth-status';
    authStatus.textContent = 'Sincronizando registros pendentes…';
    try {
      const result = await AUDIT_REMOTE.syncPending();
      authStatus.className = result.failed ? 'auth-status is-error' : 'auth-status is-success';
      authStatus.textContent = result.skipped
        ? 'Nada foi enviado. Verifique a conexão e a autorização.'
        : `${result.synced} registro(s) sincronizado(s); ${result.failed} falha(s); ${result.pendingEvidence || 0} evidência(s) pendente(s).`;
    } catch (error) {
      authStatus.className = 'auth-status is-error';
      authStatus.textContent = `Falha na sincronização: ${error.message || error}`;
    }
  });
  refreshAccounts.addEventListener('click', loadAccessRequests);
  refreshParticipation.addEventListener('click', loadAuditParticipationRequests);
  // v16: central de consulta, sem regravar auditorias nem iniciar sincronizacao automatica.
  const centerModal = document.getElementById('auditCenterModal');
  const centerButton = document.getElementById('auditCenterBtn');
  const centerSearch = document.getElementById('auditCenterSearch');
  const centerFilter = document.getElementById('auditCenterFilter');
  const centerResults = document.getElementById('auditCenterResults');
  const centerSummary = document.getElementById('auditCenterSummary');
  let centerRecords = [];
  let centerLoadNote = '';
  let centerIsAdmin = false;
  let centerCanAudit = false;
  let centerFocus = null;

  function centerStatus(item) {
    return item.status === 'COMPLETED' ? 'Concluída' : item.status === 'IN_PROGRESS' ? 'Em andamento' : 'Rascunho';
  }

  function renderCenter() {
    const query = centerSearch.value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const filter = centerFilter.value;
    const rows = centerRecords.filter(item => {
      const env = AUDIT_DATA.getEnvironment(item.environmentId);
      const searchable = [env?.name, env?.blockName, env?.roomNumber, item.environmentId, item.auditId].join(' ')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (query && !searchable.includes(query)) return false;
      if (filter === 'COMPLETED' && item.status !== 'COMPLETED') return false;
      if (filter === 'ACTIVE' && item.status === 'COMPLETED') return false;
      if (filter === 'PENDING' && !['LOCAL_ONLY', 'PENDING', 'ERROR', 'CONFLICT'].includes(item.syncState)) return false;
      return true;
    });
    centerSummary.textContent = `${rows.length} de ${centerRecords.length} auditoria(s) acessível(is). ${centerLoadNote}`;
    centerResults.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'audit-center-empty';
      empty.textContent = !centerCanAudit && !query && filter === 'ALL'
        ? 'Ainda não há resultados publicados. As auditorias em andamento permanecem privadas até serem concluídas, sincronizadas e autorizadas para publicação.'
        : 'Nenhuma auditoria encontrada para estes filtros.';
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
      info.textContent = item.occupancyOnly
        ? `${centerStatus(item)} · Ambiente ocupado por outro auditor · ${item.updatedAt ? new Date(item.updatedAt).toLocaleString('pt-BR') : 'Sem data'}`
        : `${centerStatus(item)} · ${item.syncState === 'SYNCED' ? 'Sincronizada' : item.syncState === 'CONFLICT' ? 'Conflito preservado' : item.remoteOnly ? 'No Supabase' : 'Local / pendente'} · ${item.updatedAt ? new Date(item.updatedAt).toLocaleString('pt-BR') : 'Sem data'}`;
      if (item.responsibleName) info.textContent += ` · Responsável: ${item.responsibleName}`;
      const action = document.createElement('button');
      action.type = 'button';
      const published = Boolean(item.publicOnly || item.isPublic);
      action.textContent = published ? 'Ver resultados públicos' : 'Ver histórico';
      action.disabled = !published && !env?.mapId;
      if (!item.occupancyOnly) action.addEventListener('click', async () => {
        centerModal.hidden = true;
        try {
          if (published) await showPublicAudit(item.auditId);
          else await openHistory(env.mapId);
        } catch (error) { console.error('[AuditCenter]', error); centerModal.hidden = false; }
      });
      if (item.occupancyOnly) {
        action.textContent = item.participationStatus === 'APPROVED'
          ? 'Continuar auditoria compartilhada'
          : item.participationStatus === 'PENDING'
            ? 'Aguardando aprovação'
            : 'Solicitar participação';
        action.disabled = item.participationStatus === 'PENDING';
        action.addEventListener('click', async () => {
          action.disabled = true;
          try {
            if (item.participationStatus === 'APPROVED') {
              await openSharedAudit(item.auditId);
            } else if (window.confirm('Solicitar participação na auditoria de ' +
              (item.responsibleName || 'outro auditor') + '? O administrador precisará aprovar.')) {
              await AUDIT_REMOTE.requestAuditParticipation(item.auditId);
              await openCenter();
            }
          } catch (error) {
            window.alert('Não foi possível processar a participação: ' + (error.message || error));
          } finally { action.disabled = false; }
        });
        card.append(heading, info, action);
        centerResults.append(card);
        continue;
      }
      if (item.publicOnly) {
        const note = document.createElement('small');
        note.textContent = 'Registro público concluído';
        card.append(note);
      }
      card.append(heading, info, action);
      if (centerIsAdmin && item.status === 'COMPLETED' &&
          item.syncState === 'SYNCED' && (item.remoteOnly || item.hasRemote) &&
          item.remoteConfirmed !== false && !item.publicOnly) {
        const publication = document.createElement('button');
        publication.type = 'button';
        publication.className = 'audit-secondary';
        publication.textContent = item.isPublic ? 'Retirar publicação' : 'Publicar resultado';
        publication.addEventListener('click', async () => {
          const willPublish = !item.isPublic;
          if (!window.confirm(willPublish
            ? 'Publicar o resultado sanitizado desta auditoria para todos os visitantes?'
            : 'Retirar este resultado da consulta pública?')) return;
          publication.disabled = true;
          try {
            await AUDIT_REMOTE.setPublication(item.auditId, willPublish);
            await openCenter();
          } catch (error) {
            publication.disabled = false;
            window.alert('Falha ao alterar publicação: ' + (error.message || error));
          }
        });
        card.append(publication);
      }
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
      let access = null;
      try { access = await AUDIT_REMOTE.getAccess(); }
      catch (error) { console.warn('[AuditCenter] Autorização indisponível:', error); }
      centerIsAdmin = Boolean(access?.admin);
      centerCanAudit = Boolean(access?.canAudit);
      const owner = access?.canAudit ? await AUDIT_REMOTE.ownerKey() : null;
      const deviceKey = access?.canAudit ? `LOCAL:${await AUDIT_STORAGE.getDeviceId()}` : null;
      const all = access?.canAudit ? await AUDIT_STORAGE.listAudits() : [];
      const localRecords = all.filter(item => {
        if (AUDIT_SYNC_CORE.isRecoveryAudit(item)) return false;
        if (access.admin) return true;
        const recordOwner = AUDIT_SYNC_CORE.ownerKey(item);
        return recordOwner === owner || (recordOwner === deviceKey && item.ownerId == null);
      });
      const merged = new Map(localRecords.map(item => [item.auditId, item]));
      centerLoadNote = 'Somente registros locais (sem conexão).';
      if (AUDIT_REMOTE.configured && navigator.onLine) {
        try {
          const remote = await AUDIT_REMOTE.listAccessibleAudits();
          for (const item of remote.items) {
            const existing = merged.get(item.auditId);
            // Preserva a versao local com alteracoes pendentes; nao grava no IndexedDB.
            if (!existing) merged.set(item.auditId, item);
            else if (existing.syncState === 'SYNCED' && Number(item.serverRevision || 0) > Number(existing.serverRevision || 0))
              merged.set(item.auditId, item);
            else merged.set(item.auditId, { ...existing, isPublic: Boolean(item.isPublic),
              remoteConfirmed: Boolean(item.syncComplete), hasRemote: true });
          }
          centerLoadNote = access?.canAudit
            ? 'Inclui registros autorizados do Supabase e resultados públicos.'
            : 'Consulta livre: somente auditorias publicadas.';
          if (remote.limited) centerLoadNote += ' Consulta limitada aos 1.000 registros mais recentes por origem.';
        } catch (error) {
          centerLoadNote = 'Consulta remota indisponível; registros locais preservados.';
          console.warn('[AuditCenter] Falha ao consultar Supabase:', error);
        }
      }
      centerRecords = [...merged.values()].sort((a, b) =>
        String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      if (!centerModal.hidden) renderCenter();
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
  // Registrar o listener depois da inicialização da Central de Auditorias:
  // uma sessão trocada não pode manter a lista privada de outra conta visível.
  let currentSessionUserId = null;
  AUDIT_REMOTE.onAuthStateChange(async (_event, user) => {
    const nextUserId = user?.id || null;
    if (currentSessionUserId && currentSessionUserId !== nextUserId) {
      centerRecords = [];
      centerResults.replaceChildren();
      centerModal.hidden = true;
      centerIsAdmin = false;
      centerCanAudit = false;
    }
    currentSessionUserId = nextUserId;
    try {
      if (editorUserId && nextUserId !== editorUserId) {
        await hidePrivateEditorBeforeAccountChange();
      }
    } catch (error) {
      showLocalSaveError(error);
      console.warn('[AuditAuth] Falha ao preservar o editor durante a troca de conta.', error);
    }
    setAuthState(user).catch(error => console.error('[Auth]', error));
  });

  AUDIT_STORAGE.openDatabase().catch(error => console.error('[AuditStorage]', error));

  return Object.freeze({ openAudit, openHistory });
})();

globalThis.AUDIT_APP = AUDIT_APP;
