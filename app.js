// ═══════════════════════════════════════════════════════
//  ChoreQuest — app.js
// ═══════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, onSnapshot, serverTimestamp, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Firebase init ────────────────────────────────────────
const app = initializeApp({
  apiKey: "AIzaSyDkrzifUy1sCGvuniL312Pp7Lh13Wt2DKI",
  authDomain: "login-app-b0f88.firebaseapp.com",
  projectId: "login-app-b0f88",
  storageBucket: "login-app-b0f88.firebasestorage.app",
  messagingSenderId: "760154109686",
  appId: "1:760154109686:web:42670bf2f61ed599b89ed7"
});
const auth = getAuth(app);
const db   = getFirestore(app);

// ── Constants ────────────────────────────────────────────
const KID_EMOJIS = [
  "⭐","🦁","🐯","🦊","🐼","🐨","🐸","🦄","🐉","🦋","🐙","🦀",
  "🌟","🚀","⚡","🎮","🎸","⚽","🏀","🎨","🌈","🍕","🎩","🔥",
  "🐶","🐱","🐰","🐻","🦝","🦉","🦚","🐳","🐬","🦈","🦁","🐮"
];
const CHORE_EMOJIS = [
  "🧹","🍽️","🗑️","🧺","🛏️","🧼","🌿","🐾","📚","🧽","🚿","🪥",
  "🪣","🧴","🪟","🚪","🛁","🍳","🥗","🧹","🧸","🎒","👕","🪴",
  "🔧","🧲","💻","📦","🎯","🌟","⭐","✨"
];
const THEME_COLORS = [
  { name: "Violet",  hex: "#8b7cf8" },
  { name: "Sky",     hex: "#38bdf8" },
  { name: "Rose",    hex: "#fb7185" },
  { name: "Amber",   hex: "#f59e0b" },
  { name: "Emerald", hex: "#34d399" },
  { name: "Orange",  hex: "#fb923c" },
  { name: "Pink",    hex: "#f472b6" },
  { name: "Cyan",    hex: "#22d3ee" },
  { name: "Lime",    hex: "#a3e635" },
  { name: "Fuchsia", hex: "#e879f9" },
  { name: "Teal",    hex: "#2dd4bf" },
  { name: "Red",     hex: "#f87171" },
];

// ── App State ────────────────────────────────────────────
let state = {
  // parent
  parentUser:    null,
  familyId:      null,
  familyDoc:     null,
  // kid session (localStorage-based)
  kidId:         null,
  kidDoc:        null,
  familyIdKid:   null,
  // live data
  kids:          [],
  chores:        [],
  completions:   [],
  // unsub listeners
  unsubKids:      null,
  unsubChores:    null,
  unsubCompletions: null,
  // chore modal editing
  editingChoreId: null,
  // selections in modals
  selectedKidEmoji:   "⭐",
  selectedChoreEmoji: "🧹",
  selectedAssignedTo: [],
  selectedAvatarEmoji: "⭐",
  selectedThemeColor:  "#8b7cf8",
};

// ── Screen routing ────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
}

// ── Modals ────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.remove("hidden"); }
function closeModal(id) { document.getElementById(id).classList.add("hidden"); }

// ── Helpers ──────────────────────────────────────────────
function genCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `${r},${g},${b}`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── Emoji pickers ─────────────────────────────────────────
function renderEmojiGrid(containerId, emojis, onSelect, initialSelected) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  emojis.forEach(e => {
    const btn = document.createElement("button");
    btn.className = "emoji-btn" + (e === initialSelected ? " selected" : "");
    btn.textContent = e;
    btn.type = "button";
    btn.addEventListener("click", () => {
      container.querySelectorAll(".emoji-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      onSelect(e);
    });
    container.appendChild(btn);
  });
}

// ── Leaderboard render ────────────────────────────────────
function renderLeaderboard(containerId, kids, completions) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!kids.length) {
    el.innerHTML = `<p class="empty-sm">No kids yet.</p>`;
    return;
  }
  const today = todayStr();
  const weekAgo = new Date(Date.now() - 7*24*3600*1000).toISOString();

  el.innerHTML = "";
  const sorted = [...kids].sort((a, b) => (b.points || 0) - (a.points || 0));
  sorted.forEach(kid => {
    const kidCompletions = completions.filter(c =>
      c.kidId === kid.id && c.status === "approved" &&
      c.timestamp && c.timestamp.toDate && c.timestamp.toDate().toISOString() >= weekAgo
    );
    // chores assigned to this kid
    const assigned = state.chores.filter(ch => (ch.assignedTo || []).includes(kid.id));
    const total    = assigned.length || 1;
    const done     = kidCompletions.length;
    const pct      = Math.min(done / total, 1);
    const color    = kid.themeColor || "#8b7cf8";
    // SVG circle
    const radius = 24, circ = 2 * Math.PI * radius;
    const offset = circ * (1 - pct);

    const div = document.createElement("div");
    div.className = "leaderboard-kid";
    div.innerHTML = `
      <div class="lb-ring-wrap">
        <svg width="60" height="60" viewBox="0 0 60 60">
          <circle class="lb-ring-bg" cx="30" cy="30" r="${radius}"/>
          <circle class="lb-ring-fill" cx="30" cy="30" r="${radius}"
            stroke="${color}"
            stroke-dasharray="${circ}"
            stroke-dashoffset="${offset}"
          />
        </svg>
        <div class="lb-avatar">${kid.emoji || "⭐"}</div>
      </div>
      <div class="lb-name">${kid.nickname || kid.name}</div>
      <div class="lb-pts">${kid.points || 0}</div>
    `;
    el.appendChild(div);
  });
}

// ── Chore grid render ─────────────────────────────────────
function getChoreStatus(choreId, kidIds) {
  // Find most recent completion for this chore for any of the given kids
  const relevant = state.completions.filter(c =>
    c.choreId === choreId && (!kidIds || kidIds.includes(c.kidId))
  );
  if (!relevant.length) return "incomplete";
  const latest = relevant.sort((a, b) => {
    const ta = a.timestamp?.toDate?.()?.getTime() || 0;
    const tb = b.timestamp?.toDate?.()?.getTime() || 0;
    return tb - ta;
  })[0];
  return latest.status; // pending | approved | rejected
}

function renderParentChoreGrid() {
  const grid = document.getElementById("parent-chore-grid");
  if (!grid) return;
  grid.innerHTML = "";
  if (!state.chores.length) {
    grid.innerHTML = `<div class="empty-chores"><span>🎯</span><p>No chores yet.<br/>Add some in Manage.</p></div>`;
    return;
  }
  state.chores.forEach(chore => {
    const status = getChoreStatus(chore.id, null);
    const tile = document.createElement("button");
    tile.className = "chore-tile";
    if (status === "pending")  tile.classList.add("state-pending");
    if (status === "approved") tile.classList.add("state-approved");
    const assignedKid = state.kids.find(k => (chore.assignedTo || []).includes(k.id));
    tile.innerHTML = `
      ${status === "pending"  ? `<div class="tile-status-dot pending"></div>` : ""}
      ${status === "approved" ? `<div class="tile-status-dot approved"></div>` : ""}
      <div class="tile-freq-badge">${chore.frequency || "daily"}</div>
      <div class="tile-emoji">${chore.emoji || "🧹"}</div>
      <div class="tile-name">${chore.name}</div>
      <div class="tile-meta">${assignedKid ? (assignedKid.emoji || "👤") + " " + (assignedKid.nickname || assignedKid.name) : "Unassigned"}</div>
    `;
    tile.addEventListener("click", () => openChoreDetail(chore, status));
    grid.appendChild(tile);
  });
}

function renderKidChoreGrid() {
  const grid = document.getElementById("kid-chore-grid");
  if (!grid || !state.kidId) return;
  grid.innerHTML = "";
  const myChores = state.chores.filter(ch => (ch.assignedTo || []).includes(state.kidId));
  if (!myChores.length) {
    grid.innerHTML = `<div class="empty-chores"><span>🌟</span><p>No chores assigned yet.<br/>Ask your parent!</p></div>`;
    return;
  }
  const color = state.kidDoc?.themeColor || "#8b7cf8";
  const rgb   = hexToRgb(color);
  myChores.forEach(chore => {
    const status = getChoreStatus(chore.id, [state.kidId]);
    const tile = document.createElement("button");
    tile.className = "chore-tile";
    if (status === "pending")  {
      tile.classList.add("state-pending");
      tile.style.borderColor = `rgba(${hexToRgb("#f5a623")},0.4)`;
    }
    if (status === "approved") {
      tile.style.background = `linear-gradient(135deg, rgba(${rgb},0.15), rgba(${rgb},0.05))`;
      tile.style.borderColor = `rgba(${rgb},0.4)`;
      tile.style.boxShadow   = `0 0 16px rgba(${rgb},0.15)`;
    }
    tile.innerHTML = `
      ${status === "pending"  ? `<div class="tile-status-dot pending"></div>` : ""}
      ${status === "approved" ? `<div class="tile-status-dot approved"></div>` : ""}
      <div class="tile-freq-badge">${chore.frequency || "daily"}</div>
      <div class="tile-emoji">${chore.emoji || "🧹"}</div>
      <div class="tile-name">${chore.name}</div>
      <div class="tile-meta">${chore.points || 10} pts</div>
    `;
    if (status === "incomplete" || status === "rejected") {
      tile.addEventListener("click", () => markChoreDone(chore, tile));
    } else {
      tile.style.cursor = "default";
    }
    grid.appendChild(tile);
  });
}

// ── Chore tile done animation ─────────────────────────────
async function markChoreDone(chore, tile) {
  if (!state.kidId || !state.familyIdKid) return;
  tile.classList.add("just-done");
  tile.disabled = true;
  const color = state.kidDoc?.themeColor || "#8b7cf8";
  const rgb = hexToRgb(color);
  tile.style.background = `linear-gradient(135deg, rgba(${rgb},0.18), rgba(${rgb},0.06))`;
  tile.style.borderColor = `rgba(${rgb},0.5)`;
  tile.style.boxShadow   = `0 0 24px rgba(${rgb},0.3)`;
  // Add pending dot
  const dot = document.createElement("div");
  dot.className = "tile-status-dot pending";
  tile.insertBefore(dot, tile.firstChild);

  try {
    await addDoc(collection(db, "families", state.familyIdKid, "completions"), {
      choreId: chore.id,
      kidId: state.kidId,
      timestamp: serverTimestamp(),
      status: "pending"
    });
    renderKidChoreGrid();
  } catch (e) {
    console.error(e);
  }
}

// ── Parent chore detail modal ─────────────────────────────
function openChoreDetail(chore, status) {
  document.getElementById("detail-icon").textContent   = chore.emoji || "🧹";
  document.getElementById("detail-name").textContent   = chore.name;
  document.getElementById("detail-desc").textContent   = chore.description || "";
  document.getElementById("detail-points").textContent = (chore.points || 10) + " pts";
  document.getElementById("detail-freq").textContent   = chore.frequency || "daily";
  const statusBadge = document.getElementById("detail-status-badge");
  statusBadge.textContent = status;
  statusBadge.className = "badge status-badge " + status;
  const approveRow = document.getElementById("detail-approve-row");
  if (status === "pending") {
    approveRow.style.display = "flex";
    // Find the pending completion
    const pending = state.completions.find(c => c.choreId === chore.id && c.status === "pending");
    document.getElementById("btn-approve-chore").onclick = () => approveCompletion(pending, chore);
    document.getElementById("btn-reject-chore").onclick  = () => rejectCompletion(pending, chore);
  } else {
    approveRow.style.display = "none";
  }
  document.getElementById("btn-edit-chore").onclick   = () => { closeModal("modal-chore-detail"); openEditChore(chore); };
  document.getElementById("btn-delete-chore").onclick = () => deleteChore(chore);
  openModal("modal-chore-detail");
}

async function approveCompletion(completion, chore) {
  if (!completion || !state.familyId) return;
  try {
    await updateDoc(doc(db, "families", state.familyId, "completions", completion.id), { status: "approved" });
    // Add points to kid
    const kid = state.kids.find(k => k.id === completion.kidId);
    if (kid) {
      await updateDoc(doc(db, "families", state.familyId, "kids", kid.id), {
        points: (kid.points || 0) + (chore.points || 10)
      });
    }
    closeModal("modal-chore-detail");
  } catch(e) { console.error(e); }
}

async function rejectCompletion(completion) {
  if (!completion || !state.familyId) return;
  try {
    await updateDoc(doc(db, "families", state.familyId, "completions", completion.id), { status: "rejected" });
    closeModal("modal-chore-detail");
  } catch(e) { console.error(e); }
}

// ── Manage lists ──────────────────────────────────────────
function renderManageLists() {
  renderKidsList();
  renderChoresList();
  renderStatusOverview();
}

function renderKidsList() {
  const list = document.getElementById("kids-list");
  if (!list) return;
  list.innerHTML = "";
  if (!state.kids.length) {
    list.innerHTML = `<p class="empty-sm">No kids added yet.</p>`;
    return;
  }
  state.kids.forEach(kid => {
    const item = document.createElement("div");
    item.className = "manage-item";
    item.innerHTML = `
      <div class="manage-item-emoji">${kid.emoji || "⭐"}</div>
      <div class="manage-item-info">
        <div class="manage-item-name">${kid.nickname || kid.name}</div>
        <div class="manage-item-sub">Age ${kid.age || "?"} · ${kid.points || 0} pts</div>
      </div>
      <button class="manage-item-action" title="Remove kid" data-id="${kid.id}">×</button>
    `;
    item.querySelector(".manage-item-action").addEventListener("click", e => {
      e.stopPropagation();
      if (confirm(`Remove ${kid.name}?`)) removeKid(kid.id);
    });
    list.appendChild(item);
  });
}

function renderChoresList() {
  const list = document.getElementById("chores-list");
  if (!list) return;
  list.innerHTML = "";
  if (!state.chores.length) {
    list.innerHTML = `<p class="empty-sm">No chores added yet.</p>`;
    return;
  }
  state.chores.forEach(chore => {
    const assignedNames = (chore.assignedTo || [])
      .map(id => state.kids.find(k => k.id === id))
      .filter(Boolean)
      .map(k => k.nickname || k.name)
      .join(", ") || "Unassigned";
    const item = document.createElement("div");
    item.className = "manage-item";
    item.innerHTML = `
      <div class="manage-item-emoji">${chore.emoji || "🧹"}</div>
      <div class="manage-item-info">
        <div class="manage-item-name">${chore.name}</div>
        <div class="manage-item-sub">${chore.points || 10} pts · ${chore.frequency || "daily"} · ${assignedNames}</div>
      </div>
      <button class="manage-item-action" title="Delete chore" data-id="${chore.id}">×</button>
    `;
    item.addEventListener("click", e => {
      if (!e.target.closest(".manage-item-action")) openEditChore(chore);
    });
    item.querySelector(".manage-item-action").addEventListener("click", e => {
      e.stopPropagation();
      if (confirm(`Delete "${chore.name}"?`)) deleteChore(chore);
    });
    list.appendChild(item);
  });
}

function renderStatusOverview() {
  const el = document.getElementById("status-overview");
  if (!el) return;
  const pending = state.completions.filter(c => c.status === "pending");
  if (!pending.length) {
    el.innerHTML = `<p class="empty-sm">All caught up! 🎉</p>`;
    return;
  }
  const byKid = {};
  pending.forEach(c => {
    byKid[c.kidId] = (byKid[c.kidId] || 0) + 1;
  });
  el.innerHTML = Object.entries(byKid).map(([kidId, count]) => {
    const kid = state.kids.find(k => k.id === kidId);
    const name = kid ? (kid.nickname || kid.name) : "Unknown";
    return `<p class="empty-sm">${kid?.emoji || "👤"} ${name} — <strong style="color:var(--accent-amber)">${count} pending</strong></p>`;
  }).join("");
}

// ── Kid CRUD ──────────────────────────────────────────────
async function addKid() {
  const name  = document.getElementById("kid-name-input").value.trim();
  const age   = parseInt(document.getElementById("kid-age-input").value) || 0;
  const errEl = document.getElementById("add-kid-error");
  errEl.textContent = "";
  if (!name) { errEl.textContent = "Enter a name."; return; }
  if (!state.familyId) return;
  try {
    await addDoc(collection(db, "families", state.familyId, "kids"), {
      name, age,
      emoji: state.selectedKidEmoji,
      themeColor: "#8b7cf8",
      points: 0, streak: 0, badges: [],
      createdAt: serverTimestamp()
    });
    closeModal("modal-add-kid");
    document.getElementById("kid-name-input").value = "";
    document.getElementById("kid-age-input").value  = "";
  } catch(e) { errEl.textContent = e.message; }
}

async function removeKid(kidId) {
  if (!state.familyId) return;
  try {
    await deleteDoc(doc(db, "families", state.familyId, "kids", kidId));
  } catch(e) { console.error(e); }
}

// ── Chore CRUD ────────────────────────────────────────────
function openAddChore() {
  state.editingChoreId = null;
  document.getElementById("chore-modal-title").textContent = "New Chore";
  document.getElementById("chore-name-input").value   = "";
  document.getElementById("chore-desc-input").value   = "";
  document.getElementById("chore-points-input").value = "10";
  document.getElementById("chore-freq-input").value   = "daily";
  document.getElementById("add-chore-error").textContent = "";
  state.selectedChoreEmoji = "🧹";
  state.selectedAssignedTo = [];
  renderEmojiGrid("chore-emoji-picker", CHORE_EMOJIS, e => { state.selectedChoreEmoji = e; }, "🧹");
  renderAssignList();
  openModal("modal-add-chore");
}

function openEditChore(chore) {
  state.editingChoreId = chore.id;
  document.getElementById("chore-modal-title").textContent = "Edit Chore";
  document.getElementById("chore-name-input").value   = chore.name || "";
  document.getElementById("chore-desc-input").value   = chore.description || "";
  document.getElementById("chore-points-input").value = chore.points || 10;
  document.getElementById("chore-freq-input").value   = chore.frequency || "daily";
  document.getElementById("add-chore-error").textContent = "";
  state.selectedChoreEmoji = chore.emoji || "🧹";
  state.selectedAssignedTo = [...(chore.assignedTo || [])];
  renderEmojiGrid("chore-emoji-picker", CHORE_EMOJIS, e => { state.selectedChoreEmoji = e; }, state.selectedChoreEmoji);
  renderAssignList();
  openModal("modal-add-chore");
}

function renderAssignList() {
  const el = document.getElementById("assign-kids-list");
  if (!el) return;
  el.innerHTML = "";
  if (!state.kids.length) {
    el.innerHTML = `<p class="empty-sm">No kids yet. Add kids first.</p>`;
    return;
  }
  state.kids.forEach(kid => {
    const selected = state.selectedAssignedTo.includes(kid.id);
    const item = document.createElement("div");
    item.className = "assign-item" + (selected ? " selected" : "");
    item.innerHTML = `
      <div class="assign-check">${selected ? "✓" : ""}</div>
      <span style="font-size:20px;">${kid.emoji || "⭐"}</span>
      <span style="font-size:14px;font-weight:600;">${kid.nickname || kid.name}</span>
    `;
    item.addEventListener("click", () => {
      if (state.selectedAssignedTo.includes(kid.id)) {
        state.selectedAssignedTo = state.selectedAssignedTo.filter(id => id !== kid.id);
      } else {
        state.selectedAssignedTo.push(kid.id);
      }
      renderAssignList();
    });
    el.appendChild(item);
  });
}

async function saveChore() {
  const name   = document.getElementById("chore-name-input").value.trim();
  const desc   = document.getElementById("chore-desc-input").value.trim();
  const points = parseInt(document.getElementById("chore-points-input").value) || 10;
  const freq   = document.getElementById("chore-freq-input").value;
  const errEl  = document.getElementById("add-chore-error");
  errEl.textContent = "";
  if (!name) { errEl.textContent = "Enter a chore name."; return; }
  if (!state.familyId) return;
  const data = {
    name, description: desc, points, frequency: freq,
    emoji: state.selectedChoreEmoji,
    assignedTo: state.selectedAssignedTo
  };
  try {
    if (state.editingChoreId) {
      await updateDoc(doc(db, "families", state.familyId, "chores", state.editingChoreId), data);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "families", state.familyId, "chores"), data);
    }
    closeModal("modal-add-chore");
    closeModal("modal-chore-detail");
  } catch(e) { errEl.textContent = e.message; }
}

async function deleteChore(chore) {
  if (!state.familyId) return;
  if (!confirm(`Delete "${chore.name}"?`)) return;
  try {
    await deleteDoc(doc(db, "families", state.familyId, "chores", chore.id));
    closeModal("modal-chore-detail");
  } catch(e) { console.error(e); }
}

// ── Invite code ───────────────────────────────────────────
function renderInvite() {
  const code = state.familyDoc?.inviteCode || "";
  const codeEl = document.getElementById("invite-code-display");
  const linkEl = document.getElementById("invite-link-wrap");
  if (codeEl) codeEl.textContent = code || "------";
  if (linkEl) {
    const link = `${location.origin}${location.pathname}?join=${code}`;
    linkEl.textContent = link;
  }
}

async function regenCode() {
  if (!state.familyId) return;
  const code = genCode();
  await updateDoc(doc(db, "families", state.familyId), { inviteCode: code });
  renderInvite();
  document.getElementById("copy-success").textContent = "New code generated!";
  setTimeout(() => { document.getElementById("copy-success").textContent = ""; }, 2500);
}

// ── Firestore listeners ───────────────────────────────────
function startParentListeners(familyId) {
  stopListeners();
  state.unsubKids = onSnapshot(collection(db, "families", familyId, "kids"), snap => {
    state.kids = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderLeaderboard("parent-leaderboard", state.kids, state.completions);
    renderParentChoreGrid();
    renderManageLists();
  });
  state.unsubChores = onSnapshot(collection(db, "families", familyId, "chores"), snap => {
    state.chores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderLeaderboard("parent-leaderboard", state.kids, state.completions);
    renderParentChoreGrid();
    renderManageLists();
  });
  state.unsubCompletions = onSnapshot(collection(db, "families", familyId, "completions"), snap => {
    state.completions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderLeaderboard("parent-leaderboard", state.kids, state.completions);
    renderParentChoreGrid();
    renderManageLists();
  });
}

function startKidListeners(familyId) {
  stopListeners();
  state.unsubKids = onSnapshot(collection(db, "families", familyId, "kids"), snap => {
    state.kids = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // refresh kidDoc
    const fresh = state.kids.find(k => k.id === state.kidId);
    if (fresh) {
      state.kidDoc = fresh;
      applyKidTheme(fresh.themeColor);
    }
    renderLeaderboard("kid-leaderboard", state.kids, state.completions);
    renderKidChoreGrid();
    refreshKidHeader();
  });
  state.unsubChores = onSnapshot(collection(db, "families", familyId, "chores"), snap => {
    state.chores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderKidChoreGrid();
  });
  state.unsubCompletions = onSnapshot(collection(db, "families", familyId, "completions"), snap => {
    state.completions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderLeaderboard("kid-leaderboard", state.kids, state.completions);
    renderKidChoreGrid();
  });
}

function stopListeners() {
  if (state.unsubKids)        state.unsubKids();
  if (state.unsubChores)      state.unsubChores();
  if (state.unsubCompletions) state.unsubCompletions();
  state.unsubKids = state.unsubChores = state.unsubCompletions = null;
}

// ── Kid theme & header ────────────────────────────────────
function applyKidTheme(color) {
  if (!color) return;
  document.documentElement.style.setProperty("--kid-color", color);
  document.documentElement.style.setProperty("--kid-color-rgb", hexToRgb(color));
  // Update avatar glow
  const avatarEl = document.getElementById("kid-avatar-display");
  if (avatarEl) avatarEl.style.filter = `drop-shadow(0 0 16px rgba(${hexToRgb(color)},0.6))`;
}

function refreshKidHeader() {
  const kid = state.kids.find(k => k.id === state.kidId) || state.kidDoc;
  if (!kid) return;
  const nameEl   = document.getElementById("kid-name-display");
  const ptsEl    = document.getElementById("kid-points-val");
  const streakEl = document.getElementById("kid-streak-val");
  const avatarEl = document.getElementById("kid-avatar-display");
  if (nameEl)   nameEl.textContent   = kid.nickname || kid.name || "Kid";
  if (ptsEl)    ptsEl.textContent    = kid.points || 0;
  if (streakEl) streakEl.textContent = kid.streak || 0;
  if (avatarEl) avatarEl.textContent = kid.emoji || "⭐";
}

// ── Go to parent dashboard ────────────────────────────────
async function goToParentDashboard(familyId) {
  state.familyId = familyId;
  const famDoc = await getDoc(doc(db, "families", familyId));
  state.familyDoc = famDoc.data();
  const nameEl = document.getElementById("family-name-display");
  if (nameEl) nameEl.textContent = state.familyDoc?.name || "Family";
  renderInvite();
  startParentListeners(familyId);
  showScreen("screen-parent-dashboard");
}

// ── Go to kid dashboard ────────────────────────────────────
function goToKidDashboard(kid, familyId) {
  state.kidId        = kid.id;
  state.kidDoc       = kid;
  state.familyIdKid  = familyId;
  // save session
  localStorage.setItem("cq_kid_session", JSON.stringify({ kidId: kid.id, familyId }));
  applyKidTheme(kid.themeColor);
  refreshKidHeader();
  startKidListeners(familyId);
  showScreen("screen-kid-dashboard");
}

// ── Parent auth flow ──────────────────────────────────────
async function handleParentAuth(isSignUp) {
  const email    = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  const errEl    = document.getElementById("auth-error");
  errEl.textContent = "";
  if (!email || !password) { errEl.textContent = "Fill in all fields."; return; }
  try {
    if (isSignUp) {
      await createUserWithEmailAndPassword(auth, email, password);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
    // onAuthStateChanged will handle routing
  } catch(e) { errEl.textContent = e.message; }
}

async function handleGoogleAuth() {
  const errEl = document.getElementById("auth-error");
  errEl.textContent = "";
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch(e) { errEl.textContent = e.message; }
}

// ── Find parent's family ──────────────────────────────────
async function findOrPromptFamily(user) {
  // query families where parentUid == user.uid
  const q = query(collection(db, "families"), where("parentUid", "==", user.uid));
  const snap = await getDocs(q);
  if (snap.empty) {
    showScreen("screen-create-family");
  } else {
    const famDoc = snap.docs[0];
    await goToParentDashboard(famDoc.id);
  }
}

// ── Create family ─────────────────────────────────────────
async function createFamily() {
  const name  = document.getElementById("family-name-input").value.trim();
  const errEl = document.getElementById("family-error");
  errEl.textContent = "";
  if (!name) { errEl.textContent = "Enter a family name."; return; }
  if (!state.parentUser) return;
  try {
    const code = genCode();
    const ref  = await addDoc(collection(db, "families"), {
      name,
      parentUid: state.parentUser.uid,
      inviteCode: code,
      createdAt: serverTimestamp()
    });
    await goToParentDashboard(ref.id);
  } catch(e) { errEl.textContent = e.message; }
}

// ── Kid join flow ─────────────────────────────────────────
async function joinFamily() {
  const code  = document.getElementById("join-code-input").value.trim().toUpperCase();
  const errEl = document.getElementById("join-error");
  errEl.textContent = "";
  if (!code || code.length < 4) { errEl.textContent = "Enter a valid invite code."; return; }
  try {
    const q = query(collection(db, "families"), where("inviteCode", "==", code));
    const snap = await getDocs(q);
    if (snap.empty) { errEl.textContent = "Code not found. Check with your parent."; return; }
    const famDoc = snap.docs[0];
    state.familyIdKid = famDoc.id;
    // Load kids
    const kidsSnap = await getDocs(collection(db, "families", famDoc.id, "kids"));
    state.kids = kidsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const nameEl = document.getElementById("kid-select-family-name");
    if (nameEl) nameEl.textContent = famDoc.data().name || "The Family";
    renderKidSelectGrid();
    showScreen("screen-kid-select");
  } catch(e) { errEl.textContent = e.message; }
}

function renderKidSelectGrid() {
  const grid = document.getElementById("kid-select-grid");
  if (!grid) return;
  grid.innerHTML = "";
  if (!state.kids.length) {
    grid.innerHTML = `<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;">No kids in this family yet.<br/>Ask your parent to add you!</p>`;
    return;
  }
  state.kids.forEach(kid => {
    const card = document.createElement("button");
    card.className = "kid-select-card";
    card.innerHTML = `<div class="kid-select-emoji">${kid.emoji || "⭐"}</div><div class="kid-select-name">${kid.nickname || kid.name}</div>`;
    card.addEventListener("click", () => selectKid(kid));
    grid.appendChild(card);
  });
}

function selectKid(kid) {
  state.kidDoc = kid;
  state.kidId  = kid.id;
  // Show pin screen
  document.getElementById("pin-avatar").textContent = kid.emoji || "⭐";
  const hasPin = !!kid.pin;
  document.getElementById("pin-title").textContent    = hasPin ? "Enter Your PIN" : "Create a PIN";
  document.getElementById("pin-subtitle").textContent = hasPin ? "Enter your 4-digit PIN" : "Choose a new 4-digit PIN";
  document.getElementById("pin-error").textContent    = "";
  resetPinDots();
  showScreen("screen-kid-pin");
}

// ── PIN logic ─────────────────────────────────────────────
let pinBuffer = "";

function resetPinDots() {
  pinBuffer = "";
  document.querySelectorAll(".pin-dot").forEach(d => d.classList.remove("filled"));
}

function updatePinDots() {
  document.querySelectorAll(".pin-dot").forEach((d, i) => {
    d.classList.toggle("filled", i < pinBuffer.length);
  });
}

async function submitPin() {
  if (!state.kidDoc || !state.familyIdKid) return;
  const errEl = document.getElementById("pin-error");
  errEl.textContent = "";
  const hasPin = !!state.kidDoc.pin;
  if (hasPin) {
    if (pinBuffer !== state.kidDoc.pin) {
      errEl.textContent = "Wrong PIN. Try again.";
      resetPinDots();
      return;
    }
    goToKidDashboard(state.kidDoc, state.familyIdKid);
  } else {
    // Save new pin
    try {
      await updateDoc(doc(db, "families", state.familyIdKid, "kids", state.kidDoc.id), { pin: pinBuffer });
      state.kidDoc.pin = pinBuffer;
      goToKidDashboard(state.kidDoc, state.familyIdKid);
    } catch(e) { errEl.textContent = e.message; }
  }
}

// ── Kid customize ─────────────────────────────────────────
function openKidCustomize() {
  const kid = state.kidDoc;
  document.getElementById("kid-nickname-input").value = kid?.nickname || kid?.name || "";
  state.selectedAvatarEmoji = kid?.emoji || "⭐";
  state.selectedThemeColor  = kid?.themeColor || "#8b7cf8";
  renderEmojiGrid("kid-avatar-picker", KID_EMOJIS, e => { state.selectedAvatarEmoji = e; }, state.selectedAvatarEmoji);
  renderColorPicker();
  openModal("modal-kid-customize");
}

function renderColorPicker() {
  const el = document.getElementById("kid-color-picker");
  if (!el) return;
  el.innerHTML = "";
  THEME_COLORS.forEach(c => {
    const btn = document.createElement("button");
    btn.className = "color-swatch" + (c.hex === state.selectedThemeColor ? " selected" : "");
    btn.style.background = c.hex;
    btn.title = c.name;
    btn.type = "button";
    btn.addEventListener("click", () => {
      state.selectedThemeColor = c.hex;
      el.querySelectorAll(".color-swatch").forEach(s => s.classList.remove("selected"));
      btn.classList.add("selected");
    });
    el.appendChild(btn);
  });
}

async function saveKidCustomize() {
  if (!state.kidId || !state.familyIdKid) return;
  const nickname = document.getElementById("kid-nickname-input").value.trim();
  try {
    await updateDoc(doc(db, "families", state.familyIdKid, "kids", state.kidId), {
      nickname: nickname || state.kidDoc.name,
      emoji: state.selectedAvatarEmoji,
      themeColor: state.selectedThemeColor
    });
    state.kidDoc.nickname    = nickname || state.kidDoc.name;
    state.kidDoc.emoji       = state.selectedAvatarEmoji;
    state.kidDoc.themeColor  = state.selectedThemeColor;
    applyKidTheme(state.selectedThemeColor);
    refreshKidHeader();
    closeModal("modal-kid-customize");
  } catch(e) { console.error(e); }
}

// ── Logout ────────────────────────────────────────────────
async function parentLogout() {
  stopListeners();
  state.parentUser = null;
  state.familyId   = null;
  state.familyDoc  = null;
  state.kids = []; state.chores = []; state.completions = [];
  await signOut(auth);
  showScreen("screen-landing");
}

function kidLogout() {
  stopListeners();
  state.kidId = null; state.kidDoc = null; state.familyIdKid = null;
  state.kids = []; state.chores = []; state.completions = [];
  localStorage.removeItem("cq_kid_session");
  showScreen("screen-landing");
}

// ── Auto-restore kid session ──────────────────────────────
async function tryRestoreKidSession() {
  const raw = localStorage.getItem("cq_kid_session");
  if (!raw) return false;
  try {
    const { kidId, familyId } = JSON.parse(raw);
    const kidSnap = await getDoc(doc(db, "families", familyId, "kids", kidId));
    if (!kidSnap.exists()) { localStorage.removeItem("cq_kid_session"); return false; }
    const kid = { id: kidSnap.id, ...kidSnap.data() };
    goToKidDashboard(kid, familyId);
    return true;
  } catch { localStorage.removeItem("cq_kid_session"); return false; }
}

// ── Check URL join param ───────────────────────────────────
function checkJoinParam() {
  const params = new URLSearchParams(location.search);
  const join = params.get("join");
  if (join) {
    showScreen("screen-kid-join");
    document.getElementById("join-code-input").value = join.toUpperCase();
    // Clean URL
    history.replaceState({}, "", location.pathname);
  }
}

// ══════════════════════════════════════════════════════════
//  WIRE UP ALL EVENTS
// ══════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {

  // ── Landing ──────────────────────────────────────────────
  document.getElementById("btn-parent-role").addEventListener("click", () => showScreen("screen-parent-auth"));
  document.getElementById("btn-kid-role").addEventListener("click",    () => showScreen("screen-kid-join"));

  // ── Parent Auth ──────────────────────────────────────────
  let isSignUp = false;
  document.getElementById("auth-back-btn").addEventListener("click", () => showScreen("screen-landing"));

  document.getElementById("tab-signin").addEventListener("click", () => {
    isSignUp = false;
    document.getElementById("tab-signin").classList.add("active");
    document.getElementById("tab-signup").classList.remove("active");
    document.getElementById("btn-email-auth").textContent = "Sign In";
    document.getElementById("signup-name-group").style.display = "none";
  });
  document.getElementById("tab-signup").addEventListener("click", () => {
    isSignUp = true;
    document.getElementById("tab-signup").classList.add("active");
    document.getElementById("tab-signin").classList.remove("active");
    document.getElementById("btn-email-auth").textContent = "Create Account";
    document.getElementById("signup-name-group").style.display = "flex";
  });

  document.getElementById("btn-email-auth").addEventListener("click", () => handleParentAuth(isSignUp));
  document.getElementById("btn-google-auth").addEventListener("click", handleGoogleAuth);

  // ── Create Family ────────────────────────────────────────
  document.getElementById("btn-create-family").addEventListener("click", createFamily);
  document.getElementById("btn-logout-create").addEventListener("click", () => { signOut(auth); showScreen("screen-landing"); });

  // ── Parent Dashboard — bottom nav ─────────────────────────
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const panelId = btn.dataset.panel;
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active-panel"));
      document.getElementById(panelId).classList.add("active-panel");
      document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // ── Parent logout ────────────────────────────────────────
  document.getElementById("btn-parent-logout").addEventListener("click", parentLogout);

  // ── Manage actions ────────────────────────────────────────
  document.getElementById("btn-add-kid").addEventListener("click", () => {
    document.getElementById("kid-name-input").value = "";
    document.getElementById("kid-age-input").value  = "";
    document.getElementById("add-kid-error").textContent = "";
    state.selectedKidEmoji = "⭐";
    renderEmojiGrid("kid-emoji-picker", KID_EMOJIS, e => { state.selectedKidEmoji = e; }, "⭐");
    openModal("modal-add-kid");
  });
  document.getElementById("btn-add-chore").addEventListener("click", openAddChore);

  // ── Invite ────────────────────────────────────────────────
  document.getElementById("btn-copy-code").addEventListener("click", () => {
    const code = state.familyDoc?.inviteCode || "";
    navigator.clipboard.writeText(code).then(() => {
      document.getElementById("copy-success").textContent = "Code copied!";
      setTimeout(() => { document.getElementById("copy-success").textContent = ""; }, 2000);
    });
  });
  document.getElementById("btn-copy-link").addEventListener("click", () => {
    const code = state.familyDoc?.inviteCode || "";
    const link = `${location.origin}${location.pathname}?join=${code}`;
    navigator.clipboard.writeText(link).then(() => {
      document.getElementById("copy-success").textContent = "Link copied!";
      setTimeout(() => { document.getElementById("copy-success").textContent = ""; }, 2000);
    });
  });
  document.getElementById("btn-regen-code").addEventListener("click", regenCode);

  // ── Kid Join ──────────────────────────────────────────────
  document.getElementById("kid-join-back").addEventListener("click", () => showScreen("screen-landing"));
  document.getElementById("btn-join-family").addEventListener("click", joinFamily);
  document.getElementById("join-code-input").addEventListener("keydown", e => { if (e.key === "Enter") joinFamily(); });

  // ── Kid Select ────────────────────────────────────────────
  document.getElementById("kid-select-back").addEventListener("click", () => showScreen("screen-kid-join"));

  // ── PIN ───────────────────────────────────────────────────
  document.getElementById("kid-pin-back").addEventListener("click", () => {
    resetPinDots();
    showScreen("screen-kid-select");
  });
  document.querySelectorAll(".num-btn[data-num]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (pinBuffer.length >= 4) return;
      pinBuffer += btn.dataset.num;
      updatePinDots();
      if (pinBuffer.length === 4) submitPin();
    });
  });
  document.getElementById("pin-del").addEventListener("click", () => {
    pinBuffer = pinBuffer.slice(0, -1);
    updatePinDots();
  });

  // ── Kid dashboard ─────────────────────────────────────────
  document.getElementById("btn-kid-customize").addEventListener("click", openKidCustomize);
  document.getElementById("btn-kid-logout").addEventListener("click", kidLogout);

  // ── Modals: close/save ────────────────────────────────────
  document.getElementById("btn-cancel-kid").addEventListener("click",  () => closeModal("modal-add-kid"));
  document.getElementById("btn-save-kid").addEventListener("click",    addKid);
  document.getElementById("btn-cancel-chore").addEventListener("click",() => closeModal("modal-add-chore"));
  document.getElementById("btn-save-chore").addEventListener("click",  saveChore);
  document.getElementById("btn-close-detail").addEventListener("click",() => closeModal("modal-chore-detail"));
  document.getElementById("btn-cancel-customize").addEventListener("click", () => closeModal("modal-kid-customize"));
  document.getElementById("btn-save-customize").addEventListener("click", saveKidCustomize);

  // ── Close modals by clicking overlay ──────────────────────
  document.querySelectorAll(".modal-overlay").forEach(overlay => {
    overlay.addEventListener("click", e => {
      if (e.target === overlay) overlay.classList.add("hidden");
    });
  });

  // ── Firebase Auth State ──────────────────────────────────
  onAuthStateChanged(auth, async user => {
    if (user) {
      state.parentUser = user;
      await findOrPromptFamily(user);
    } else {
      state.parentUser = null;
      // Don't auto-redirect if already on a kid screen
      const active = document.querySelector(".screen.active");
      if (active && (
        active.id === "screen-kid-join" ||
        active.id === "screen-kid-select" ||
        active.id === "screen-kid-pin" ||
        active.id === "screen-kid-dashboard"
      )) return;
      // Try restore kid session
      const restored = await tryRestoreKidSession();
      if (!restored) showScreen("screen-landing");
    }
  });

  // ── Check join param ──────────────────────────────────────
  checkJoinParam();

  // ── Render kid emoji picker (initial in modal) ─────────────
  renderEmojiGrid("kid-emoji-picker", KID_EMOJIS, e => { state.selectedKidEmoji = e; }, "⭐");
  renderEmojiGrid("chore-emoji-picker", CHORE_EMOJIS, e => { state.selectedChoreEmoji = e; }, "🧹");
});
