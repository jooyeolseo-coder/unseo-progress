// 운서동 공정 도면 — Firebase 연결부
// 앱 본문(index.html의 startApp)은 claude.ai 아티팩트 때와 같은 db/user 인터페이스를 씁니다.
// 여기서 그 인터페이스를 Firebase(Firestore + 구글 로그인)로 바꿔 끼웁니다.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, doc, collection, getDoc, setDoc, onSnapshot, writeBatch }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = s => document.querySelector(s);
const gate = $('#gate'), gateMsg = $('#gateMsg'), gateAct = $('#gateAct');
function showGate(text, isErr, actions = []) {
  gate.hidden = false; gateMsg.textContent = text; gateMsg.classList.toggle('err', !!isErr);
  gateAct.textContent = ''; actions.forEach(a => gateAct.append(a));
}
function btn(label, onClick, ghost) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (ghost) b.className = 'ghost'; b.onclick = onClick; return b; }

const cfg = window.FIREBASE_CONFIG;
if (!cfg || !cfg.apiKey || String(cfg.apiKey).startsWith('여기에')) {
  showGate('Firebase 설정값이 아직 들어가지 않았습니다. firebase-config.js를 채워 주세요.', true);
  throw new Error('no firebase config');
}
const app = initializeApp(cfg);
const auth = getAuth(app);
let fs;
try { fs = initializeFirestore(app, { localCache: persistentLocalCache() }); } catch (e) { fs = initializeFirestore(app, {}); }

// 오류 코드를 앱이 이해하는 코드로 맞춤 (권한 없음 → 보기 전용 처리)
const wrapErr = e => { const c = e && e.code; const err = new Error(e && e.message); err.code = c === 'permission-denied' ? 'invalid_argument' : (c === 'resource-exhausted' ? 'quota_exceeded' : c); return err; };
const snapOf = s => ({ exists: s.exists(), data: () => s.data(), metadata: { hasPendingWrites: s.metadata.hasPendingWrites } });
const onErr = cb => e => cb && cb({ code: e.code === 'permission-denied' ? 'revoked' : e.code });

const dbApi = {
  doc(path) {
    const ref = doc(fs, path);
    return {
      path,
      onSnapshot: (cb, err) => onSnapshot(ref, { includeMetadataChanges: false }, s => cb(snapOf(s)), onErr(err)),
      set: v => setDoc(ref, v).catch(e => { throw wrapErr(e); }),
      // 아티팩트 db의 update는 중첩 필드를 합쳐 씀 → Firestore merge로 동일하게
      update: v => setDoc(ref, v, { merge: true }).catch(e => { throw wrapErr(e); })
    };
  },
  collection(path) {
    return {
      onSnapshot: (cb, err) => onSnapshot(collection(fs, path), q => cb({ docs: q.docs.map(d => ({ id: d.id, data: () => d.data() })) }), onErr(err))
    };
  }
};

let me = null;
const userApi = {
  id: async () => me.uid,
  can: async () => true,
  profiles: async ids => {
    const out = {};
    await Promise.all([...new Set(ids)].map(async id => { try { const s = await getDoc(doc(fs, 'users', id)); if (s.exists()) out[id] = { name: s.data().name || s.data().email }; } catch (e) {} }));
    return out;
  }
};

// ---------- 도면 이미지 (공개 저장소에 두지 않고 Firestore assets에서 불러옴) ----------
async function loadPlans() {
  const names = ['plan4.png', 'plan5.png', 'plan6.png', 'plan7.png'];
  const plans = {};
  await Promise.all(names.map(async n => { const s = await getDoc(doc(fs, 'assets', n)); if (s.exists()) plans[n] = s.data().data; }));
  return plans;
}

// ---------- 초기 데이터 가져오기 (관리자, 최초 1회) ----------
function importUI() {
  const box = document.createElement('div'); box.id = 'importBox';
  const p = document.createElement('p'); p.textContent = '아직 공정 데이터가 없습니다. 전달받은 초기 데이터 파일(unseo-seed.json)을 선택하면 도면·구역·공정·진척이 한 번에 들어갑니다.';
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  const st = document.createElement('div'); st.style.marginTop = '8px';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    st.textContent = '가져오는 중…';
    try {
      const seed = JSON.parse(await f.text());
      const b = writeBatch(fs);
      b.set(doc(fs, 'config', 'processes'), seed.processes);
      b.set(doc(fs, 'config', 'zones'), seed.zones);
      Object.entries(seed.status || {}).forEach(([id, v]) => b.set(doc(fs, 'status', id), v));
      await b.commit();
      for (const [n, url] of Object.entries(seed.plans || {})) await setDoc(doc(fs, 'assets', n), { data: url });
      st.textContent = '완료했습니다. 화면을 다시 불러옵니다.';
      setTimeout(() => location.reload(), 800);
    } catch (e) { st.textContent = '가져오지 못했습니다: ' + (e.code || e.message); st.className = 'err'; }
  };
  box.append(p, inp, st); return box;
}

// ---------- 로그인 흐름 ----------
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
async function login() {
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) await signInWithRedirect(auth, provider);
    else showGate('로그인하지 못했습니다 (' + e.code + ').', true, [btn('다시 시도', login)]);
  }
}
getRedirectResult(auth).catch(() => {});

let started = false;
onAuthStateChanged(auth, async u => {
  if (!u) { showGate('등록된 구글 계정으로 로그인해 주세요.', false, [btn('구글 계정으로 로그인', login)]); return; }
  if (started) return;
  showGate('권한을 확인하는 중입니다…');
  const email = (u.email || '').toLowerCase();
  let access;
  try { access = await getDoc(doc(fs, 'access', email)); } catch (e) { access = null; }
  if (!access || !access.exists()) {
    showGate(email + ' 계정은 아직 등록되지 않았습니다. 관리자에게 이 이메일 등록을 요청해 주세요.', true, [btn('다른 계정으로 로그인', () => signOut(auth), true)]);
    return;
  }
  me = u;
  try { await setDoc(doc(fs, 'users', u.uid), { name: u.displayName || email, email }, { merge: true }); } catch (e) {}
  let hasZones = false;
  try { hasZones = (await getDoc(doc(fs, 'config', 'zones'))).exists(); } catch (e) {}
  if (!hasZones) {
    if (access.data().admin) { showGate('초기 설정', false, [importUI()]); }
    else showGate('관리자가 아직 초기 데이터를 넣지 않았습니다.', true);
    return;
  }
  try { window.PLANS = await loadPlans(); } catch (e) { window.PLANS = {}; }
  window.claude = { use: async k => k === 'db' ? dbApi : k === 'user' ? userApi : null };
  started = true; gate.hidden = true;
  window.startApp();
  addAccountBar(u);
});

function addAccountBar(u) {
  const head = document.querySelector('header.top .sub'); if (!head) return;
  const s = document.createElement('div'); s.style.cssText = 'font-size:12px;color:var(--muted);margin-top:2px';
  s.append((u.displayName || u.email) + ' · ');
  const a = document.createElement('a'); a.href = '#'; a.textContent = '로그아웃'; a.style.color = 'var(--blue)';
  a.onclick = e => { e.preventDefault(); signOut(auth).then(() => location.reload()); };
  s.append(a); head.after(s);
}
