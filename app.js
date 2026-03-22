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
      c.kidId === kid.id && c.status === "completed" &&
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
    if (status === "completed") tile.classList.add("state-approved");
    const assignedKid = state.kids.find(k => (chore.assignedTo || []).includes(k.id));
    tile.innerHTML = `
      ${status === "completed" ? `<div class="tile-status-dot approved"></div>` : ""}
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
    if (status === "completed") {
      tile.style.background = `linear-gradient(135deg, rgba(${rgb},0.15), rgba(${rgb},0.05))`;
      tile.style.borderColor = `rgba(${rgb},0.4)`;
      tile.style.boxShadow   = `0 0 16px rgba(${rgb},0.15)`;
    }
    tile.innerHTML = `
      ${status === "completed" ? `<div class="tile-status-dot approved"></div>` : ""}
      <div class="tile-freq-badge">${chore.frequency || "daily"}</div>
      <div class="tile-emoji">${chore.emoji || "🧹"}</div>
      <div class="tile-name">${chore.name}</div>
      <div class="tile-meta">${chore.points || 10} pts</div>
    `;
    if (status === "incomplete") {
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

  try {
    await addDoc(collection(db, "families", state.familyIdKid, "completions"), {
      choreId: chore.id,
      kidId: state.kidId,
      timestamp: serverTimestamp(),
      date: todayStr(),
      status: "completed"
    });
    // Award points immediately
    const kidRef = doc(db, "families", state.familyIdKid, "kids", state.kidId);
    const kidSnap = await getDoc(kidRef);
    if (kidSnap.exists()) {
      await updateDoc(kidRef, {
        points: (kidSnap.data().points || 0) + (chore.points || 10),
        totalCompletions: (kidSnap.data().totalCompletions || 0) + 1
      });
    }
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
  statusBadge.textContent = status === "completed" ? "✅ done" : status;
  statusBadge.className = "badge status-badge " + (status === "completed" ? "approved" : status);
  const approveRow = document.getElementById("detail-approve-row");
  if (status === "completed") {
    approveRow.style.display = "flex";
    const comp = state.completions.find(c => c.choreId === chore.id && c.status === "completed");
    document.getElementById("btn-undo-chore").onclick = () => undoCompletion(comp, chore);
  } else {
    approveRow.style.display = "none";
  }
  document.getElementById("btn-edit-chore").onclick   = () => { closeModal("modal-chore-detail"); openEditChore(chore); };
  document.getElementById("btn-delete-chore").onclick = () => deleteChore(chore);
  openModal("modal-chore-detail");
}

async function undoCompletion(completion, chore) {
  if (!completion || !state.familyId) return;
  if (!confirm("Undo this completion? Points will be removed.")) return;
  try {
    await deleteDoc(doc(db, "families", state.familyId, "completions", completion.id));
    const kid = state.kids.find(k => k.id === completion.kidId);
    if (kid) {
      await updateDoc(doc(db, "families", state.familyId, "kids", kid.id), {
        points: Math.max(0, (kid.points || 0) - (chore.points || 10)),
        totalCompletions: Math.max(0, (kid.totalCompletions || 0) - 1)
      });
    }
    closeModal("modal-chore-detail");
    closeModal("modal-kid-history");
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
      <button class="btn-view-kid" data-id="${kid.id}" title="View history">View</button>
      <button class="manage-item-action" title="Remove kid" data-id="${kid.id}">×</button>
    `;
    item.querySelector(".btn-view-kid").addEventListener("click", e => {
      e.stopPropagation();
      viewKidHistory(kid.id);
    });
    item.querySelector(".manage-item-action").addEventListener("click", e => {
      e.stopPropagation();
      if (confirm(`Remove ${kid.name}?`)) removeKid(kid.id);
    });
    list.appendChild(item);
  });
}

async function viewKidHistory(kidId) {
  const kid = state.kids.find(k => k.id === kidId);
  if (!kid || !state.familyId) return;
  document.getElementById("kid-history-avatar").textContent = kid.emoji || "⭐";
  document.getElementById("kid-history-name").textContent = kid.nickname || kid.name;
  document.getElementById("kid-history-content").innerHTML = `<p class="empty-sm">Loading...</p>`;
  openModal("modal-kid-history");
  try {
    const today = todayStr();
    const kidChores = state.chores.filter(c => (c.assignedTo || []).includes(kidId));
    const compQ = query(collection(db, "families", state.familyId, "completions"), where("kidId", "==", kidId));
    const compSnap = await getDocs(compQ);
    const allComps = compSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const todayDone = allComps.filter(c => c.date === today && c.status === "completed");
    const doneIds = todayDone.map(c => c.choreId);
    const done = kidChores.filter(c => doneIds.includes(c.id));
    const todo = kidChores.filter(c => !doneIds.includes(c.id));
    const history = allComps.filter(c => c.status === "completed")
      .sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 25);
    let html = "";
    if (kidChores.length === 0) {
      html = `<p class="empty-sm">No chores assigned yet.</p>`;
    } else {
      if (done.length) {
        html += `<div class="hist-label">✅ Completed Today (${done.length})</div>`;
        html += done.map(c => {
          const comp = todayDone.find(tc => tc.choreId === c.id);
          const time = comp?.timestamp?.toDate ? comp.timestamp.toDate().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) : "";
          return `<div class="hist-item done"><span>${c.emoji || "📋"} ${c.name}</span><div style="display:flex;gap:8px;align-items:center"><span class="hist-pts">+${c.points} pts</span>${time ? `<span class="hist-time">${time}</span>` : ""}<button class="btn-undo-hist" onclick="undoCompletionById('${comp?.id}','${kidId}',${c.points || 10})">Undo</button></div></div>`;
        }).join("");
      }
      if (todo.length) {
        html += `<div class="hist-label">⭕ Still To Do (${todo.length})</div>`;
        html += todo.map(c => `<div class="hist-item todo"><span>${c.emoji || "📋"} ${c.name}</span><span class="hist-pts">${c.points} pts</span></div>`).join("");
      }
    }
    if (history.length) {
      html += `<div class="hist-label" style="margin-top:20px">📜 Completion Log</div>`;
      html += history.map(c => {
        const chore = state.chores.find(ch => ch.id === c.choreId);
        return `<div class="hist-item done"><span>${chore?.emoji || "📋"} ${chore?.name || "Unknown"}</span><span class="hist-time">${c.date || ""}</span></div>`;
      }).join("");
    }
    document.getElementById("kid-history-content").innerHTML = html;
  } catch(e) {
    document.getElementById("kid-history-content").innerHTML = `<p class="empty-sm">Error loading history.</p>`;
    console.error(e);
  }
}

window.undoCompletionById = async (compId, kidId, points) => {
  if (!compId || !state.familyId) return;
  const comp = { id: compId, kidId };
  const chore = { points };
  await undoCompletion(comp, chore);
  viewKidHistory(kidId);
};

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
  const today = todayStr();
  const done = state.completions.filter(c => c.status === "completed" && c.date === today);
  const total = state.chores.reduce((sum, ch) => sum + (ch.assignedTo || []).length, 0);
  if (!done.length) {
    el.innerHTML = `<p class="empty-sm">No chores completed yet today.</p>`;
    return;
  }
  const byKid = {};
  done.forEach(c => { byKid[c.kidId] = (byKid[c.kidId] || 0) + 1; });
  el.innerHTML = Object.entries(byKid).map(([kidId, count]) => {
    const kid = state.kids.find(k => k.id === kidId);
    const name = kid ? (kid.nickname || kid.name) : "Unknown";
    return `<p class="empty-sm">${kid?.emoji || "👤"} ${name} — <strong style="color:var(--accent-green)">${count} done today</strong></p>`;
  }).join("") + `<p class="empty-sm" style="margin-top:6px;color:var(--text-muted)">${done.length}/${total} total chores completed</p>`;
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

// ── Notifications ─────────────────────────────────────────
async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  const p = await Notification.requestPermission();
  return p === "granted";
}
function sendNotification(title, body) {
  if (Notification.permission === "granted") new Notification(title, { body });
}
let _reminderStarted = false;
function startReminderScheduler() {
  if (_reminderStarted) return;
  _reminderStarted = true;
  checkReminders();
  setInterval(checkReminders, 60000);
}
function checkReminders() {
  const h = new Date().getHours(), m = new Date().getMinutes();
  // 5 PM: kid reminder for incomplete chores
  if (h === 17 && m === 0 && state.kidId && state.familyIdKid) {
    const key = `kidRem-${state.kidId}-${todayStr()}`;
    if (!localStorage.getItem(key)) {
      const today = todayStr();
      const incomplete = state.chores.filter(ch =>
        (ch.assignedTo || []).includes(state.kidId) &&
        !state.completions.find(c => c.choreId === ch.id && c.status === "completed" && c.date === today)
      );
      if (incomplete.length) {
        sendNotification("ChoreQuest ⭐", `You still have ${incomplete.length} chore${incomplete.length > 1 ? "s" : ""} left today!`);
        localStorage.setItem(key, "1");
      }
    }
  }
  // 9 PM: parent daily summary
  if (h === 21 && m === 0 && state.parentUser && state.familyId) {
    const key = `parentSum-${todayStr()}`;
    if (!localStorage.getItem(key)) {
      sendNotification("ChoreQuest ⭐", "Daily summary is ready — see how the family did today.");
      localStorage.setItem(key, "1");
      showDailySummary();
    }
  }
}

// ── Daily Summary ─────────────────────────────────────────
async function showDailySummary() {
  if (!state.familyId) return;
  openModal("modal-daily-summary");
  document.getElementById("daily-summary-content").innerHTML = `<p class="empty-sm">Loading...</p>`;
  try {
    const today = todayStr();
    const compQ = query(collection(db, "families", state.familyId, "completions"), where("date", "==", today));
    const compSnap = await getDocs(compQ);
    const todayComps = compSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.status === "completed");
    let totalA = 0, totalD = 0;
    const sections = state.kids.map(kid => {
      const kidChores = state.chores.filter(c => (c.assignedTo || []).includes(kid.id));
      const doneIds = todayComps.filter(c => c.kidId === kid.id).map(c => c.choreId);
      const done = kidChores.filter(c => doneIds.includes(c.id));
      const todo = kidChores.filter(c => !doneIds.includes(c.id));
      totalA += kidChores.length; totalD += done.length;
      if (!kidChores.length) return `<div class="sum-kid"><div class="sum-kid-hdr">${kid.emoji || "⭐"} <strong>${kid.nickname || kid.name}</strong> — no chores</div></div>`;
      return `<div class="sum-kid">
        <div class="sum-kid-hdr">${kid.emoji || "⭐"} <strong>${kid.nickname || kid.name}</strong> — ${done.length}/${kidChores.length} done</div>
        ${done.length ? `<div class="sum-label">✅ Done</div>${done.map(c => `<div class="sum-row done">${c.emoji || "📋"} ${c.name} <span class="hist-pts">+${c.points} pts</span></div>`).join("")}` : ""}
        ${todo.length ? `<div class="sum-label">⭕ Not Done</div>${todo.map(c => `<div class="sum-row todo">${c.emoji || "📋"} ${c.name}</div>`).join("")}` : ""}
      </div>`;
    }).join("");
    const pct = totalA ? Math.round(totalD / totalA * 100) : 0;
    const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    document.getElementById("daily-summary-content").innerHTML = `
      <p style="text-align:center;color:var(--text-muted);font-size:13px;margin-bottom:12px">${dateStr}</p>
      <div class="sum-overall">Family completed <strong>${pct}%</strong> today<br><span style="font-size:13px;opacity:0.8">${totalD} of ${totalA} chores done</span></div>
      ${state.kids.length ? sections : "<p class='empty-sm'>No kids yet.</p>"}
    `;
  } catch(e) {
    document.getElementById("daily-summary-content").innerHTML = `<p class="empty-sm">Error loading.</p>`;
    console.error(e);
  }
}

// ── Parent phone & settings ───────────────────────────────
function setupParentSettings() {
  const phone = state.familyDoc?.parentPhone || "";
  const el = document.getElementById("parent-phone-input");
  if (el) el.value = phone;
  const notifBtn = document.getElementById("btn-enable-notifs");
  if (notifBtn) {
    if (Notification.permission === "granted") notifBtn.textContent = "✅ Notifications On";
    notifBtn.addEventListener("click", async () => {
      const ok = await requestNotificationPermission();
      notifBtn.textContent = ok ? "✅ Notifications On" : "Blocked — check browser settings";
    });
  }
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
  setupParentSettings();
  startParentListeners(familyId);
  showScreen("screen-parent-dashboard");
  startReminderScheduler();
  // Auto-show daily summary after 9 PM if not yet shown today
  setTimeout(() => {
    const h = new Date().getHours();
    const key = `parentSum-${todayStr()}`;
    if (h >= 21 && !localStorage.getItem(key)) {
      localStorage.setItem(key, "1");
      showDailySummary();
    }
  }, 1200);
}

// ── Go to kid dashboard ────────────────────────────────────
function goToKidDashboard(kid, familyId) {
  state.kidId        = kid.id;
  state.kidDoc       = kid;
  state.familyIdKid  = familyId;
  localStorage.setItem("cq_kid_session", JSON.stringify({ kidId: kid.id, familyId }));
  applyKidTheme(kid.themeColor);
  refreshKidHeader();
  startKidListeners(familyId);
  showScreen("screen-kid-dashboard");
  startReminderScheduler();
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
  const phone    = (document.getElementById("kid-phone-input")?.value || "").trim();
  try {
    await updateDoc(doc(db, "families", state.familyIdKid, "kids", state.kidId), {
      nickname: nickname || state.kidDoc.name,
      emoji: state.selectedAvatarEmoji,
      themeColor: state.selectedThemeColor,
      phone: phone || null
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

  // ── Parent logout & summary ──────────────────────────────
  document.getElementById("btn-parent-logout").addEventListener("click", parentLogout);
  document.getElementById("btn-daily-summary").addEventListener("click", showDailySummary);

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
  document.getElementById("btn-close-detail").addEventListener("click", () => closeModal("modal-chore-detail"));
  document.getElementById("btn-cancel-customize").addEventListener("click", () => closeModal("modal-kid-customize"));
  document.getElementById("btn-save-customize").addEventListener("click", saveKidCustomize);

  // ── Kid history & daily summary modals ────────────────────
  document.getElementById("btn-close-kid-history").addEventListener("click", () => closeModal("modal-kid-history"));
  document.getElementById("btn-close-summary").addEventListener("click", () => closeModal("modal-daily-summary"));

  // ── Parent phone save ─────────────────────────────────────
  const savePhoneBtn = document.getElementById("btn-save-parent-phone");
  if (savePhoneBtn) {
    savePhoneBtn.addEventListener("click", async () => {
      const phone = document.getElementById("parent-phone-input")?.value.trim() || "";
      if (!state.familyId) return;
      try {
        await updateDoc(doc(db, "families", state.familyId), { parentPhone: phone });
        if (state.familyDoc) state.familyDoc.parentPhone = phone;
        const msg = document.getElementById("parent-phone-msg");
        if (msg) { msg.textContent = "Saved!"; setTimeout(() => { msg.textContent = ""; }, 2000); }
      } catch(e) { console.error(e); }
    });
  }

  // ── Enable notifications ──────────────────────────────────
  const notifKidBtn = document.getElementById("btn-enable-kid-notifs");
  if (notifKidBtn) {
    if (Notification.permission === "granted") notifKidBtn.textContent = "✅ Notifications On";
    notifKidBtn.addEventListener("click", async () => {
      const ok = await requestNotificationPermission();
      notifKidBtn.textContent = ok ? "✅ Notifications On" : "Blocked — check browser settings";
    });
  }

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
