'use strict';
// Revisão explícita antes da conclusão — sem criar indicadores ou notas fictícias.
const AUDIT_VALIDATION = (() => {
  const requiredSteps = Object.freeze([
    'lighting', 'airConditioning', 'equipment', 'waterWaste',
    'conditions', 'infrastructure', 'nonConformities'
  ]);
  const labels = Object.freeze({
    lighting: 'Iluminação', airConditioning: 'Climatização',
    equipment: 'Equipamentos', waterWaste: 'Água e resíduos',
    conditions: 'Condições ambientais', infrastructure: 'Infraestrutura',
    nonConformities: 'Não conformidades'
  });
  function meaningful(value) {
    if (value === null || value === undefined || value === '') return false;
    if (Array.isArray(value)) return value.some(meaningful);
    if (typeof value === 'object') return Object.values(value).some(meaningful);
    return String(value).trim().length > 0;
  }
  function review(record) {
    const data = record?.data || {};
    const errors = [];
    if (!String(data.identification?.inspector || '').trim())
      errors.push({ step: 'identification', message: 'Informe o(a) auditor(a) responsável.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.identification?.date || '')))
      errors.push({ step: 'identification', message: 'Informe uma data válida para a coleta.' });
    for (const step of requiredSteps) {
      if (record?.reviewedSteps?.[step] !== true) {
        errors.push({ step, message: 'Confirme a revisão da etapa: ' + labels[step] + '.' });
      } else if (step !== 'nonConformities' && !meaningful(data[step])) {
        errors.push({ step, message: labels[step] + ': registre ao menos um dado ou explique em Observações por que não foi avaliado.' });
      }
    }
    if (!String(data.review?.conclusion || '').trim())
      errors.push({ step: 'review', message: 'Informe uma conclusão geral antes de finalizar.' });
    return { valid: errors.length === 0, errors, firstStep: errors[0]?.step || null };
  }
  return Object.freeze({ requiredSteps, labels, review, meaningful });
})();
globalThis.AUDIT_VALIDATION = AUDIT_VALIDATION;
