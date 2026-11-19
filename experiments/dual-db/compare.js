'use strict';

// Experimento isolado: nunca utilizado pelo fluxo real de auditorias.
// Dois adaptadores escrevem e relêem somente dados explicitamente fictícios.
(function expose(factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.CAMPUS_DUAL_DB_TRIAL = api;
})(function createTrial() {
  const PREFIX = 'CJV-TEST-';
  const FIXTURE_MARKER = 'DADO FICTÍCIO PARA TESTE';

  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object')
      return '{' + Object.keys(value).sort()
        .filter(key => value[key] !== undefined)
        .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    return JSON.stringify(value);
  }

  function validateFixture(id, sample) {
    if (typeof id !== 'string' || !/^CJV-TEST-[A-Za-z0-9-]{1,70}$/.test(id))
      throw new Error('ID de teste inválido: nunca utilizar IDs reais de auditorias.');
    if (!sample || sample.testOnly !== true ||
        sample.environmentId !== FIXTURE_MARKER ||
        sample.inspector !== FIXTURE_MARKER)
      throw new Error('Somente auditorias identificadas como DADO FICTÍCIO PARA TESTE são permitidas.');
    if (!sample.data || typeof sample.data !== 'object' || Array.isArray(sample.data))
      throw new Error('A amostra fictícia precisa conter um formulário de dados.');
    if (canonical(sample).length > 20000)
      throw new Error('A amostra fictícia excedeu o limite de segurança do experimento.');
  }

  function makeFixture() {
    return {
      testOnly: true,
      environmentId: FIXTURE_MARKER,
      inspector: FIXTURE_MARKER,
      currentStep: 3,
      data: {
        identification: { inspector: FIXTURE_MARKER, date: '2026-11-19' },
        lighting: { total: '9', led: '4', fluorescent: '5' },
        equipment: { computadores: '2', observacoes: FIXTURE_MARKER }
      },
      evidenceIds: [],
      reviewedSteps: { identification: true, lighting: true }
    };
  }

  async function measure(adapter, id, sample, clock) {
    const started = clock();
    try {
      await adapter.write(id, sample);
      const writeMs = Math.max(0, clock() - started);
      const received = await adapter.read(id);
      const readMs = Math.max(0, clock() - started - writeMs);
      const equal = canonical(received) === canonical(sample);
      return {
        outcome: equal ? 'VERIFIED' : 'MISMATCH',
        writeMs, readMs,
        samePayload: equal
      };
    } catch (error) {
      return {
        outcome: 'ERROR',
        writeMs: Math.max(0, clock() - started),
        readMs: null,
        samePayload: false,
        errorCode: String(error?.code || 'REQUEST_FAILED').slice(0, 64)
      };
    }
  }

  async function compare({ supabase, firebase, id, sample = makeFixture(),
    clock = () => Date.now() }) {
    validateFixture(id, sample);
    if (typeof supabase?.write !== 'function' || typeof supabase?.read !== 'function' ||
        typeof firebase?.write !== 'function' || typeof firebase?.read !== 'function')
      throw new Error('É necessário configurar os dois adaptadores de teste.');
    // Ambas as plataformas operam em namespaces dedicados; não lê nem
    // altera public.audits, fotografias, perfis ou registros reais.
    const [supabaseResult, firebaseResult] = await Promise.all([
      measure(supabase, id, sample, clock),
      measure(firebase, id, sample, clock)
    ]);
    return {
      id,
      supabase: supabaseResult,
      firebase: firebaseResult,
      bothVerified: supabaseResult.outcome === 'VERIFIED' && firebaseResult.outcome === 'VERIFIED'
    };
  }

  function supabaseAdapter(client) {
    if (!client?.from) throw new Error('Cliente Supabase não configurado.');
    const table = 'dual_db_trial_records';
    return {
      async write(id, payload) {
        validateFixture(id, payload);
        const { error } = await client.from(table).upsert({ trial_id: id, payload }, { onConflict: 'trial_id' });
        if (error) throw error;
      },
      async read(id) {
        if (!id.startsWith(PREFIX)) throw new Error('Leitura fora da área de testes proibida.');
        const { data, error } = await client.from(table).select('payload').eq('trial_id', id).single();
        if (error) throw error;
        return data?.payload;
      }
    };
  }

  function firebaseAdapter({ db, auth, doc, setDoc, getDoc }) {
    if (!db || !auth?.currentUser?.uid || !doc || !setDoc || !getDoc)
      throw new Error('Ative Firebase Auth e Firestore apenas no projeto de testes.');
    const ownerUid = auth.currentUser.uid;
    const collection = 'dual_db_trial_records';
    return {
      async write(id, payload) {
        validateFixture(id, payload);
        if (auth.currentUser?.uid !== ownerUid) throw new Error('Conta Firebase alterada.');
        await setDoc(doc(db, collection, id), { ownerUid, payload });
      },
      async read(id) {
        if (!id.startsWith(PREFIX)) throw new Error('Leitura fora da área de testes proibida.');
        if (auth.currentUser?.uid !== ownerUid) throw new Error('Conta Firebase alterada.');
        const snap = await getDoc(doc(db, collection, id));
        return snap.exists() ? snap.data().payload : null;
      }
    };
  }

  return Object.freeze({ canonical, validateFixture, makeFixture, compare, supabaseAdapter, firebaseAdapter });
});
