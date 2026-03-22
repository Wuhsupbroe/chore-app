// ===== FIREBASE SETUP =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, onSnapshot, orderBy, serverTimestamp, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDkrzifUy1sCGvuniL312Pp7Lh13Wt2DKI",
  authDomain: "login-app-b0f88.firebaseapp.com",
  projectId: "login-app-b0f88",
  storageBucket: "login-app-b0f88.firebasestorage.app",
  messagingSenderId: "760154109686",
  appId: "1:760154109686:web:42670bf2f61ed599b89ed7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// ===== CONSTANTS =====
const EMOJIS = ['👦','👧','🧒','👶','🧑','🧒‍♀️','🐶','🐱','🦊','🐸','🦁','🐯','🐻','🐼','🦄','🐙','🦋','⭐','🌈','🚀','🎮','⚽','🎨','🎵','🌟'];
const COLORS = ['blue','purple','pink','orange','green','teal','red','yellow'];
const COLOR_HEX = { blue:'#007AFF', purple:'#AF52DE', pink:'#FF2D55', orange:'#FF9500', green:'#34C759', teal:'#5AC8FA', red:'#FF3B30', yellow:'#FFCC00' };

const CHORE_ICONS = { daily: '🔄', weekly: '📅', monthly: '🗓️' };
const CHORE_EMOJIS = ['🧹','🍽️','🗑️','🛁','🌿','🐾','📚','🚗','🧺','🛒','💊','🐕','🐈','🍳','🧼','🪴','📦','🎒'];

const BADGES = [
  { id:'first_chore', emoji:'🌱', name:'First Step', desc:'Complete your first chore', threshold: 1, type:'count' },
  { id:'five_chores', emoji:'⭐', name:'Rising Star', desc:'Complete 5 chores', threshold: 5, type:'count' },
  { id:'ten_chores', emoji:'🔥', name:'On Fire', desc:'Complete 10 chores', threshold: 10, type:'count' },
  { id:'twenty_five', emoji:'💎', name:'Diamond', desc:'Complete 25 chores', threshold: 25, type:'count' },
  { id:'fifty', emoji:'👑', name:'Champion', desc:'Complete 50 chores', threshold: 50, type:'count' },
  { id:'streak_3', emoji:'🌊', name:'On a Roll', desc:'3 day streak', threshold: 3, type:'streak' },
  { id:'streak_7', emoji:'🏆', name:'Week Warrior', desc:'7 day streak', threshold: 7, type:'streak' },
  { id:'points_50', emoji:'💰', name:'Points Collector', desc:'Earn 50 points', threshold: 50, type:'points' },
  { id:'points_100', emoji:'🎯', name:'Century Club', desc:'Earn 100 points', threshold: 100, type:'points' },
  { id:'points_500', emoji:'🚀', name:'Legend', desc:'Earn 500 points', threshold: 500, type:'points' },
];

// ===== STATE =====
let state = {
  mode: null, // 'parent' | 'kid'
  user: null,
  familyId: null,
  familyData: null,
  kids: [],
  chores: [],
  completions: [],
  // kid specific
  currentKid: null,
  currentKidData: null,
  // temp join flow
  joinFamilyId: null,
  joinSelectedKid: null,
  // listeners
  unsubscribers: [],
  // filter
  choreFilter: 'all',
  // edit
  editChoreId: null,
};

// ===== UTILITIES =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  el.style.display = 'block';
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => { el.style.display = 'none'; }, 300); }, 2800);
}

function showModal(id) { document.getElementById(id).style.display = 'flex'; }
function hideModal(id) { document.getElementById(id).style.display = 'none'; }

function confirm(title, msg) {
  return new Promise(resolve => {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = msg;
    showModal('confirm-dialog');
    const ok = document.getElementById('confirm-ok');
    const cancel = document.getElementById('confirm-cancel');
    const cleanup = (v) => { hideModal('confirm-dialog'); ok.onclick = null; cancel.onclick = null; resolve(v); };
    ok.onclick = () => cleanup(true);
    cancel.onclick = () => cleanup(false);
  });
}

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getInviteUrl(code) {
  return `${location.origin}${location.pathname}?join=${code}`;
}

function timeAgo(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getDayOfWeek() { return new Date().toLocaleDateString('en-US', {weekday:'long'}); }

// ===== FIRESTORE HELPERS =====
async function getFamilyByInviteCode(code) {
  const q = query(collection(db, 'families'), where('inviteCode', '==', code));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

async function getKidsForFamily(familyId) {
  const snap = await getDocs(collection(db, `families/${familyId}/kids`));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ===== AUTH =====
function setupAuthListeners() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab + '-form').classList.add('active');
    });
  });

  document.getElementById('login-btn').onclick = async () => {
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;
    if (!email || !pass) { toast('Please fill in all fields', 'error'); return; }
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch(e) { toast(friendlyAuthError(e), 'error'); }
  };

  document.getElementById('signup-btn').onclick = async () => {
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const pass = document.getElementById('signup-password').value;
    if (!name || !email || !pass) { toast('Please fill in all fields', 'error'); return; }
    if (pass.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName: name });
    } catch(e) { toast(friendlyAuthError(e), 'error'); }
  };

  const googleLogin = async () => {
    try { await signInWithPopup(auth, googleProvider); } catch(e) { toast(friendlyAuthError(e), 'error'); }
  };
  document.getElementById('google-login-btn').onclick = googleLogin;
  document.getElementById('google-signup-btn').onclick = googleLogin;

  document.getElementById('kid-login-link').onclick = (e) => { e.preventDefault(); showKidJoinFlow(); };
}

function friendlyAuthError(e) {
  const code = e.code || '';
  if (code.includes('user-not-found') || code.includes('wrong-password') || code.includes('invalid-credential')) return 'Invalid email or password.';
  if (code.includes('email-already-in-use')) return 'That email is already registered.';
  if (code.includes('weak-password')) return 'Password is too weak.';
  if (code.includes('invalid-email')) return 'Please enter a valid email.';
  if (code.includes('popup-closed')) return 'Sign-in was cancelled.';
  return 'Something went wrong. Please try again.';
}

// ===== KID JOIN FLOW =====
function showKidJoinFlow() {
  // Check if URL has ?join= param
  const urlCode = new URLSearchParams(location.search).get('join');
  if (urlCode) {
    document.getElementById('join-code-input').value = urlCode;
  }
  showScreen('kid-join-screen');
  document.getElementById('join-family-lookup').style.display = 'block';
  document.getElementById('join-family-select').style.display = 'none';
  document.getElementById('join-set-pin').style.display = 'none';
}

function setupKidJoinListeners() {
  document.getElementById('back-to-auth-btn').onclick = () => showScreen('auth-screen');
  document.getElementById('back-to-code-btn').onclick = () => {
    document.getElementById('join-family-lookup').style.display = 'block';
    document.getElementById('join-family-select').style.display = 'none';
  };
  document.getElementById('back-to-select-btn').onclick = () => {
    document.getElementById('join-family-select').style.display = 'block';
    document.getElementById('join-set-pin').style.display = 'none';
  };

  document.getElementById('find-family-btn').onclick = async () => {
    const code = document.getElementById('join-code-input').value.trim().toUpperCase();
    if (!code) { toast('Enter a family code', 'error'); return; }
    const family = await getFamilyByInviteCode(code);
    if (!family) { toast('Family not found. Check the code!', 'error'); return; }
    state.joinFamilyId = family.id;
    document.getElementById('join-family-name').textContent = family.name;
    const kids = await getKidsForFamily(family.id);
    renderKidSelectList(kids);
    document.getElementById('join-family-lookup').style.display = 'none';
    document.getElementById('join-family-select').style.display = 'block';
  };

  document.getElementById('set-pin-btn').onclick = async () => {
    const digits = [...document.querySelectorAll('#join-set-pin .pin-digit')];
    const pin = digits.map(d => d.value).join('');
    if (pin.length !== 4) { toast('Enter a 4-digit PIN', 'error'); return; }
    const kid = state.joinSelectedKid;
    if (!kid) return;
    // Save PIN to kid record
    try {
      await updateDoc(doc(db, `families/${state.joinFamilyId}/kids/${kid.id}`), { pin, hasJoined: true });
      toast('Welcome to ChoreQuest! 🎉', 'success');
      // Store kid session
      sessionStorage.setItem('kidSession', JSON.stringify({ familyId: state.joinFamilyId, kidId: kid.id }));
      // Clear URL params
      window.history.replaceState({}, '', location.pathname);
      loadKidDashboard(state.joinFamilyId, kid.id);
    } catch(e) { toast('Error saving PIN', 'error'); console.error(e); }
  };

  // PIN input auto-advance
  document.querySelectorAll('#join-set-pin .pin-digit').forEach(setupPinDigit);
}

function renderKidSelectList(kids) {
  const list = document.getElementById('kid-select-list');
  list.innerHTML = '';
  if (kids.length === 0) {
    list.innerHTML = '<p class="helper-text" style="text-align:center;padding:20px">No kids in this family yet. Ask a parent to add you!</p>';
    return;
  }
  kids.forEach(kid => {
    const item = document.createElement('div');
    item.className = 'kid-select-item';
    item.innerHTML = `<div class="kid-select-emoji">${kid.emoji || '👦'}</div><div><div class="kid-select-name">${kid.name}</div><div class="kid-select-age">Age ${kid.age}</div></div>`;
    item.onclick = () => {
      document.querySelectorAll('.kid-select-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      state.joinSelectedKid = kid;
      // Show set PIN
      const display = document.getElementById('joining-kid-display');
      display.innerHTML = `<div class="jkd-emoji">${kid.emoji || '👦'}</div><div class="jkd-name">Hi, ${kid.name}!</div>`;
      document.querySelectorAll('#join-set-pin .pin-digit').forEach(d => d.value = '');
      document.getElementById('join-family-select').style.display = 'none';
      document.getElementById('join-set-pin').style.display = 'block';
    };
    list.appendChild(item);
  });
}

// ===== KID PIN LOGIN =====
function showKidPinScreen(familyId, kidId, kidData) {
  document.getElementById('kid-pin-emoji').textContent = kidData.emoji || '👦';
  document.getElementById('kid-pin-name').textContent = `Hey ${kidData.nickname || kidData.name}!`;
  document.querySelectorAll('.login-pin').forEach(d => d.value = '');
  document.getElementById('pin-error').style.display = 'none';
  showScreen('kid-pin-screen');
  document.querySelectorAll('.login-pin').forEach(setupPinDigit);

  document.getElementById('verify-pin-btn').onclick = async () => {
    const pin = [...document.querySelectorAll('.login-pin')].map(d => d.value).join('');
    if (pin.length !== 4) { toast('Enter your 4-digit PIN', 'error'); return; }
    if (pin === kidData.pin) {
      document.getElementById('pin-error').style.display = 'none';
      sessionStorage.setItem('kidSession', JSON.stringify({ familyId, kidId }));
      loadKidDashboard(familyId, kidId);
    } else {
      document.getElementById('pin-error').style.display = 'block';
      document.querySelectorAll('.login-pin').forEach(d => d.value = '');
      document.querySelectorAll('.login-pin')[0].focus();
    }
  };

  document.getElementById('switch-kid-btn').onclick = () => {
    sessionStorage.removeItem('kidSession');
    showKidJoinFlow();
  };
  document.getElementById('back-to-main-auth').onclick = () => {
    sessionStorage.removeItem('kidSession');
    showScreen('auth-screen');
  };
}

// ===== PIN DIGIT HELPER =====
function setupPinDigit(input) {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(-1);
    const idx = parseInt(input.dataset.index);
    const parent = input.parentElement;
    const next = parent.querySelector(`[data-index="${idx + 1}"]`);
    if (input.value && next) next.focus();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !input.value) {
      const idx = parseInt(input.dataset.index);
      const parent = input.parentElement;
      const prev = parent.querySelector(`[data-index="${idx - 1}"]`);
      if (prev) { prev.value = ''; prev.focus(); }
    }
  });
}

// ===== AUTH STATE CHANGE =====
onAuthStateChanged(auth, async (user) => {
  if (user) {
    state.user = user;
    // Check for existing family
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists() && userDoc.data().familyId) {
      state.familyId = userDoc.data().familyId;
      loadParentDashboard();
    } else {
      showScreen('setup-screen');
    }
  } else {
    state.user = null;
    // Check for kid session
    const session = sessionStorage.getItem('kidSession');
    if (session) {
      try {
        const { familyId, kidId } = JSON.parse(session);
        const kidDoc = await getDoc(doc(db, `families/${familyId}/kids/${kidId}`));
        if (kidDoc.exists()) {
          const kidData = { id: kidId, ...kidDoc.data() };
          if (kidData.pin) {
            showKidPinScreen(familyId, kidId, kidData);
          } else {
            sessionStorage.removeItem('kidSession');
            showScreen('auth-screen');
          }
        } else {
          sessionStorage.removeItem('kidSession');
          showScreen('auth-screen');
        }
      } catch { showScreen('auth-screen'); }
    } else {
      // Check URL for join code
      const urlCode = new URLSearchParams(location.search).get('join');
      if (urlCode) { showKidJoinFlow(); } else { showScreen('auth-screen'); }
    }
  }
});

// ===== FAMILY SETUP =====
function setupFamilySetupListeners() {
  document.getElementById('create-family-btn').onclick = async () => {
    const name = document.getElementById('family-name-input').value.trim();
    if (!name) { toast('Enter a family name', 'error'); return; }
    try {
      const inviteCode = generateCode();
      const familyRef = await addDoc(collection(db, 'families'), {
        name, parentUid: state.user.uid, inviteCode, createdAt: serverTimestamp()
      });
      await setDoc(doc(db, 'users', state.user.uid), { familyId: familyRef.id, role: 'parent' });
      state.familyId = familyRef.id;
      toast('Family created! 🎉', 'success');
      loadParentDashboard();
    } catch(e) { toast('Error creating family', 'error'); console.error(e); }
  };
}

// ===== PARENT DASHBOARD =====
async function loadParentDashboard() {
  showScreen('parent-screen');
  state.mode = 'parent';
  // Clear old listeners
  state.unsubscribers.forEach(u => u());
  state.unsubscribers = [];

  // Subscribe to family data
  const famUnsub = onSnapshot(doc(db, 'families', state.familyId), snap => {
    if (snap.exists()) {
      state.familyData = { id: snap.id, ...snap.data() };
      document.getElementById('family-name-nav').textContent = state.familyData.name;
      renderInviteLink();
    }
  });
  state.unsubscribers.push(famUnsub);

  // Subscribe to kids
  const kidsUnsub = onSnapshot(collection(db, `families/${state.familyId}/kids`), snap => {
    state.kids = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderParentViews();
  });
  state.unsubscribers.push(kidsUnsub);

  // Subscribe to chores
  const choresUnsub = onSnapshot(collection(db, `families/${state.familyId}/chores`), snap => {
    state.chores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderParentViews();
  });
  state.unsubscribers.push(choresUnsub);

  // Subscribe to completions
  const compUnsub = onSnapshot(
    query(collection(db, `families/${state.familyId}/completions`), orderBy('timestamp', 'desc')),
    snap => {
      state.completions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderParentViews();
      updatePendingBadge();
    }
  );
  state.unsubscribers.push(compUnsub);
}

function renderParentViews() {
  renderOverview();
  renderChoresView();
  renderKidsView();
  renderApprovalsView();
}

function renderOverview() {
  // Stats
  const pending = state.completions.filter(c => c.status === 'pending').length;
  const approved = state.completions.filter(c => c.status === 'approved').length;
  const totalPoints = state.kids.reduce((a, k) => a + (k.points || 0), 0);
  const grid = document.getElementById('family-stats-grid');
  grid.innerHTML = `
    <div class="stat-card"><div class="stat-value">${state.kids.length}</div><div class="stat-label">Kids</div></div>
    <div class="stat-card"><div class="stat-value">${state.chores.length}</div><div class="stat-label">Chores</div></div>
    <div class="stat-card"><div class="stat-value">${pending}</div><div class="stat-label">Pending</div></div>
    <div class="stat-card"><div class="stat-value">${totalPoints}</div><div class="stat-label">Points Earned</div></div>
  `;

  // Kids overview
  const kList = document.getElementById('kids-overview-list');
  if (state.kids.length === 0) {
    kList.innerHTML = '<div class="empty-state"><div class="empty-icon">👶</div><p>No kids yet. Add your first kid!</p></div>';
  } else {
    kList.innerHTML = state.kids.map(k => {
      const kidPending = state.completions.filter(c => c.kidId === k.id && c.status === 'pending').length;
      return `<div class="kid-overview-card">
        <div class="kid-overview-emoji">${k.emoji || '👦'}</div>
        <div class="kid-overview-name">${k.nickname || k.name}</div>
        <div class="kid-overview-points">⭐ ${k.points || 0} pts</div>
        ${kidPending ? `<div class="kid-overview-pending">⏳ ${kidPending} pending</div>` : ''}
      </div>`;
    }).join('');
  }

  // Today's chores
  const today = getToday();
  const todaysChores = state.chores.filter(c => {
    if (c.frequency === 'daily') return true;
    if (c.frequency === 'weekly') return new Date().getDay() === 1; // Monday
    return false;
  });
  const tList = document.getElementById('todays-chores-list');
  if (todaysChores.length === 0) {
    tList.innerHTML = '<div class="empty-state"><div class="empty-icon">🎉</div><p>No chores today!</p></div>';
  } else {
    tList.innerHTML = todaysChores.map(c => choreCard(c, 'parent')).join('');
  }
}

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function choreCard(chore, context) {
  const assignedNames = (chore.assignedTo || []).map(kidId => {
    const k = state.kids.find(k => k.id === kidId);
    return k ? `<span class="kid-chip">${k.emoji || '👦'} ${k.name}</span>` : '';
  }).join('');
  const iconEmoji = CHORE_EMOJIS[Math.abs(chore.name?.charCodeAt(0) || 0) % CHORE_EMOJIS.length];
  if (context === 'parent') {
    return `<div class="chore-card" data-id="${chore.id}">
      <div class="chore-icon">${iconEmoji}</div>
      <div class="chore-info">
        <div class="chore-name">${chore.name}</div>
        <div class="chore-meta">
          <span class="chore-tag freq-${chore.frequency}">${chore.frequency}</span>
          <span class="chore-tag points">⭐ ${chore.points}</span>
        </div>
        <div class="assigned-kids">${assignedNames}</div>
      </div>
      <div class="chore-actions">
        <button class="btn-edit" onclick="editChore('${chore.id}')">Edit</button>
        <button class="btn-delete" onclick="deleteChore('${chore.id}')">Delete</button>
      </div>
    </div>`;
  }
  return `<div class="chore-card" data-id="${chore.id}">
    <div class="chore-icon">${iconEmoji}</div>
    <div class="chore-info">
      <div class="chore-name">${chore.name}</div>
      <div class="chore-meta">
        <span class="chore-tag freq-${chore.frequency}">${chore.frequency}</span>
        <span class="chore-tag points">⭐ ${chore.points}</span>
      </div>
    </div>
  </div>`;
}

function renderChoresView() {
  const list = document.getElementById('all-chores-list');
  let filtered = state.chores;
  if (state.choreFilter !== 'all') filtered = filtered.filter(c => c.frequency === state.choreFilter);
  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No chores yet. Add your first chore!</p></div>';
  } else {
    list.innerHTML = filtered.map(c => choreCard(c, 'parent')).join('');
  }
}

function renderKidsView() {
  const list = document.getElementById('kids-management-list');
  if (state.kids.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">👶</div><p>No kids yet. Add your first kid!</p></div>';
  } else {
    list.innerHTML = state.kids.map(k => `
      <div class="kid-mgmt-card">
        <div style="font-size:2rem">${k.emoji || '👦'}</div>
        <div class="kid-mgmt-info">
          <div class="kid-mgmt-name">${k.name}</div>
          <div class="kid-mgmt-meta">Age ${k.age} · ⭐ ${k.points || 0} pts · Streak 🔥${k.streak || 0}</div>
          <div class="kid-mgmt-meta">${k.hasJoined ? '✅ Joined' : '⏳ Not joined yet'}</div>
        </div>
        <div class="kid-mgmt-actions">
          <button class="btn-ghost" onclick="showKidDetails('${k.id}')">Details</button>
        </div>
      </div>
    `).join('');
  }
}

function renderInviteLink() {
  if (!state.familyData) return;
  const url = getInviteUrl(state.familyData.inviteCode);
  document.getElementById('invite-link-display').textContent = url;
}

function renderApprovalsView() {
  const pending = state.completions.filter(c => c.status === 'pending');
  const history = state.completions.filter(c => c.status !== 'pending').slice(0, 20);

  const pList = document.getElementById('approvals-list');
  if (pending.length === 0) {
    pList.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>No pending approvals!</p></div>';
  } else {
    pList.innerHTML = pending.map(c => approvalCard(c, true)).join('');
  }

  const hList = document.getElementById('history-list');
  if (history.length === 0) {
    hList.innerHTML = '<div class="empty-state"><div class="empty-icon">📜</div><p>No history yet.</p></div>';
  } else {
    hList.innerHTML = history.map(c => approvalCard(c, false)).join('');
  }
}

function approvalCard(comp, showActions) {
  const chore = state.chores.find(c => c.id === comp.choreId);
  const kid = state.kids.find(k => k.id === comp.kidId);
  const choreName = chore ? chore.name : 'Unknown chore';
  const kidName = kid ? `${kid.emoji || '👦'} ${kid.name}` : 'Unknown kid';
  const pts = chore ? chore.points : 0;
  return `<div class="approval-card">
    <div style="font-size:1.6rem">${kid ? (kid.emoji || '👦') : '👦'}</div>
    <div class="approval-info">
      <div class="approval-chore-name">${choreName}</div>
      <div class="approval-meta">${kidName} · ${timeAgo(comp.timestamp)} · ⭐ ${pts} pts</div>
    </div>
    ${showActions
      ? `<div class="approval-actions">
          <button class="btn-approve" onclick="approveCompletion('${comp.id}','${comp.kidId}',${pts})">✓</button>
          <button class="btn-reject" onclick="rejectCompletion('${comp.id}')">✗</button>
        </div>`
      : `<div class="status-badge ${comp.status}">${comp.status}</div>`
    }
  </div>`;
}

function updatePendingBadge() {
  const pending = state.completions.filter(c => c.status === 'pending').length;
  const badge = document.getElementById('pending-badge');
  if (pending > 0) { badge.textContent = pending; badge.style.display = 'inline-flex'; }
  else { badge.style.display = 'none'; }
}

// ===== CHORE ACTIONS =====
window.editChore = function(choreId) {
  const chore = state.chores.find(c => c.id === choreId);
  if (!chore) return;
  state.editChoreId = choreId;
  document.getElementById('chore-modal-title').textContent = 'Edit Chore';
  document.getElementById('edit-chore-id').value = choreId;
  document.getElementById('chore-name-input').value = chore.name;
  document.getElementById('chore-desc-input').value = chore.description || '';
  document.getElementById('chore-points-input').value = chore.points;
  document.getElementById('chore-freq-input').value = chore.frequency;
  renderAssignList(chore.assignedTo || []);
  showModal('modal-add-chore');
};

window.deleteChore = async function(choreId) {
  const ok = await confirm('Delete Chore', 'This will permanently delete this chore.');
  if (!ok) return;
  try {
    await deleteDoc(doc(db, `families/${state.familyId}/chores/${choreId}`));
    toast('Chore deleted');
  } catch(e) { toast('Error deleting chore', 'error'); }
};

window.approveCompletion = async function(compId, kidId, points) {
  try {
    await updateDoc(doc(db, `families/${state.familyId}/completions/${compId}`), { status: 'approved' });
    const kidRef = doc(db, `families/${state.familyId}/kids/${kidId}`);
    const kidSnap = await getDoc(kidRef);
    if (kidSnap.exists()) {
      const kidData = kidSnap.data();
      const newPoints = (kidData.points || 0) + points;
      const newStreak = (kidData.streak || 0) + 1;
      await updateDoc(kidRef, { points: newPoints, streak: newStreak });
      await checkAndAwardBadges(kidId, kidData, newPoints, newStreak);
    }
    toast('Chore approved! ⭐', 'success');
  } catch(e) { toast('Error approving', 'error'); console.error(e); }
};

window.rejectCompletion = async function(compId) {
  try {
    await updateDoc(doc(db, `families/${state.familyId}/completions/${compId}`), { status: 'rejected' });
    toast('Chore rejected');
  } catch(e) { toast('Error rejecting', 'error'); }
};

async function checkAndAwardBadges(kidId, kidData, newPoints, newStreak) {
  const snap = await getDocs(collection(db, `families/${state.familyId}/completions`));
  const completedCount = snap.docs.filter(d => d.data().kidId === kidId && d.data().status === 'approved').length;
  const existingBadges = kidData.badges || [];
  const newBadges = [];
  for (const badge of BADGES) {
    if (existingBadges.includes(badge.id)) continue;
    let earned = false;
    if (badge.type === 'count' && completedCount >= badge.threshold) earned = true;
    if (badge.type === 'streak' && newStreak >= badge.threshold) earned = true;
    if (badge.type === 'points' && newPoints >= badge.threshold) earned = true;
    if (earned) newBadges.push(badge.id);
  }
  if (newBadges.length > 0) {
    await updateDoc(doc(db, `families/${state.familyId}/kids/${kidId}`), { badges: [...existingBadges, ...newBadges] });
  }
}

window.showKidDetails = function(kidId) {
  const kid = state.kids.find(k => k.id === kidId);
  if (!kid) return;
  state.editingKidId = kidId;
  const chores = state.chores.filter(c => (c.assignedTo || []).includes(kidId));
  const approved = state.completions.filter(c => c.kidId === kidId && c.status === 'approved').length;
  document.getElementById('kid-details-content').innerHTML = `
    <div style="text-align:center;margin-bottom:20px">
      <div style="font-size:4rem">${kid.emoji || '👦'}</div>
      <h2>${kid.name}</h2>
      <p style="color:var(--text2)">Age ${kid.age}</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${kid.points || 0}</div><div class="stat-label">Points</div></div>
      <div class="stat-card"><div class="stat-value">${kid.streak || 0}</div><div class="stat-label">Streak 🔥</div></div>
      <div class="stat-card"><div class="stat-value">${approved}</div><div class="stat-label">Completed</div></div>
      <div class="stat-card"><div class="stat-value">${chores.length}</div><div class="stat-label">Chores</div></div>
    </div>
    <p style="font-size:0.9rem;color:var(--text2);margin-top:12px">Badges earned: ${(kid.badges || []).length}</p>
    <p style="font-size:0.9rem;color:var(--text2)">Status: ${kid.hasJoined ? '✅ Joined' : '⏳ Not joined yet'}</p>
  `;
  showModal('modal-kid-details');
};

// ===== PARENT MODAL SETUP =====
function setupParentModals() {
  // Close buttons
  document.querySelectorAll('.modal-close, [data-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.modal;
      if (modalId) hideModal(modalId);
    });
  });

  // Add chore button
  document.getElementById('add-chore-btn').onclick = () => {
    state.editChoreId = null;
    document.getElementById('chore-modal-title').textContent = 'Add Chore';
    document.getElementById('edit-chore-id').value = '';
    document.getElementById('chore-name-input').value = '';
    document.getElementById('chore-desc-input').value = '';
    document.getElementById('chore-points-input').value = '';
    document.getElementById('chore-freq-input').value = 'daily';
    renderAssignList([]);
    showModal('modal-add-chore');
  };

  // Save chore
  document.getElementById('save-chore-btn').onclick = async () => {
    const name = document.getElementById('chore-name-input').value.trim();
    const description = document.getElementById('chore-desc-input').value.trim();
    const points = parseInt(document.getElementById('chore-points-input').value) || 10;
    const frequency = document.getElementById('chore-freq-input').value;
    const assignedTo = [...document.querySelectorAll('.assign-item.selected')].map(el => el.dataset.kidId);
    if (!name) { toast('Enter a chore name', 'error'); return; }
    try {
      const editId = document.getElementById('edit-chore-id').value;
      if (editId) {
        await updateDoc(doc(db, `families/${state.familyId}/chores/${editId}`), { name, description, points, frequency, assignedTo });
        toast('Chore updated!', 'success');
      } else {
        await addDoc(collection(db, `families/${state.familyId}/chores`), { name, description, points, frequency, assignedTo, createdAt: serverTimestamp() });
        toast('Chore added! 🎉', 'success');
      }
      hideModal('modal-add-chore');
    } catch(e) { toast('Error saving chore', 'error'); console.error(e); }
  };

  // Add kid button
  document.getElementById('add-kid-btn').onclick = () => {
    document.getElementById('kid-name-input').value = '';
    document.getElementById('kid-age-input').value = '';
    renderEmojiPicker('new-kid-emoji-picker', null, 'newKidEmoji');
    state.newKidEmoji = EMOJIS[0];
    showModal('modal-add-kid');
  };

  // Save kid
  document.getElementById('save-kid-btn').onclick = async () => {
    const name = document.getElementById('kid-name-input').value.trim();
    const age = parseInt(document.getElementById('kid-age-input').value) || 0;
    const emoji = state.newKidEmoji || EMOJIS[0];
    if (!name) { toast('Enter kid\'s name', 'error'); return; }
    try {
      await addDoc(collection(db, `families/${state.familyId}/kids`), { name, age, emoji, points: 0, streak: 0, badges: [], hasJoined: false, createdAt: serverTimestamp() });
      toast(`${name} added! 🎉`, 'success');
      hideModal('modal-add-kid');
    } catch(e) { toast('Error adding kid', 'error'); console.error(e); }
  };

  // Remove kid
  document.getElementById('remove-kid-btn').onclick = async () => {
    const ok = await confirm('Remove Kid', 'This will remove this kid from your family. This cannot be undone.');
    if (!ok) return;
    try {
      await deleteDoc(doc(db, `families/${state.familyId}/kids/${state.editingKidId}`));
      toast('Kid removed');
      hideModal('modal-kid-details');
    } catch(e) { toast('Error removing kid', 'error'); }
  };

  // Copy invite link
  document.getElementById('copy-invite-btn').onclick = () => {
    const url = getInviteUrl(state.familyData?.inviteCode || '');
    navigator.clipboard.writeText(url).then(() => toast('Link copied! 📋', 'success')).catch(() => {
      const el = document.getElementById('invite-link-display');
      const range = document.createRange(); range.selectNode(el);
      window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
      toast('Select and copy the link', 'warning');
    });
  };

  // Regen invite code
  document.getElementById('regen-invite-btn').onclick = async () => {
    const ok = await confirm('New Invite Code', 'Old code will no longer work. Generate a new one?');
    if (!ok) return;
    const newCode = generateCode();
    await updateDoc(doc(db, 'families', state.familyId), { inviteCode: newCode });
    toast('New code generated!', 'success');
  };

  // Chore filter pills
  document.querySelectorAll('#chores-filter .pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#chores-filter .pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.choreFilter = pill.dataset.filter;
      renderChoresView();
    });
  });

  // Parent menu
  document.getElementById('parent-menu-btn').onclick = (e) => {
    showDropdown(e.currentTarget, [
      { label: '🏠 ' + (state.familyData?.name || 'Family'), disabled: true },
      { label: '🚪 Log Out', action: () => signOut(auth), danger: false },
    ]);
  };

  // Click outside modal
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.style.display = 'none';
    });
  });
}

function renderAssignList(selected = []) {
  const list = document.getElementById('chore-assign-list');
  if (state.kids.length === 0) {
    list.innerHTML = '<p class="helper-text">Add kids first to assign chores</p>';
    return;
  }
  list.innerHTML = state.kids.map(k => {
    const isSelected = selected.includes(k.id);
    return `<div class="assign-item ${isSelected ? 'selected' : ''}" data-kid-id="${k.id}" onclick="toggleAssign(this)">
      <input type="checkbox" ${isSelected ? 'checked' : ''} readonly />
      <span style="font-size:1.2rem">${k.emoji || '👦'}</span>
      <span>${k.name}</span>
    </div>`;
  }).join('');
}

window.toggleAssign = function(el) {
  el.classList.toggle('selected');
  el.querySelector('input[type="checkbox"]').checked = el.classList.contains('selected');
};

// ===== PARENT TABS =====
function setupParentTabs() {
  document.querySelectorAll('.ptab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.parent-view').forEach(v => v.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('view-' + tab.dataset.view).classList.add('active');
    });
  });
}

// ===== KID DASHBOARD =====
async function loadKidDashboard(familyId, kidId) {
  showScreen('kid-screen');
  state.mode = 'kid';
  state.familyId = familyId;

  // Clear old listeners
  state.unsubscribers.forEach(u => u());
  state.unsubscribers = [];

  // Load kid data
  const kidDoc = await getDoc(doc(db, `families/${familyId}/kids/${kidId}`));
  if (!kidDoc.exists()) { toast('Kid not found', 'error'); return; }
  state.currentKid = kidId;
  state.currentKidData = { id: kidId, ...kidDoc.data() };

  applyKidTheme(state.currentKidData.color || 'blue');

  // Subscribe to kid data
  const kidUnsub = onSnapshot(doc(db, `families/${familyId}/kids/${kidId}`), snap => {
    if (snap.exists()) {
      state.currentKidData = { id: kidId, ...snap.data() };
      applyKidTheme(state.currentKidData.color || 'blue');
      renderKidNav();
      renderKidChoresView();
      renderKidProfileView();
      renderKidBadgesView();
    }
  });
  state.unsubscribers.push(kidUnsub);

  // Subscribe to chores
  const choresUnsub = onSnapshot(collection(db, `families/${familyId}/chores`), snap => {
    state.chores = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => (c.assignedTo || []).includes(kidId));
    renderKidChoresView();
  });
  state.unsubscribers.push(choresUnsub);

  // Subscribe to completions for this kid
  const compUnsub = onSnapshot(
    query(collection(db, `families/${familyId}/completions`), where('kidId', '==', kidId), orderBy('timestamp', 'desc')),
    snap => {
      state.completions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderKidChoresView();
      renderKidBadgesView();
    }
  );
  state.unsubscribers.push(compUnsub);

  // Subscribe to family for family name
  const famUnsub = onSnapshot(doc(db, 'families', familyId), snap => {
    if (snap.exists()) state.familyData = { id: snap.id, ...snap.data() };
  });
  state.unsubscribers.push(famUnsub);

  setupKidTabs();
  setupKidMenuAndProfile();
}

function applyKidTheme(color) {
  document.body.setAttribute('data-kid-color', color);
}

function renderKidNav() {
  const kid = state.currentKidData;
  document.getElementById('kid-nav-emoji').textContent = kid.emoji || '👦';
  document.getElementById('kid-nav-name').textContent = kid.nickname || kid.name;
  document.getElementById('kid-points-display').textContent = `⭐ ${kid.points || 0}`;
}

function renderKidChoresView() {
  const kid = state.currentKidData;
  // Greeting
  document.getElementById('kid-greeting-banner').innerHTML = `${getGreeting()}, ${kid.nickname || kid.name}! 👋<br><span style="font-size:0.9rem;opacity:0.85">${getDayOfWeek()} — let's crush those chores!</span>`;

  // Streak
  document.getElementById('kid-streak-card').innerHTML = `
    <div class="streak-fire">🔥</div>
    <div class="streak-info">
      <div class="streak-count">${kid.streak || 0} day streak</div>
      <div class="streak-label">Keep it going! Approve more chores to extend.</div>
    </div>
  `;

  const today = getToday();
  const todayChores = state.chores.filter(c => c.frequency === 'daily' || (c.frequency === 'weekly' && new Date().getDay() === 1));
  const allChores = state.chores;

  const todayList = document.getElementById('kid-chores-today');
  const allList = document.getElementById('kid-chores-all');

  todayList.innerHTML = todayChores.length === 0
    ? '<div class="empty-state"><div class="empty-icon">🎉</div><p>No chores today!</p></div>'
    : todayChores.map(c => kidChoreCard(c)).join('');

  allList.innerHTML = allChores.length === 0
    ? '<div class="empty-state"><div class="empty-icon">📋</div><p>No chores assigned yet.</p></div>'
    : allChores.map(c => kidChoreCard(c)).join('');
}

function kidChoreCard(chore) {
  const todayKey = `${chore.id}_${getToday()}`;
  const todayComp = state.completions.find(c => {
    const compDate = c.timestamp?.toDate ? c.timestamp.toDate() : new Date(c.timestamp || 0);
    const compKey = `${c.choreId}_${compDate.getFullYear()}-${compDate.getMonth()+1}-${compDate.getDate()}`;
    return c.choreId === chore.id && compKey === todayKey;
  });
  const iconEmoji = CHORE_EMOJIS[Math.abs(chore.name?.charCodeAt(0) || 0) % CHORE_EMOJIS.length];

  let statusIcon = '⭕';
  let statusClass = '';
  if (todayComp) {
    if (todayComp.status === 'pending') { statusIcon = '⏳'; statusClass = 'pending-approval'; }
    else if (todayComp.status === 'approved') { statusIcon = '✅'; statusClass = 'completed'; }
    else if (todayComp.status === 'rejected') { statusIcon = '❌'; statusClass = ''; }
  }

  return `<div class="chore-card ${statusClass}" onclick="markChoreDone('${chore.id}')">
    <div class="chore-icon">${iconEmoji}</div>
    <div class="chore-info">
      <div class="chore-name">${chore.name}</div>
      <div class="chore-meta">
        <span class="chore-tag freq-${chore.frequency}">${chore.frequency}</span>
        <span class="chore-tag points">⭐ ${chore.points}</span>
        ${todayComp ? `<span class="chore-tag">${todayComp.status}</span>` : ''}
      </div>
      ${chore.description ? `<div style="font-size:0.82rem;color:var(--text2);margin-top:4px">${chore.description}</div>` : ''}
    </div>
    <div class="chore-status-icon">${statusIcon}</div>
  </div>`;
}

window.markChoreDone = async function(choreId) {
  const today = getToday();
  const todayComp = state.completions.find(c => {
    const compDate = c.timestamp?.toDate ? c.timestamp.toDate() : new Date(c.timestamp || 0);
    const compDay = `${compDate.getFullYear()}-${compDate.getMonth()+1}-${compDate.getDate()}`;
    return c.choreId === choreId && compDay === today;
  });
  if (todayComp) {
    if (todayComp.status === 'pending') { toast('Already submitted! Waiting for approval ⏳', 'warning'); return; }
    if (todayComp.status === 'approved') { toast('Already approved! Great job ✅', 'success'); return; }
  }
  try {
    await addDoc(collection(db, `families/${state.familyId}/completions`), {
      choreId, kidId: state.currentKid, timestamp: serverTimestamp(), status: 'pending'
    });
    const chore = state.chores.find(c => c.id === choreId);
    showCelebration(chore?.name || 'Chore', chore?.points || 0);
  } catch(e) { toast('Error submitting chore', 'error'); console.error(e); }
};

function showCelebration(choreName, points) {
  document.getElementById('celebration-text').textContent = `"${choreName}" submitted for approval! ⭐ ${points} points on the way!`;
  document.getElementById('celebration').style.display = 'flex';
}

function renderKidProfileView() {
  const kid = state.currentKidData;
  document.getElementById('kid-profile-hero').innerHTML = `
    <div class="hero-emoji">${kid.emoji || '👦'}</div>
    <div class="hero-name">${kid.nickname || kid.name}</div>
    <div class="hero-points">⭐ ${kid.points || 0} points · 🔥 ${kid.streak || 0} streak</div>
  `;
  document.getElementById('kid-nickname-input').value = kid.nickname || '';
  renderEmojiPicker('kid-emoji-picker', kid.emoji, 'kidEmoji');
  state.kidEmoji = kid.emoji || EMOJIS[0];
  renderColorPicker('kid-color-picker', kid.color || 'blue');
  state.kidColor = kid.color || 'blue';
}

function renderKidBadgesView() {
  const kid = state.currentKidData;
  document.getElementById('total-points-display').textContent = `⭐ ${kid.points || 0}`;
  const earnedBadges = kid.badges || [];
  const grid = document.getElementById('badges-grid');
  grid.innerHTML = BADGES.map(badge => {
    const earned = earnedBadges.includes(badge.id);
    return `<div class="badge-card ${earned ? 'earned' : 'locked'}">
      <div class="badge-emoji">${badge.emoji}</div>
      <div class="badge-name">${badge.name}</div>
      <div class="badge-desc">${badge.desc}</div>
    </div>`;
  }).join('');

  // History
  const hList = document.getElementById('kid-history-list');
  if (state.completions.length === 0) {
    hList.innerHTML = '<div class="empty-state"><div class="empty-icon">📜</div><p>No history yet.</p></div>';
  } else {
    hList.innerHTML = state.completions.slice(0, 20).map(comp => {
      const chore = [...state.chores].find(c => c.id === comp.choreId) || { name: 'Unknown', points: 0 };
      const iconEmoji = CHORE_EMOJIS[Math.abs(chore.name?.charCodeAt(0) || 0) % CHORE_EMOJIS.length];
      return `<div class="chore-card">
        <div class="chore-icon">${iconEmoji}</div>
        <div class="chore-info">
          <div class="chore-name">${chore.name}</div>
          <div class="chore-meta">
            <span class="chore-tag points">⭐ ${chore.points}</span>
            <span class="status-badge ${comp.status}">${comp.status}</span>
            <span style="font-size:0.78rem;color:var(--text3)">${timeAgo(comp.timestamp)}</span>
          </div>
        </div>
      </div>`;
    }).join('');
  }
}

// ===== EMOJI & COLOR PICKERS =====
function renderEmojiPicker(containerId, selected, stateKey) {
  const container = document.getElementById(containerId);
  container.innerHTML = EMOJIS.map(emoji => `
    <div class="emoji-option ${emoji === selected ? 'selected' : ''}" data-emoji="${emoji}" onclick="selectEmoji('${containerId}', '${emoji}', '${stateKey}')">
      ${emoji}
    </div>
  `).join('');
}

window.selectEmoji = function(containerId, emoji, stateKey) {
  document.querySelectorAll(`#${containerId} .emoji-option`).forEach(e => e.classList.remove('selected'));
  document.querySelector(`#${containerId} [data-emoji="${emoji}"]`)?.classList.add('selected');
  state[stateKey] = emoji;
  // Update hero if kid profile
  if (stateKey === 'kidEmoji' && state.currentKidData) {
    document.querySelector('.profile-hero .hero-emoji').textContent = emoji;
  }
  if (stateKey === 'newKidEmoji') state.newKidEmoji = emoji;
};

function renderColorPicker(containerId, selected) {
  const container = document.getElementById(containerId);
  container.innerHTML = COLORS.map(color => `
    <div class="color-option ${color === selected ? 'selected' : ''}"
         style="background:${COLOR_HEX[color]}"
         data-color="${color}"
         onclick="selectColor('${containerId}', '${color}')">
    </div>
  `).join('');
}

window.selectColor = function(containerId, color) {
  document.querySelectorAll(`#${containerId} .color-option`).forEach(e => e.classList.remove('selected'));
  document.querySelector(`#${containerId} [data-color="${color}"]`)?.classList.add('selected');
  state.kidColor = color;
  applyKidTheme(color);
};

// ===== KID TABS & MENU =====
function setupKidTabs() {
  document.querySelectorAll('.ktab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ktab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.kid-view').forEach(v => v.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('view-' + tab.dataset.view).classList.add('active');
      if (tab.dataset.view === 'kid-profile') renderKidProfileView();
      if (tab.dataset.view === 'kid-badges') renderKidBadgesView();
    });
  });
}

function setupKidMenuAndProfile() {
  document.getElementById('kid-menu-btn').onclick = (e) => {
    showDropdown(e.currentTarget, [
      { label: `👤 ${state.currentKidData?.name}`, disabled: true },
      { label: '🔄 Switch Kid', action: () => { sessionStorage.removeItem('kidSession'); showKidJoinFlow(); } },
      { label: '🔐 Parent Login', action: () => { sessionStorage.removeItem('kidSession'); showScreen('auth-screen'); } },
    ]);
  };

  document.getElementById('save-profile-btn').onclick = async () => {
    const nickname = document.getElementById('kid-nickname-input').value.trim();
    try {
      await updateDoc(doc(db, `families/${state.familyId}/kids/${state.currentKid}`), {
        nickname: nickname || state.currentKidData.name,
        emoji: state.kidEmoji || state.currentKidData.emoji,
        color: state.kidColor || state.currentKidData.color || 'blue',
      });
      toast('Profile saved! ✨', 'success');
    } catch(e) { toast('Error saving profile', 'error'); console.error(e); }
  };

  document.getElementById('celebration-close').onclick = () => {
    document.getElementById('celebration').style.display = 'none';
  };
}

// ===== DROPDOWN MENU =====
function showDropdown(anchor, items) {
  const menu = document.getElementById('dropdown-menu');
  const container = document.getElementById('dropdown-items');
  container.innerHTML = items.map((item, i) => {
    if (item.disabled) return `<div class="dropdown-item" style="pointer-events:none;opacity:0.5;font-weight:600">${item.label}</div>`;
    return `<div class="dropdown-item ${item.danger ? 'danger' : ''}" data-idx="${i}">${item.label}</div>`;
  }).join('');

  const rect = anchor.getBoundingClientRect();
  menu.style.top = (rect.bottom + 8) + 'px';
  menu.style.right = (window.innerWidth - rect.right) + 'px';
  menu.style.left = 'auto';
  menu.style.display = 'block';

  container.querySelectorAll('[data-idx]').forEach(el => {
    el.addEventListener('click', () => {
      const item = items[parseInt(el.dataset.idx)];
      if (item.action) item.action();
      menu.style.display = 'none';
    });
  });
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('dropdown-menu');
  if (!menu.contains(e.target)) menu.style.display = 'none';
});

// ===== INIT =====
function init() {
  setupAuthListeners();
  setupKidJoinListeners();
  setupFamilySetupListeners();
  setupParentModals();
  setupParentTabs();

  // Check URL for join code on load
  const urlCode = new URLSearchParams(location.search).get('join');
  if (urlCode && !auth.currentUser) {
    showKidJoinFlow();
  }
}

// Wait for DOM + firebase to initialize
window.addEventListener('DOMContentLoaded', () => {
  init();
  // Hide loading after a brief moment (auth state will handle routing)
  setTimeout(() => {
    if (document.getElementById('loading-screen').classList.contains('active')) {
      showScreen('auth-screen');
    }
  }, 3000);
});
