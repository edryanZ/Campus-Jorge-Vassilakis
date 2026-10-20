'use strict';

// Somente valores públicos podem ser colocados neste arquivo. Nunca use service_role ou sb_secret_ aqui.
// Para ativar a sincronização, substitua os dois valores abaixo pelos dados do painel do Supabase.
globalThis.SUPABASE_CONFIG = Object.freeze({
  url: 'https://SEU-PROJETO.supabase.co',
  publishableKey: 'sb_publishable_SUBSTITUA_AQUI',
  evidenceBucket: 'audit-evidence'
});
