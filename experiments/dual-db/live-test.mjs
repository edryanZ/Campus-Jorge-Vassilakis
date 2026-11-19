// Tela de testes isolada: duas gravações reais, sempre com a mesma amostra fictícia.
// Não importa o editor de auditoria, não lê documentos reais e não usa Admin SDK.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import { getAuth, setPersistence, browserSessionPersistence,
  signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import { getFirestore, doc, setDoc, getDocFromServer } from
  'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';

const $ = id => document.getElementById(id);
const trial = globalThis.CAMPUS_DUAL_DB_TRIAL;
const config = globalThis.SUPABASE_CONFIG;

let supabaseClient = null;
let supabaseUser = null;
let firebaseAuth = null;
let firebaseDb = null;
let firebaseProjectId = null;
let running = false;

function notify(id, text) {
  $(id).textContent = text;
}

function errorLabel(error) {
  // Nunca exibir tokens, senhas, URLs com credenciais ou dumps da auditoria.
  const code = String(error?.code || error?.name || 'ERRO_DESCONHECIDO');
  return code.replace(/[^A-Za-z0-9_./-]/g, '').slice(0, 70);
}

function ready() {
  const canRun = !!(supabaseUser && firebaseAuth?.currentUser?.emailVerified &&
    $('confirmScope').checked && !running);
  $('testBoth').disabled = !canRun;
  return canRun;
}

function clearPassword(id) {
  $(id).value = '';
}

function viewOutcome(target, data) {
  const element = $(target);
  element.dataset.outcome = data.outcome;
  const name = target === 'supaResult' ? 'Supabase' : 'Firebase';
  element.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = name;
  const state = document.createElement('strong');
  state.textContent = data.outcome === 'VERIFIED'
    ? 'Confirmado no servidor' : data.outcome === 'MISMATCH'
      ? 'Campos divergentes' : 'Falha na operação';
  const timing = document.createElement('span');
  timing.textContent = 'Gravação: ' + data.writeMs + ' ms · leitura: ' +
    (data.readMs == null ? 'não realizada' : data.readMs + ' ms');
  element.append(heading, state, timing);
  if (data.errorCode) {
    const code = document.createElement('span');
    code.textContent = 'Código do erro: ' + data.errorCode;
    element.appendChild(code);
  }
}

$('supabaseLogin').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('[type="submit"]');
  submit.disabled = true;
  supabaseUser = null;
  ready();
  notify('supaState', 'Entrando no Supabase…');
  try {
    if (!trial || !config?.url || !config?.publishableKey || !globalThis.supabase?.createClient)
      throw new Error('CONFIG_SUPABASE_INDISPONIVEL');
    // Isolar esta autenticação da sessão do site: sem persistência local
    // e sem redirecionamentos automáticos para o domínio oficial.
    if (!supabaseClient) {
      supabaseClient = globalThis.supabase.createClient(config.url, config.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false,
          detectSessionInUrl: false }
      });
    }
    const result = await supabaseClient.auth.signInWithPassword({
      email: $('supaEmail').value.trim(), password: $('supaPassword').value
    });
    if (result.error) throw result.error;
    if (!result.data?.user?.id) throw new Error('USUARIO_NAO_CONFIRMADO');
    supabaseUser = result.data.user;
    notify('supaState', 'Conectado. A autorização da tabela exclusiva será conferida durante o teste.');
  } catch (error) {
    notify('supaState', 'Não foi possível entrar (' + errorLabel(error) + ').');
  } finally {
    clearPassword('supaPassword');
    submit.disabled = false;
    ready();
  }
});

$('firebaseLogin').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('[type="submit"]');
  submit.disabled = true;
  ready();
  notify('firebaseState', 'Entrando no Firebase…');
  try {
    const parsed = JSON.parse($('firebaseConfig').value);
    if (['apiKey','authDomain','projectId','appId']
      .some(key => typeof parsed[key] !== 'string' || !parsed[key].trim()))
      throw new Error('CONFIG_FIREBASE_INCOMPLETA');
    if (firebaseProjectId && firebaseProjectId !== parsed.projectId)
      throw new Error('RECARREGUE_PARA_TROCAR_PROJETO');
    if (!firebaseAuth) {
      const app = initializeApp({
        apiKey: parsed.apiKey, authDomain: parsed.authDomain,
        projectId: parsed.projectId, appId: parsed.appId
      }, 'campus-jv-dual-db-trial');
      firebaseAuth = getAuth(app);
      firebaseDb = getFirestore(app);
      firebaseProjectId = parsed.projectId;
      await setPersistence(firebaseAuth, browserSessionPersistence);
    }
    const login = await signInWithEmailAndPassword(firebaseAuth,
      $('fbEmail').value.trim(), $('fbPassword').value);
    if (!login?.user?.uid) throw new Error('USUARIO_FIREBASE_NAO_CONFIRMADO');
    if (!login.user.emailVerified) throw new Error('CONFIRME_EMAIL_FIREBASE');
    notify('firebaseState', 'Conectado ao projeto de testes. E-mail verificado.');
  } catch (error) {
    notify('firebaseState', 'Não foi possível entrar (' + errorLabel(error) + ').');
  } finally {
    clearPassword('fbPassword');
    submit.disabled = false;
    ready();
  }
});

$('confirmScope').addEventListener('change', ready);

$('testBoth').addEventListener('click', async () => {
  if (!ready()) return;
  running = true;
  ready();
  const startedUser = supabaseUser.id;
  const startedFirebaseUid = firebaseAuth.currentUser.uid;
  notify('testState', 'Enviando a mesma amostra fictícia aos dois bancos…');
  try {
    const supabase = trial.supabaseAdapter(supabaseClient);
    const firebase = trial.firebaseAdapter({
      db: firebaseDb, auth: firebaseAuth, doc, setDoc, getDocFromServer
    });
    // ID estável por conta: testes repetidos reutilizam o mesmo documento
    // e a mesma linha de ensaio, evitando crescimento desnecessário.
    const id = 'CJV-TEST-DUAL-' + startedUser.replace(/[^a-z0-9]/gi, '').slice(0, 20);
    const result = await trial.compare({ supabase, firebase, id });
    if (supabaseUser?.id !== startedUser ||
        firebaseAuth.currentUser?.uid !== startedFirebaseUid)
      throw new Error('CONTAS_ALTERADAS_DURANTE_TESTE');
    viewOutcome('supaResult', result.supabase);
    viewOutcome('firebaseResult', result.firebase);
    notify('testState', result.bothVerified
      ? 'Sucesso: os dois bancos gravaram e devolveram a mesma amostra fictícia.'
      : 'Atenção: um ou ambos os bancos não confirmaram os mesmos campos. Nada foi marcado como sucesso duplo.');
  } catch (error) {
    notify('testState', 'Teste interrompido por segurança (' + errorLabel(error) + ').');
  } finally {
    running = false;
    ready();
  }
});
