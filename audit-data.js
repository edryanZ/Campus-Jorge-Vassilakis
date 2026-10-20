'use strict';

const AUDIT_DATA = (() => {
  const STATUS = Object.freeze({ DRAFT: 'DRAFT', IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED' });
  const INFORMATION_SOURCES = Object.freeze(['OBSERVED', 'MEASURED', 'REPORTED', 'DOCUMENT', 'ESTIMATED']);
  const PRIORITIES = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'TO_DEFINE']);
  const NON_CONFORMITY_CATEGORIES = Object.freeze([
    'energy', 'water', 'waste', 'air_conditioning', 'infrastructure',
    'environmental_comfort', 'accessibility', 'other'
  ]);

  const slug = value => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');

  function permanentId(blockId, item) {
    const block = slug(blockId);
    if (item.number) return `${block}-SALA-${item.number}`;
    return `${block}-${slug(item.floorId || 'GERAL')}-${slug(item.name)}`;
  }

  const environments = CAMPUS_DATA.blocks.flatMap(block => [
    ...(block.rooms || []), ...(block.amenities || [])
  ].map(item => Object.freeze({
    environmentId: permanentId(block.id, item),
    mapId: item.id,
    blockId: block.id,
    blockName: block.label,
    roomNumber: item.number || null,
    name: item.name,
    type: item.category,
    floorId: item.floorId || null,
    auditEnabled: true
  })));

  // O Bloco K permanece visível no mapa, mas não entra no cadastro de coleta até o levantamento ser confirmado.
  const pendingBlocks = Object.freeze([{ blockId: 'bloco-k', reason: 'Levantamento ambiental e espacial ainda incompleto.' }]);
  const byMapId = new Map(environments.map(item => [item.mapId, item]));
  const byId = new Map(environments.map(item => [item.environmentId, item]));

  const STEPS = Object.freeze([
    { id: 'identification', title: 'Identificação' },
    { id: 'lighting', title: 'Iluminação' },
    { id: 'airConditioning', title: 'Climatização' },
    { id: 'equipment', title: 'Equipamentos' },
    { id: 'waterWaste', title: 'Água e resíduos' },
    { id: 'conditions', title: 'Condições ambientais' },
    { id: 'infrastructure', title: 'Infraestrutura' },
    { id: 'nonConformities', title: 'Não conformidades' },
    { id: 'review', title: 'Revisão e conclusão' }
  ]);

  function validate() {
    const errors = [];
    const ids = new Set();
    environments.forEach(item => {
      if (!item.environmentId) errors.push(`Ambiente ${item.mapId} sem identificador permanente.`);
      if (ids.has(item.environmentId)) errors.push(`Identificador ambiental duplicado: ${item.environmentId}.`);
      ids.add(item.environmentId);
      if (!item.name || !item.blockId || !item.type) errors.push(`Cadastro ambiental incompleto: ${item.mapId}.`);
    });
    return { valid: errors.length === 0, errors, warnings: pendingBlocks.map(item => `${item.blockId}: ${item.reason}`) };
  }

  const validation = validate();
  validation.errors.forEach(message => console.error(`[AuditData] ${message}`));
  validation.warnings.forEach(message => console.warn(`[AuditData] ${message}`));

  return Object.freeze({
    STATUS, INFORMATION_SOURCES, PRIORITIES, NON_CONFORMITY_CATEGORIES,
    STEPS, environments: Object.freeze(environments), pendingBlocks,
    getEnvironmentByMapId: mapId => byMapId.get(mapId) || null,
    getEnvironment: environmentId => byId.get(environmentId) || null,
    validation
  });
})();

globalThis.AUDIT_DATA = AUDIT_DATA;
