// ===== FIREBASE =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, onSnapshot, getDocs, serverTimestamp
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
const EMOJIS = ['🧒','👦','👧','🧑','👱','🧔','👩','🧒‍♂️','🐶','🐱','🦊','🐻','🐼','🦁','🐯','🐸','🐧','🦋','🌟','⚡','🌈','🎮','🚀','🏆','🎯'];

const BADGES = [
  { id: 'first',   icon: '🌱', name: 'First Step',       desc: 'Complete 1 chore',    check: (s) => s.total >= 1 },
  { id: 'five',    icon: '⭐', name: 'Rising Star',       desc: 'Complete 5 chores',   check: (s) => s.total >= 5 },
  { id: 'ten',     icon: '🔥', name: 'On Fire',           desc: 'Complete 10 chores',  check: (s) => s.total >= 10 },
  { id: 'pts50',   icon: '💰', name: 'Points Collector',  desc: 'Earn 50 points',      check: (s) => s.points >= 50 },
  { id: 'pts100',  icon: '💎', name: 'Century Club',      desc: 'Earn 100 points',     check: (s) => s.points >= 100 },
  { id: 'streak3', icon: '🔗', name: 'On a Roll',         desc: '3-day streak',        check: (s) => s.streak >= 3 },
  { id: 'streak7', icon: '📅', name: 'Week Warrior',      desc: '7-day streak',        check: (s) => s.streak >= 7 },
  { id: 'champ',   icon: '🏆', name: 'Champion',          desc: 'Complete 50 chores',  check: (s) => s.total >= 50 },
  { id: 'pts500',  icon: '👑', name: 'Legend',            desc: 'Earn 500 points',     check: (s) => s.points >= 500 },
];

// ===== STATE =====
const state = {
  user: null,
  familyId: null,
  familyData: null,
  kids: [],
  chores: [],
  completions: [],
  currentKid: null,
  currentKidData: null,
  joinFamilyId: null,
  joinSelectedKid: null,
  isSignup: false,
  listeners: [],   // unsubscribe fns
};

// ===== SCREEN NAV =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

// ===== TOAST =====
let toastTimer;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

// ===== MODAL =====
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// ===== TABS =====
function setupTabs(navSelector) {
  document.querySelectorAll(navSelector + ' .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      const nav = btn.closest('.tab-nav');
      const content = nav.nextElementSibling;
      nav.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      content.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      const panel = content.querySelector('#tab-' + tab);
      if (panel) panel.classList.add('active');
    });
  });
}

// ===== HELPERS =====
function randomCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < len; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function hashPin(pin) {
  // Simple XOR hash for PIN (not cryptographic, fine for kid PINs)
  let h = 0;
  for (let i = 0; i < pin.length; i++) h = (h * 31 + pin.charCodeAt(i)) & 0xffffffff;
  return h.toString(16);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function clearListeners() {
  state.listeners.forEach(unsub => { try { unsub(); } catch(e){} });
  state.listeners = [];
}

// ===== URL JOIN CODE =====
function getJoinCodeFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('join') || '';
}

// ===== INIT =====
setupTabs('#screen-parent-dashboard .tab-nav');
setupTabs('#screen-kid-dashboard .tab-nav');

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });
});
document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.modal));
});

// Build emoji pickers
function buildEmojiPicker(containerId, selectedVal, onSelect) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  EMOJIS.forEach(em => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-opt' + (em === selectedVal ? ' selected' : '');
    btn.textContent = em;
    btn.addEventListener('click', () => {
      container.querySelectorAll('.emoji-opt').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      onSelect(em);
    });
    container.appendChild(btn);
  });
}

// ===== AUTH SCREEN =====
let isSignup = false;

let parentFlowInitiated = false;

document.getElementById('btn-parent-role').addEventListener('click', () => {
  parentFlowInitiated = true;
  showScreen('screen-parent-auth');
});

document.getElementById('auth-back').addEventListener('click', () => {
  showScreen('screen-landing');
});

document.getElementById('auth-toggle-btn').addEventListener('click', () => {
  isSignup = !isSignup;
  document.getElementById('auth-title').textContent = isSignup ? 'Create account' : 'Welcome back';
  document.getElementById('auth-subtitle').textContent = isSignup ? 'Sign up to manage your family' : 'Sign in to manage your family';
  document.getElementById('auth-submit').textContent = isSignup ? 'Sign Up' : 'Sign In';
  document.getElementById('auth-toggle-text').textContent = isSignup ? 'Already have an account?' : "Don't have an account?";
  document.getElementById('auth-toggle-btn').textContent = isSignup ? 'Sign in' : 'Sign up';
});

document.getElementById('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const pass = document.getElementById('auth-password').value;
  const btn = document.getElementById('auth-submit');
  btn.disabled = true;
  btn.textContent = '...';
  try {
    if (isSignup) {
      await createUserWithEmailAndPassword(auth, email, pass);
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
    }
  } catch (err) {
    toast(friendlyAuthError(err.code), 'error');
    btn.disabled = false;
    btn.textContent = isSignup ? 'Sign Up' : 'Sign In';
  }
});

document.getElementById('btn-google').addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    toast(friendlyAuthError(err.code), 'error');
  }
});

function friendlyAuthError(code) {
  if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') return 'Invalid email or password.';
  if (code === 'auth/email-already-in-use') return 'Email already in use.';
  if (code === 'auth/weak-password') return 'Password must be at least 6 characters.';
  if (code === 'auth/invalid-email') return 'Invalid email address.';
  if (code === 'auth/popup-closed-by-user') return 'Sign-in cancelled.';
  return 'Something went wrong. Please try again.';
}

// ===== AUTH STATE =====
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Only proceed with parent flow if user explicitly started it.
    // This prevents a stale Firebase session from skipping the landing page.
    if (!parentFlowInitiated) return;
    state.user = user;
    // Find family for this parent
    const q = query(collection(db, 'families'), where('ownerId', '==', user.uid));
    const snap = await getDocs(q);
    if (snap.empty) {
      showScreen('screen-create-family');
    } else {
      const familyDoc = snap.docs[0];
      state.familyId = familyDoc.id;
      state.familyData = familyDoc.data();
      loadParentDashboard();
    }
  } else {
    state.user = null;
    state.familyId = null;
    state.familyData = null;
    clearListeners();
    // Don't forcibly go to landing if a kid is logged in
    if (!state.currentKid) {
      const kidSession = sessionStorage.getItem('kidSession');
      if (!kidSession) showScreen('screen-landing');
    }
  }
});

// ===== CREATE FAMILY =====
document.getElementById('family-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('family-name-input').value.trim();
  if (!name) return;
  try {
    const inviteCode = randomCode(6);
    const ref = await addDoc(collection(db, 'families'), {
      name,
      ownerId: state.user.uid,
      ownerEmail: state.user.email,
      inviteCode,
      createdAt: serverTimestamp()
    });
    state.familyId = ref.id;
    state.familyData = { name, inviteCode };
    toast('Family created!', 'success');
    loadParentDashboard();
  } catch (err) {
    toast('Error creating family.', 'error');
    console.error(err);
  }
});

// Back button on create-family screen — sign out and return to landing
document.getElementById('create-family-back').addEventListener('click', async () => {
  parentFlowInitiated = false;
  await signOut(auth);
  showScreen('screen-landing');
});

// ===== LOGOUT =====
document.getElementById('btn-logout-parent').addEventListener('click', async () => {
  parentFlowInitiated = false;
  clearListeners();
  await signOut(auth);
  showScreen('screen-landing');
});

document.getElementById('btn-logout-kid').addEventListener('click', () => {
  sessionStorage.removeItem('kidSession');
  state.currentKid = null;
  state.currentKidData = null;
  state.familyId = null;
  state.familyData = null;
  clearListeners();
  showScreen('screen-landing');
});

// ===== PARENT DASHBOARD =====
function loadParentDashboard() {
  document.getElementById('topbar-family-name').textContent = state.familyData?.name || 'My Family';
  document.getElementById('invite-code-display').textContent = state.familyData?.inviteCode || '------';
  showScreen('screen-parent-dashboard');

  // Reset tabs
  document.querySelectorAll('#screen-parent-dashboard .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('#screen-parent-dashboard .tab-btn[data-tab="kids"]').classList.add('active');
  document.querySelectorAll('#screen-parent-dashboard .tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-kids').classList.add('active');

  clearListeners();
  subscribeKids();
  subscribeChores();
  subscribeApprovals();
}

function subscribeKids() {
  const q = collection(db, 'families', state.familyId, 'kids');
  const unsub = onSnapshot(q, (snap) => {
    state.kids = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderKids();
  });
  state.listeners.push(unsub);
}

function subscribeChores() {
  const q = collection(db, 'families', state.familyId, 'chores');
  const unsub = onSnapshot(q, (snap) => {
    state.chores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderChores();
  });
  state.listeners.push(unsub);
}

function subscribeApprovals() {
  const q = query(
    collection(db, 'families', state.familyId, 'completions'),
    where('status', '==', 'pending')
  );
  const unsub = onSnapshot(q, (snap) => {
    state.completions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderApprovals();
    const count = state.completions.length;
    const badge = document.getElementById('approval-count');
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  });
  state.listeners.push(unsub);
}

// ===== RENDER KIDS =====
function renderKids() {
  const list = document.getElementById('kids-list');
  if (state.kids.length === 0) {
    list.innerHTML = '<p class="empty-state">No kids yet. Add one!</p>';
    return;
  }
  list.innerHTML = state.kids.map(kid => `
    <div class="kid-card">
      <span class="kid-card-avatar">${kid.emoji || '🧒'}</span>
      <div class="kid-card-info">
        <div class="kid-card-name">${kid.name}</div>
        <div class="kid-card-meta">${kid.age ? `Age ${kid.age} · ` : ''}${kid.points || 0} pts</div>
      </div>
      <div class="kid-card-actions">
        <button class="btn-danger" onclick="removeKid('${kid.id}')">Remove</button>
      </div>
    </div>
  `).join('');
}

window.removeKid = async (kidId) => {
  if (!confirm('Remove this kid?')) return;
  try {
    await deleteDoc(doc(db, 'families', state.familyId, 'kids', kidId));
    toast('Kid removed.', 'success');
  } catch (err) {
    toast('Error removing kid.', 'error');
  }
};

// ===== ADD KID =====
let selectedKidEmoji = '🧒';

document.getElementById('btn-add-kid').addEventListener('click', () => {
  selectedKidEmoji = '🧒';
  document.getElementById('add-kid-form').reset();
  document.getElementById('kid-emoji-selected').value = '🧒';
  buildEmojiPicker('add-kid-emoji-picker', '🧒', (em) => {
    selectedKidEmoji = em;
    document.getElementById('kid-emoji-selected').value = em;
  });
  openModal('modal-add-kid');
});

document.getElementById('add-kid-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('kid-name-input').value.trim();
  const age = document.getElementById('kid-age-input').value;
  const emoji = document.getElementById('kid-emoji-selected').value || '🧒';
  if (!name) return;
  try {
    await addDoc(collection(db, 'families', state.familyId, 'kids'), {
      name,
      age: age ? parseInt(age) : null,
      emoji,
      points: 0,
      streak: 0,
      badges: [],
      createdAt: serverTimestamp()
    });
    closeModal('modal-add-kid');
    toast('Kid added!', 'success');
  } catch (err) {
    toast('Error adding kid.', 'error');
    console.error(err);
  }
});

// ===== RENDER CHORES =====
function renderChores() {
  const list = document.getElementById('chores-list');
  if (state.chores.length === 0) {
    list.innerHTML = '<p class="empty-state">No chores yet. Add one!</p>';
    return;
  }
  list.innerHTML = state.chores.map(chore => {
    const assigned = (chore.assignedTo || []).map(kidId => {
      const kid = state.kids.find(k => k.id === kidId);
      return kid ? kid.emoji : '';
    }).join('');
    return `
      <div class="chore-card">
        <span class="chore-card-icon">📋</span>
        <div class="chore-card-info">
          <div class="chore-card-name">${chore.name}</div>
          <div class="chore-card-meta">
            <span class="pts-badge">⭐ ${chore.points || 0} pts</span>
            <span class="freq-badge">${chore.frequency || 'anytime'}</span>
            ${assigned ? `<span>${assigned}</span>` : ''}
          </div>
        </div>
        <div class="chore-card-actions">
          <button class="btn-sm-primary" style="background:transparent;color:var(--accent);border:1.5px solid var(--accent)" onclick="editChore('${chore.id}')">Edit</button>
          <button class="btn-danger" onclick="deleteChore('${chore.id}')">Del</button>
        </div>
      </div>
    `;
  }).join('');
}

window.editChore = (choreId) => {
  const chore = state.chores.find(c => c.id === choreId);
  if (!chore) return;
  document.getElementById('edit-chore-id').value = choreId;
  document.getElementById('chore-name-input').value = chore.name;
  document.getElementById('chore-desc-input').value = chore.description || '';
  document.getElementById('chore-points-input').value = chore.points || 10;
  document.getElementById('chore-freq-input').value = chore.frequency || 'daily';
  document.getElementById('chore-modal-title').textContent = 'Edit Chore';
  buildAssignList(chore.assignedTo || []);
  openModal('modal-add-chore');
};

window.deleteChore = async (choreId) => {
  if (!confirm('Delete this chore?')) return;
  try {
    await deleteDoc(doc(db, 'families', state.familyId, 'chores', choreId));
    toast('Chore deleted.', 'success');
  } catch (err) {
    toast('Error deleting chore.', 'error');
  }
};

// ===== ADD/EDIT CHORE =====
let selectedAssignees = [];

function buildAssignList(preSelected = []) {
  selectedAssignees = [...preSelected];
  const container = document.getElementById('chore-assign-list');
  if (state.kids.length === 0) {
    container.innerHTML = '<p style="font-size:0.8rem;color:var(--text-secondary)">Add kids first</p>';
    return;
  }
  container.innerHTML = '';
  state.kids.forEach(kid => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'assign-chip' + (selectedAssignees.includes(kid.id) ? ' selected' : '');
    chip.innerHTML = `${kid.emoji || '🧒'} ${kid.name}`;
    chip.addEventListener('click', () => {
      if (selectedAssignees.includes(kid.id)) {
        selectedAssignees = selectedAssignees.filter(id => id !== kid.id);
        chip.classList.remove('selected');
      } else {
        selectedAssignees.push(kid.id);
        chip.classList.add('selected');
      }
    });
    container.appendChild(chip);
  });
}

document.getElementById('btn-add-chore').addEventListener('click', () => {
  document.getElementById('add-chore-form').reset();
  document.getElementById('edit-chore-id').value = '';
  document.getElementById('chore-points-input').value = 10;
  document.getElementById('chore-modal-title').textContent = 'Add a Chore';
  buildAssignList([]);
  openModal('modal-add-chore');
});

document.getElementById('add-chore-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const choreId = document.getElementById('edit-chore-id').value;
  const data = {
    name: document.getElementById('chore-name-input').value.trim(),
    description: document.getElementById('chore-desc-input').value.trim(),
    points: parseInt(document.getElementById('chore-points-input').value) || 10,
    frequency: document.getElementById('chore-freq-input').value,
    assignedTo: selectedAssignees,
    updatedAt: serverTimestamp()
  };
  if (!data.name) return;
  try {
    if (choreId) {
      await updateDoc(doc(db, 'families', state.familyId, 'chores', choreId), data);
      toast('Chore updated!', 'success');
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'families', state.familyId, 'chores'), data);
      toast('Chore added!', 'success');
    }
    closeModal('modal-add-chore');
  } catch (err) {
    toast('Error saving chore.', 'error');
    console.error(err);
  }
});

// ===== APPROVALS =====
function renderApprovals() {
  const list = document.getElementById('approvals-list');
  if (state.completions.length === 0) {
    list.innerHTML = '<p class="empty-state">Nothing to approve yet.</p>';
    return;
  }
  list.innerHTML = state.completions.map(comp => {
    const kid = state.kids.find(k => k.id === comp.kidId);
    const chore = state.chores.find(c => c.id === comp.choreId);
    return `
      <div class="approval-card">
        <div class="approval-card-header">
          <span style="font-size:1.6rem">${kid?.emoji || '🧒'}</span>
          <div class="approval-card-info">
            <div class="approval-card-chore">${chore?.name || 'Unknown chore'}</div>
            <div class="approval-card-kid">${kid?.name || 'Unknown kid'} · ⭐ ${chore?.points || 0} pts</div>
          </div>
        </div>
        <div class="approval-card-actions">
          <button class="btn-approve" onclick="approveCompletion('${comp.id}', '${comp.kidId}', ${chore?.points || 0})">✓ Approve</button>
          <button class="btn-reject" onclick="rejectCompletion('${comp.id}')">✕ Reject</button>
        </div>
      </div>
    `;
  }).join('');
}

window.approveCompletion = async (compId, kidId, points) => {
  try {
    await updateDoc(doc(db, 'families', state.familyId, 'completions', compId), {
      status: 'approved',
      approvedAt: serverTimestamp()
    });
    // Add points to kid
    const kidRef = doc(db, 'families', state.familyId, 'kids', kidId);
    const kidSnap = await getDoc(kidRef);
    if (kidSnap.exists()) {
      const current = kidSnap.data().points || 0;
      const total = kidSnap.data().totalCompletions || 0;
      await updateDoc(kidRef, {
        points: current + points,
        totalCompletions: total + 1
      });
    }
    toast('Approved! Points added.', 'success');
  } catch (err) {
    toast('Error approving.', 'error');
    console.error(err);
  }
};

window.rejectCompletion = async (compId) => {
  try {
    await updateDoc(doc(db, 'families', state.familyId, 'completions', compId), {
      status: 'rejected',
      rejectedAt: serverTimestamp()
    });
    toast('Rejected.', '');
  } catch (err) {
    toast('Error rejecting.', 'error');
  }
};

// ===== INVITE =====
document.getElementById('btn-copy-invite').addEventListener('click', () => {
  const code = state.familyData?.inviteCode || '';
  const url = `${location.origin}${location.pathname}?join=${code}`;
  navigator.clipboard.writeText(url).then(() => toast('Link copied!', 'success')).catch(() => toast(url));
});

document.getElementById('btn-regen-invite').addEventListener('click', async () => {
  const newCode = randomCode(6);
  try {
    await updateDoc(doc(db, 'families', state.familyId), { inviteCode: newCode });
    state.familyData.inviteCode = newCode;
    document.getElementById('invite-code-display').textContent = newCode;
    toast('New code generated!', 'success');
  } catch (err) {
    toast('Error regenerating code.', 'error');
  }
});

// ===== KID FLOW =====
document.getElementById('btn-kid-role').addEventListener('click', () => {
  // Check for saved kid session
  const session = sessionStorage.getItem('kidSession');
  if (session) {
    try {
      const { familyId, kidId } = JSON.parse(session);
      loadKidDashboard(familyId, kidId);
      return;
    } catch(e) {
      sessionStorage.removeItem('kidSession');
    }
  }
  // Check URL join code
  const urlCode = getJoinCodeFromURL();
  if (urlCode) {
    document.getElementById('join-code-input').value = urlCode.toUpperCase();
  }
  showScreen('screen-kid-join');
});

document.getElementById('kid-join-back').addEventListener('click', () => {
  showScreen('screen-landing');
});

// Join form
document.getElementById('join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = document.getElementById('join-code-input').value.trim().toUpperCase();
  if (!code) return;
  try {
    const q = query(collection(db, 'families'), where('inviteCode', '==', code));
    const snap = await getDocs(q);
    if (snap.empty) {
      toast('Family code not found.', 'error');
      return;
    }
    const familyDoc = snap.docs[0];
    state.joinFamilyId = familyDoc.id;
    state.familyData = familyDoc.data();
    showKidSelect(familyDoc.id, familyDoc.data());
  } catch (err) {
    toast('Error finding family.', 'error');
    console.error(err);
  }
});

async function showKidSelect(familyId, familyData) {
  document.getElementById('kid-select-family-name').textContent = familyData.name;
  // Load kids
  const kidsSnap = await getDocs(collection(db, 'families', familyId, 'kids'));
  const kids = kidsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const grid = document.getElementById('kid-select-list');
  if (kids.length === 0) {
    grid.innerHTML = '<p class="empty-state">No kids added yet. Ask a parent to add you first!</p>';
  } else {
    grid.innerHTML = kids.map(kid => `
      <button class="kid-select-btn" onclick="selectKid('${kid.id}', '${familyId}')">
        <span class="emoji">${kid.emoji || '🧒'}</span>
        <span class="name">${kid.name}</span>
      </button>
    `).join('');
  }
  showScreen('screen-kid-select');
}

document.getElementById('kid-select-back').addEventListener('click', () => {
  showScreen('screen-kid-join');
});

window.selectKid = async (kidId, familyId) => {
  const kidSnap = await getDoc(doc(db, 'families', familyId, 'kids', kidId));
  if (!kidSnap.exists()) { toast('Kid not found.', 'error'); return; }
  const kidData = kidSnap.data();
  state.joinSelectedKid = { id: kidId, familyId, ...kidData };
  // Show PIN screen
  document.getElementById('kid-pin-avatar').textContent = kidData.emoji || '🧒';
  const hasPin = !!kidData.pinHash;
  document.getElementById('kid-pin-title').textContent = hasPin ? 'Enter your PIN' : 'Create a PIN';
  document.getElementById('kid-pin-sub').textContent = hasPin ? 'Enter your 4-digit PIN' : 'Choose a 4-digit PIN';
  // Clear pin inputs
  document.querySelectorAll('.pin-digit').forEach(d => { d.value = ''; });
  showScreen('screen-kid-pin');
  setTimeout(() => document.querySelectorAll('.pin-digit')[0].focus(), 100);
};

document.getElementById('kid-pin-back').addEventListener('click', () => {
  showScreen('screen-kid-select');
});

// PIN input auto-advance
document.querySelectorAll('.pin-digit').forEach((input, i, inputs) => {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(-1);
    if (input.value && i < inputs.length - 1) inputs[i + 1].focus();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !input.value && i > 0) inputs[i - 1].focus();
  });
});

document.getElementById('btn-pin-submit').addEventListener('click', async () => {
  const digits = [...document.querySelectorAll('.pin-digit')].map(d => d.value);
  if (digits.some(d => !d)) { toast('Enter all 4 digits.', 'error'); return; }
  const pin = digits.join('');
  const kid = state.joinSelectedKid;
  if (!kid) return;

  try {
    if (kid.pinHash) {
      // Verify
      if (hashPin(pin) !== kid.pinHash) {
        toast('Wrong PIN. Try again.', 'error');
        document.querySelectorAll('.pin-digit').forEach(d => { d.value = ''; });
        document.querySelectorAll('.pin-digit')[0].focus();
        return;
      }
    } else {
      // Save new PIN
      await updateDoc(doc(db, 'families', kid.familyId, 'kids', kid.id), {
        pinHash: hashPin(pin)
      });
    }
    sessionStorage.setItem('kidSession', JSON.stringify({ familyId: kid.familyId, kidId: kid.id }));
    loadKidDashboard(kid.familyId, kid.id);
  } catch (err) {
    toast('Error with PIN.', 'error');
    console.error(err);
  }
});

// ===== KID DASHBOARD =====
async function loadKidDashboard(familyId, kidId) {
  clearListeners();
  state.familyId = familyId;
  state.currentKid = kidId;

  // Load family
  const famSnap = await getDoc(doc(db, 'families', familyId));
  if (!famSnap.exists()) { toast('Family not found.', 'error'); return; }
  state.familyData = famSnap.data();

  // Load kid
  const kidSnap = await getDoc(doc(db, 'families', familyId, 'kids', kidId));
  if (!kidSnap.exists()) { toast('Kid not found.', 'error'); return; }
  state.currentKidData = { id: kidId, ...kidSnap.data() };

  updateKidHeader();
  showScreen('screen-kid-dashboard');

  // Reset tabs
  document.querySelectorAll('#screen-kid-dashboard .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('#screen-kid-dashboard .tab-btn[data-tab="my-chores"]').classList.add('active');
  document.querySelectorAll('#screen-kid-dashboard .tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-my-chores').classList.add('active');

  subscribeKidChores();
  setupProfileTab();
  renderBadges();
}

function updateKidHeader() {
  const kid = state.currentKidData;
  document.getElementById('kid-avatar-badge').textContent = kid.emoji || '🧒';
  document.getElementById('kid-topbar-name').textContent = kid.name;
  document.getElementById('kid-topbar-points').textContent = `${kid.points || 0} pts`;
}

function subscribeKidChores() {
  // Listen to chores assigned to this kid
  const choresUnsub = onSnapshot(
    collection(db, 'families', state.familyId, 'chores'),
    async (snap) => {
      state.chores = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c => (c.assignedTo || []).includes(state.currentKid));

      // Also get today's completions for this kid
      const compQ = query(
        collection(db, 'families', state.familyId, 'completions'),
        where('kidId', '==', state.currentKid)
      );
      const compSnap = await getDocs(compQ);
      state.completions = compSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderKidChores();
    }
  );
  state.listeners.push(choresUnsub);

  // Also listen to kid doc for points updates
  const kidUnsub = onSnapshot(
    doc(db, 'families', state.familyId, 'kids', state.currentKid),
    (snap) => {
      if (snap.exists()) {
        state.currentKidData = { id: snap.id, ...snap.data() };
        updateKidHeader();
        renderBadges();
      }
    }
  );
  state.listeners.push(kidUnsub);
}

function renderKidChores() {
  const list = document.getElementById('kid-chores-list');
  if (state.chores.length === 0) {
    list.innerHTML = '<p class="empty-state">No chores assigned to you yet!</p>';
    return;
  }
  const todayStr = today();
  list.innerHTML = state.chores.map(chore => {
    // Find relevant completion
    const comp = state.completions.find(c => {
      if (c.choreId !== chore.id) return false;
      if (chore.frequency === 'daily') return c.date === todayStr;
      if (chore.frequency === 'weekly') {
        // Same ISO week
        const d = new Date(c.date);
        const t = new Date();
        const weekOfComp = getISOWeek(d);
        const weekOfNow = getISOWeek(t);
        return weekOfComp === weekOfNow && d.getFullYear() === t.getFullYear();
      }
      return c.status === 'pending' || c.status === 'approved';
    });

    let statusIcon = '⭕';
    let statusClass = '';
    let statusTitle = 'Mark as done';
    if (comp) {
      if (comp.status === 'pending') { statusIcon = '⏳'; statusClass = 'pending'; statusTitle = 'Waiting for approval'; }
      else if (comp.status === 'approved') { statusIcon = '✅'; statusClass = 'approved'; statusTitle = 'Approved!'; }
      else if (comp.status === 'rejected') { statusIcon = '❌'; statusClass = 'rejected'; statusTitle = 'Rejected — tap to retry'; }
    }

    const canMark = !comp || comp.status === 'rejected';

    return `
      <div class="chore-card">
        <span class="chore-card-icon">📋</span>
        <div class="chore-card-info">
          <div class="chore-card-name">${chore.name}</div>
          <div class="chore-card-meta">
            <span class="pts-badge">⭐ ${chore.points || 0} pts</span>
            <span class="freq-badge">${chore.frequency || 'anytime'}</span>
          </div>
        </div>
        <button class="chore-status-btn ${statusClass}" title="${statusTitle}"
          ${canMark ? `onclick="markChoreDone('${chore.id}')"` : ''}>
          ${statusIcon}
        </button>
      </div>
    `;
  }).join('');
}

function getISOWeek(d) {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

window.markChoreDone = async (choreId) => {
  try {
    await addDoc(collection(db, 'families', state.familyId, 'completions'), {
      choreId,
      kidId: state.currentKid,
      status: 'pending',
      date: today(),
      submittedAt: serverTimestamp()
    });
    toast('Marked done! Waiting for approval.', 'success');
    // Re-fetch completions and re-render
    const compQ = query(
      collection(db, 'families', state.familyId, 'completions'),
      where('kidId', '==', state.currentKid)
    );
    const compSnap = await getDocs(compQ);
    state.completions = compSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderKidChores();
  } catch (err) {
    toast('Error marking chore.', 'error');
    console.error(err);
  }
};

// ===== PROFILE TAB =====
function setupProfileTab() {
  const kid = state.currentKidData;
  let profileEmoji = kid.emoji || '🧒';
  document.getElementById('profile-emoji-display').textContent = profileEmoji;
  document.getElementById('profile-nickname').value = kid.name || '';

  buildEmojiPicker('profile-emoji-picker', profileEmoji, (em) => {
    profileEmoji = em;
    document.getElementById('profile-emoji-display').textContent = em;
  });

  document.getElementById('btn-save-profile').onclick = async () => {
    const newName = document.getElementById('profile-nickname').value.trim();
    if (!newName) return;
    try {
      await updateDoc(doc(db, 'families', state.familyId, 'kids', state.currentKid), {
        name: newName,
        emoji: profileEmoji
      });
      toast('Profile saved!', 'success');
    } catch (err) {
      toast('Error saving profile.', 'error');
    }
  };
}

// ===== BADGES =====
function renderBadges() {
  const kid = state.currentKidData;
  const stats = {
    total: kid.totalCompletions || 0,
    points: kid.points || 0,
    streak: kid.streak || 0
  };
  const earned = kid.badges || [];
  const grid = document.getElementById('badges-grid');
  grid.innerHTML = BADGES.map(b => {
    const unlocked = b.check(stats) || earned.includes(b.id);
    return `
      <div class="badge-item ${unlocked ? '' : 'locked'}">
        <span class="badge-icon">${b.icon}</span>
        <span class="badge-name">${b.name}</span>
        <span class="badge-desc">${b.desc}</span>
      </div>
    `;
  }).join('');
}

// ===== HANDLE URL JOIN CODE ON LOAD =====
window.addEventListener('DOMContentLoaded', () => {
  const urlCode = getJoinCodeFromURL();
  if (urlCode) {
    // Auto-navigate to kid join if there's a code in URL
    setTimeout(() => {
      if (!state.user) {
        document.getElementById('join-code-input').value = urlCode.toUpperCase();
        showScreen('screen-kid-join');
      }
    }, 500);
  }
});

// ===== RESTORE KID SESSION ON LOAD =====
// (Auth state change handles parent restore, kid session handled on button click)
const kidSession = sessionStorage.getItem('kidSession');
if (kidSession) {
  try {
    const { familyId, kidId } = JSON.parse(kidSession);
    // Delay to let Firebase init
    setTimeout(() => {
      if (!state.user) loadKidDashboard(familyId, kidId);
    }, 800);
  } catch(e) {
    sessionStorage.removeItem('kidSession');
  }
}
