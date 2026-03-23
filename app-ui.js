// ═══ ChoreQuest — UI Rendering ═══
import { state, db, hexToRgb, todayStr, openModal, closeModal, showScreen, doc, getDoc, updateDoc, addDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp } from "./app-core.js";
import { CHARACTERS, STORE_ITEMS, getCharById, getItemById, getLevel, getLevelTier } from "./gamedata.js";
import { calculateStreak, getInventory } from "./gamification.js";

// ── Avatar helper ────────────────────────────────────────
export function renderAvatarContent(container, kid) {
  if (!container) return;
  const char = getCharById(kid?.baseCharacterId);
  if (char?.img) {
    container.innerHTML = `<img src="${char.img}" alt="${char.name}">`;
  } else {
    container.innerHTML = char?.emoji || kid?.emoji || "⭐";
  }
}

function getLevelBadgeHTML(level) {
  const tier = getLevelTier(level);
  return `<span class="level-badge lv-${tier}">Lv. ${level}</span>`;
}

// ── Leaderboard ──────────────────────────────────────────
export function renderLeaderboard(containerId, kids, completions) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!kids.length) { el.innerHTML = `<p class="empty-sm">No kids yet.</p>`; return; }
  const today = todayStr();
  const weekAgo = new Date(Date.now() - 7*24*3600*1000).toISOString();
  el.innerHTML = "";
  const sorted = [...kids].sort((a,b) => (b.totalLifetimePoints||b.points||0) - (a.totalLifetimePoints||a.points||0));
  sorted.forEach(kid => {
    const assigned = state.chores.filter(ch => (ch.assignedTo||[]).includes(kid.id));
    const kidComps = completions.filter(c => c.kidId===kid.id && c.status==="completed" && c.timestamp?.toDate?.()?.toISOString() >= weekAgo);
    const total = assigned.length || 1, done = kidComps.length;
    const pct = Math.min(done/total, 1);
    const color = kid.themeColor || "#8b7cf8";
    const radius=26, circ=2*Math.PI*radius, offset=circ*(1-pct);
    const level = getLevel(kid.totalLifetimePoints || 0);
    const tier = getLevelTier(level);
    const char = getCharById(kid.baseCharacterId);
    const avatarInner = char?.img
      ? `<img src="${char.img}" alt="${char.name}">`
      : (char?.emoji || kid.emoji || "⭐");

    const div = document.createElement("div");
    div.className = "leaderboard-kid";
    div.innerHTML = `
      <div class="lb-ring-wrap">
        <svg width="68" height="68" viewBox="0 0 68 68">
          <circle class="lb-ring-bg" cx="34" cy="34" r="${radius}"/>
          <circle class="lb-ring-fill" cx="34" cy="34" r="${radius}" stroke="${color}" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/>
        </svg>
        <div class="lb-avatar">${avatarInner}</div>
      </div>
      <div class="lb-name">${kid.nickname||kid.name}</div>
      <div class="lb-level">${getLevelBadgeHTML(level)}</div>
      ${(kid.streak||0) > 0 ? `<div class="lb-streak">🔥 ${kid.streak}</div>` : ''}
      <div class="lb-pts">${kid.currentPoints||kid.points||0} pts</div>
    `;
    div.addEventListener("click", () => openAvatarView(kid));
    el.appendChild(div);
  });
}

// ── View other kid's avatar modal ─────────────────────────
function openAvatarView(kid) {
  const char = getCharById(kid.baseCharacterId);
  const imgEl = document.getElementById("modal-avatar-img");
  renderAvatarContent(imgEl, kid);
  document.getElementById("modal-avatar-name").textContent = kid.nickname || kid.name;
  const level = getLevel(kid.totalLifetimePoints || 0);
  document.getElementById("modal-avatar-level").innerHTML = `
    ${getLevelBadgeHTML(level)}
    <span class="streak-badge">🔥 ${kid.streak||0} day streak</span>
  `;
  // Show equipped items
  const gearEl = document.getElementById("modal-avatar-gear");
  const equipped = kid.equippedItems || {};
  const slots = ["outfit","armor","weapon","accessory"];
  const slotEmojis = {outfit:"👕",armor:"🛡️",weapon:"⚔️",accessory:"✨"};
  gearEl.innerHTML = slots.map(s => {
    const itemId = equipped[s];
    const item = itemId ? getItemById(itemId) : null;
    return `<div class="equip-slot glass-card">
      <div class="equip-slot-label">${s}</div>
      <div class="equip-slot-icon">${item?.emoji || slotEmojis[s]}</div>
      <div class="equip-slot-name">${item?.name || "None"}</div>
    </div>`;
  }).join("");
  openModal("modal-view-avatar");
}

// ── Chore grid (parent) ──────────────────────────────────
export function getChoreStatus(choreId, kidIds) {
  const relevant = state.completions.filter(c => c.choreId===choreId && (!kidIds || kidIds.includes(c.kidId)));
  if (!relevant.length) return "incomplete";
  const latest = relevant.sort((a,b) => {
    const ta=a.timestamp?.toDate?.()?.getTime()||0, tb=b.timestamp?.toDate?.()?.getTime()||0;
    return tb-ta;
  })[0];
  return latest.status;
}

export function renderParentChoreGrid() {
  const grid = document.getElementById("parent-chore-grid");
  if (!grid) return;
  grid.innerHTML = "";
  if (!state.chores.length) { grid.innerHTML = `<div class="empty-chores"><span>🎯</span><p>No chores yet.<br/>Add some in Manage.</p></div>`; return; }
  state.chores.forEach(chore => {
    const status = getChoreStatus(chore.id, null);
    const tile = document.createElement("button");
    tile.className = "chore-tile";
    if (status==="completed") tile.classList.add("state-approved");
    const kid = state.kids.find(k => (chore.assignedTo||[]).includes(k.id));
    tile.innerHTML = `
      ${status==="completed" ? `<div class="tile-status-dot approved"></div>` : ""}
      <div class="tile-freq-badge">${chore.frequency||"daily"}</div>
      <div class="tile-emoji">${chore.emoji||"🧹"}</div>
      <div class="tile-name">${chore.name}</div>
      <div class="tile-meta">${kid ? (kid.emoji||"👤")+" "+(kid.nickname||kid.name) : "Unassigned"}</div>
    `;
    tile.addEventListener("click", () => openChoreDetail(chore, status));
    grid.appendChild(tile);
  });
}

// ── Chore grid (kid) ─────────────────────────────────────
export function renderKidChoreGrid() {
  const grid = document.getElementById("kid-chore-grid");
  if (!grid || !state.kidId) return;
  grid.innerHTML = "";
  const myChores = state.chores.filter(ch => (ch.assignedTo||[]).includes(state.kidId));
  if (!myChores.length) { grid.innerHTML = `<div class="empty-chores"><span>🌟</span><p>No chores assigned yet.<br/>Ask your parent!</p></div>`; return; }
  const color = state.kidDoc?.themeColor || "#8b7cf8";
  const rgb = hexToRgb(color);
  myChores.forEach(chore => {
    const status = getChoreStatus(chore.id, [state.kidId]);
    const tile = document.createElement("button");
    tile.className = "chore-tile";
    if (status==="completed") {
      tile.style.background = `linear-gradient(135deg, rgba(${rgb},0.15), rgba(${rgb},0.05))`;
      tile.style.borderColor = `rgba(${rgb},0.4)`;
      tile.style.boxShadow = `0 0 16px rgba(${rgb},0.15)`;
    }
    tile.innerHTML = `
      ${status==="completed" ? `<div class="tile-status-dot approved"></div>` : ""}
      <div class="tile-freq-badge">${chore.frequency||"daily"}</div>
      <div class="tile-emoji">${chore.emoji||"🧹"}</div>
      <div class="tile-name">${chore.name}</div>
      <div class="tile-meta">${chore.points||10} pts</div>
    `;
    if (status==="incomplete") tile.addEventListener("click", () => markChoreDone(chore, tile));
    else tile.style.cursor = "default";
    grid.appendChild(tile);
  });

  // Add Propose Trade button
  const tradeBtn = document.createElement("button");
  tradeBtn.className = "btn-propose-trade";
  tradeBtn.innerHTML = `🤝 Propose a Trade`;
  tradeBtn.onclick = () => openTradeProposal();
  grid.appendChild(tradeBtn);
}

// ── Mark chore done ──────────────────────────────────────
async function markChoreDone(chore, tile) {
  if (!state.kidId || !state.familyIdKid) return;
  tile.classList.add("just-done"); tile.disabled = true;
  const color = state.kidDoc?.themeColor || "#8b7cf8";
  const rgb = hexToRgb(color);
  tile.style.background = `linear-gradient(135deg, rgba(${rgb},0.18), rgba(${rgb},0.06))`;
  tile.style.borderColor = `rgba(${rgb},0.5)`;
  tile.style.boxShadow = `0 0 24px rgba(${rgb},0.3)`;
  try {
    await addDoc(collection(db, "families", state.familyIdKid, "completions"), {
      choreId:chore.id, kidId:state.kidId, timestamp:serverTimestamp(), date:todayStr(), status:"completed"
    });
    const kidRef = doc(db, "families", state.familyIdKid, "kids", state.kidId);
    const kidSnap = await getDoc(kidRef);
    if (kidSnap.exists()) {
      const pts = chore.points || 10;
      const d = kidSnap.data();
      await updateDoc(kidRef, {
        points: (d.points||0) + pts,
        currentPoints: (d.currentPoints||d.points||0) + pts,
        totalLifetimePoints: (d.totalLifetimePoints||0) + pts,
        totalCompletions: (d.totalCompletions||0) + 1
      });
    }
    // Check streak
    const result = await calculateStreak(db, state.familyIdKid, state.kidId, state.chores, state.completions);
    if (result.bonus > 0) showStreakToast(result.streak, result.bonus);
    
    // Void any pending trades involving this chore
    try {
      const { voidTradesForChore } = await import("./trading.js");
      await voidTradesForChore(db, state.familyIdKid, chore.id);
    } catch(e) { console.warn("Trade void failed", e); }

    renderKidChoreGrid();
    refreshKidAvatarPanel();
  } catch(e) { console.error(e); }
}

// ── Streak toast ─────────────────────────────────────────
function showStreakToast(streak, bonus) {
  const toast = document.getElementById("streak-toast");
  const text = document.getElementById("streak-toast-text");
  if (!toast || !text) return;
  text.textContent = `${streak}-Day Streak! +${bonus} Bonus Points!`;
  toast.classList.remove("hidden");
  toast.classList.add("show");
  setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.classList.add("hidden"), 400); }, 3500);
}

// ── Chore detail modal ───────────────────────────────────
export function openChoreDetail(chore, status) {
  document.getElementById("detail-icon").textContent = chore.emoji||"🧹";
  document.getElementById("detail-name").textContent = chore.name;
  document.getElementById("detail-desc").textContent = chore.description||"";
  document.getElementById("detail-points").textContent = (chore.points||10)+" pts";
  document.getElementById("detail-freq").textContent = chore.frequency||"daily";
  const sb = document.getElementById("detail-status-badge");
  sb.textContent = status==="completed" ? "✅ done" : status;
  sb.className = "badge status-badge " + (status==="completed" ? "approved" : status);
  const ar = document.getElementById("detail-approve-row");
  if (status==="completed") {
    ar.style.display = "flex";
    const comp = state.completions.find(c => c.choreId===chore.id && c.status==="completed");
    document.getElementById("btn-undo-chore").onclick = () => undoCompletion(comp, chore);
  } else ar.style.display = "none";
  document.getElementById("btn-edit-chore").onclick = () => { closeModal("modal-chore-detail"); openEditChore(chore); };
  document.getElementById("btn-delete-chore").onclick = () => deleteChore(chore);
  openModal("modal-chore-detail");
}

export async function undoCompletion(completion, chore) {
  if (!completion || !state.familyId) return;
  if (!confirm("Undo this completion? Points will be removed.")) return;
  try {
    await deleteDoc(doc(db, "families", state.familyId, "completions", completion.id));
    const kid = state.kids.find(k => k.id===completion.kidId);
    if (kid) {
      const pts = chore.points||10;
      await updateDoc(doc(db, "families", state.familyId, "kids", kid.id), {
        points: Math.max(0, (kid.points||0)-pts),
        currentPoints: Math.max(0, (kid.currentPoints||kid.points||0)-pts),
        totalCompletions: Math.max(0, (kid.totalCompletions||0)-1)
      });
    }
    closeModal("modal-chore-detail"); closeModal("modal-kid-history");
  } catch(e) { console.error(e); }
}

// ── Manage lists ─────────────────────────────────────────
export function renderManageLists() { renderKidsList(); renderChoresList(); renderStatusOverview(); }

function renderKidsList() {
  const list = document.getElementById("kids-list");
  if (!list) return;
  list.innerHTML = "";
  if (!state.kids.length) { list.innerHTML = `<p class="empty-sm">No kids added yet.</p>`; return; }
  state.kids.forEach(kid => {
    const level = getLevel(kid.totalLifetimePoints||0);
    const item = document.createElement("div");
    item.className = "manage-item";
    item.innerHTML = `
      <div class="manage-item-emoji">${kid.emoji||"⭐"}</div>
      <div class="manage-item-info">
        <div class="manage-item-name">${kid.nickname||kid.name}</div>
        <div class="manage-item-sub">Lv.${level} · ${kid.currentPoints||kid.points||0} pts · 🔥${kid.streak||0}</div>
      </div>
      <button class="btn-view-kid" data-id="${kid.id}">View</button>
      <button class="manage-item-action" data-id="${kid.id}">×</button>
    `;
    item.querySelector(".btn-view-kid").addEventListener("click", e => { e.stopPropagation(); viewKidHistory(kid.id); });
    item.querySelector(".manage-item-action").addEventListener("click", e => { e.stopPropagation(); if(confirm(`Remove ${kid.name}?`)) removeKid(kid.id); });
    list.appendChild(item);
  });
}

function renderChoresList() {
  const list = document.getElementById("chores-list");
  if (!list) return;
  list.innerHTML = "";
  if (!state.chores.length) { list.innerHTML = `<p class="empty-sm">No chores added yet.</p>`; return; }
  state.chores.forEach(chore => {
    const names = (chore.assignedTo||[]).map(id => state.kids.find(k=>k.id===id)).filter(Boolean).map(k=>k.nickname||k.name).join(", ")||"Unassigned";
    const item = document.createElement("div");
    item.className = "manage-item";
    item.innerHTML = `
      <div class="manage-item-emoji">${chore.emoji||"🧹"}</div>
      <div class="manage-item-info">
        <div class="manage-item-name">${chore.name}</div>
        <div class="manage-item-sub">${chore.points||10} pts · ${chore.frequency||"daily"} · ${names}</div>
      </div>
      <button class="manage-item-action" data-id="${chore.id}">×</button>
    `;
    item.addEventListener("click", e => { if(!e.target.closest(".manage-item-action")) openEditChore(chore); });
    item.querySelector(".manage-item-action").addEventListener("click", e => { e.stopPropagation(); if(confirm(`Delete "${chore.name}"?`)) deleteChore(chore); });
    list.appendChild(item);
  });
}

function renderStatusOverview() {
  const el = document.getElementById("status-overview");
  if (!el) return;
  const today = todayStr();
  const done = state.completions.filter(c => c.status==="completed" && c.date===today);
  const total = state.chores.reduce((s,ch) => s+(ch.assignedTo||[]).length, 0);
  if (!done.length) { el.innerHTML = `<p class="empty-sm">No chores completed yet today.</p>`; return; }
  const byKid = {};
  done.forEach(c => { byKid[c.kidId] = (byKid[c.kidId]||0)+1; });
  el.innerHTML = Object.entries(byKid).map(([kidId,count]) => {
    const kid = state.kids.find(k=>k.id===kidId);
    return `<p class="empty-sm">${kid?.emoji||"👤"} ${kid?(kid.nickname||kid.name):"Unknown"} — <strong style="color:var(--accent-green)">${count} done</strong></p>`;
  }).join("") + `<p class="empty-sm" style="margin-top:6px;color:var(--text-muted)">${done.length}/${total} total</p>`;
}

// ── Kid CRUD ─────────────────────────────────────────────
export async function addKid() {
  const name = document.getElementById("kid-name-input").value.trim();
  const age = parseInt(document.getElementById("kid-age-input").value)||0;
  const errEl = document.getElementById("add-kid-error");
  errEl.textContent = "";
  if (!name) { errEl.textContent = "Enter a name."; return; }
  if (!state.familyId) return;
  try {
    await addDoc(collection(db, "families", state.familyId, "kids"), {
      name, age, emoji:state.selectedKidEmoji, themeColor:"#8b7cf8",
      points:0, currentPoints:0, totalLifetimePoints:0,
      streak:0, lastStreakDate:"", streakBonusEarned:{}, equippedItems:{},
      baseCharacterId:null, level:1, totalCompletions:0, badges:[],
      createdAt:serverTimestamp()
    });
    closeModal("modal-add-kid");
    document.getElementById("kid-name-input").value = "";
    document.getElementById("kid-age-input").value = "";
  } catch(e) { errEl.textContent = e.message; }
}

export async function removeKid(kidId) {
  if (!state.familyId) return;
  try { await deleteDoc(doc(db, "families", state.familyId, "kids", kidId)); } catch(e) { console.error(e); }
}

// ── Chore CRUD ───────────────────────────────────────────
export function openAddChore() {
  state.editingChoreId = null;
  document.getElementById("chore-modal-title").textContent = "New Chore";
  document.getElementById("chore-name-input").value = "";
  document.getElementById("chore-desc-input").value = "";
  document.getElementById("chore-points-input").value = "10";
  document.getElementById("chore-freq-input").value = "daily";
  document.getElementById("add-chore-error").textContent = "";
  state.selectedChoreEmoji = "🧹"; state.selectedAssignedTo = [];
  import("./app-core.js").then(m => m.renderEmojiGrid("chore-emoji-picker", m.CHORE_EMOJIS, e => { state.selectedChoreEmoji=e; }, "🧹"));
  renderAssignList(); openModal("modal-add-chore");
}

export function openEditChore(chore) {
  state.editingChoreId = chore.id;
  document.getElementById("chore-modal-title").textContent = "Edit Chore";
  document.getElementById("chore-name-input").value = chore.name||"";
  document.getElementById("chore-desc-input").value = chore.description||"";
  document.getElementById("chore-points-input").value = chore.points||10;
  document.getElementById("chore-freq-input").value = chore.frequency||"daily";
  document.getElementById("add-chore-error").textContent = "";
  state.selectedChoreEmoji = chore.emoji||"🧹";
  state.selectedAssignedTo = [...(chore.assignedTo||[])];
  import("./app-core.js").then(m => m.renderEmojiGrid("chore-emoji-picker", m.CHORE_EMOJIS, e => { state.selectedChoreEmoji=e; }, state.selectedChoreEmoji));
  renderAssignList(); openModal("modal-add-chore");
}

export function renderAssignList() {
  const el = document.getElementById("assign-kids-list");
  if (!el) return;
  el.innerHTML = "";
  if (!state.kids.length) { el.innerHTML = `<p class="empty-sm">No kids yet.</p>`; return; }
  state.kids.forEach(kid => {
    const selected = state.selectedAssignedTo.includes(kid.id);
    const item = document.createElement("div");
    item.className = "assign-item" + (selected?" selected":"");
    item.innerHTML = `<div class="assign-check">${selected?"✓":""}</div><span style="font-size:20px;">${kid.emoji||"⭐"}</span><span style="font-size:14px;font-weight:600;">${kid.nickname||kid.name}</span>`;
    item.addEventListener("click", () => {
      if (state.selectedAssignedTo.includes(kid.id)) state.selectedAssignedTo = state.selectedAssignedTo.filter(id=>id!==kid.id);
      else state.selectedAssignedTo.push(kid.id);
      renderAssignList();
    });
    el.appendChild(item);
  });
}

export async function saveChore() {
  const name = document.getElementById("chore-name-input").value.trim();
  const desc = document.getElementById("chore-desc-input").value.trim();
  const points = parseInt(document.getElementById("chore-points-input").value)||10;
  const freq = document.getElementById("chore-freq-input").value;
  const errEl = document.getElementById("add-chore-error");
  errEl.textContent = "";
  if (!name) { errEl.textContent = "Enter a chore name."; return; }
  if (!state.familyId) return;
  const data = { name, description:desc, points, frequency:freq, emoji:state.selectedChoreEmoji, assignedTo:state.selectedAssignedTo };
  try {
    if (state.editingChoreId) await updateDoc(doc(db, "families", state.familyId, "chores", state.editingChoreId), data);
    else { data.createdAt = serverTimestamp(); await addDoc(collection(db, "families", state.familyId, "chores"), data); }
    closeModal("modal-add-chore"); closeModal("modal-chore-detail");
  } catch(e) { errEl.textContent = e.message; }
}

export async function deleteChore(chore) {
  if (!state.familyId || !confirm(`Delete "${chore.name}"?`)) return;
  try { await deleteDoc(doc(db, "families", state.familyId, "chores", chore.id)); closeModal("modal-chore-detail"); } catch(e) { console.error(e); }
}

// ── Kid history ──────────────────────────────────────────
export async function viewKidHistory(kidId) {
  const kid = state.kids.find(k=>k.id===kidId);
  if (!kid || !state.familyId) return;
  document.getElementById("kid-history-avatar").textContent = kid.emoji||"⭐";
  document.getElementById("kid-history-name").textContent = kid.nickname||kid.name;
  document.getElementById("kid-history-content").innerHTML = `<p class="empty-sm">Loading...</p>`;
  openModal("modal-kid-history");
  try {
    const today = todayStr();
    const kidChores = state.chores.filter(c=>(c.assignedTo||[]).includes(kidId));
    const compSnap = await getDocs(query(collection(db,"families",state.familyId,"completions"),where("kidId","==",kidId)));
    const allComps = compSnap.docs.map(d=>({id:d.id,...d.data()}));
    const todayDone = allComps.filter(c=>c.date===today&&c.status==="completed");
    const doneIds = todayDone.map(c=>c.choreId);
    const done = kidChores.filter(c=>doneIds.includes(c.id));
    const todo = kidChores.filter(c=>!doneIds.includes(c.id));
    let html = "";
    if (!kidChores.length) html = `<p class="empty-sm">No chores assigned yet.</p>`;
    else {
      if (done.length) {
        html += `<div class="hist-label">✅ Completed Today (${done.length})</div>`;
        html += done.map(c => `<div class="hist-item done"><span>${c.emoji||"📋"} ${c.name}</span><span class="hist-pts">+${c.points} pts</span></div>`).join("");
      }
      if (todo.length) {
        html += `<div class="hist-label">⭕ Still To Do (${todo.length})</div>`;
        html += todo.map(c => `<div class="hist-item todo"><span>${c.emoji||"📋"} ${c.name}</span><span class="hist-pts">${c.points} pts</span></div>`).join("");
      }
    }
    document.getElementById("kid-history-content").innerHTML = html;
  } catch(e) { document.getElementById("kid-history-content").innerHTML = `<p class="empty-sm">Error.</p>`; console.error(e); }
}

// ── Character Select Screen ──────────────────────────────
export function renderCharSelectGrid() {
  const grid = document.getElementById("char-select-grid");
  if (!grid) return;
  grid.innerHTML = "";
  state.selectedCharId = null;
  document.getElementById("btn-confirm-char").disabled = true;
  CHARACTERS.forEach(char => {
    const card = document.createElement("button");
    card.className = "char-card";
    card.innerHTML = `
      ${char.img ? `<img class="char-card-img" src="${char.img}" alt="${char.name}">` : `<div class="char-card-img" style="font-size:42px;display:flex;align-items:center;justify-content:center;">${char.emoji}</div>`}
      <div class="char-card-name">${char.name}</div>
    `;
    card.addEventListener("click", () => {
      grid.querySelectorAll(".char-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      state.selectedCharId = char.id;
      document.getElementById("btn-confirm-char").disabled = false;
    });
    grid.appendChild(card);
  });
}

// ── Avatar Panel (kid dashboard) ─────────────────────────
export async function refreshKidAvatarPanel() {
  const kid = state.kids.find(k=>k.id===state.kidId) || state.kidDoc;
  if (!kid) return;
  const level = getLevel(kid.totalLifetimePoints||0);
  const tier = getLevelTier(level);
  // Showcase
  renderAvatarContent(document.getElementById("avatar-showcase-img"), kid);
  const nameEl = document.getElementById("avatar-showcase-name");
  if (nameEl) nameEl.textContent = kid.nickname || kid.name || "Your Hero";
  const lvEl = document.getElementById("avatar-showcase-level");
  if (lvEl) lvEl.innerHTML = `${getLevelBadgeHTML(level)}<span class="streak-badge">🔥 ${kid.streak||0} day streak</span>`;
  // Equipped slots
  const equipped = kid.equippedItems || {};
  const slotEmojis = {outfit:"👕",armor:"🛡️",weapon:"⚔️",accessory:"✨"};
  ["outfit","armor","weapon","accessory"].forEach(s => {
    const slot = document.querySelector(`.equip-slot[data-slot="${s}"]`);
    if (!slot) return;
    const itemId = equipped[s];
    const item = itemId ? getItemById(itemId) : null;
    slot.querySelector(".equip-slot-icon").textContent = item?.emoji || slotEmojis[s];
    slot.querySelector(".equip-slot-name").textContent = item?.name || "None";
  });
  // Stats
  const setTxt = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
  setTxt("stat-lifetime-pts", kid.totalLifetimePoints||0);
  setTxt("stat-current-pts", kid.currentPoints||kid.points||0);
  setTxt("stat-level", level);
  setTxt("stat-streak", (kid.streak||0)+" days");
  setTxt("stat-total-chores", kid.totalCompletions||0);
}

// ── Store ────────────────────────────────────────────────
export function renderStore() {
  const kid = state.kids.find(k=>k.id===state.kidId) || state.kidDoc;
  if (!kid) return;
  const level = getLevel(kid.totalLifetimePoints||0);
  const tier = getLevelTier(level);
  const bal = kid.currentPoints || kid.points || 0;
  // Header
  const balEl = document.getElementById("store-balance-val"); if(balEl) balEl.textContent = bal;
  const lvBadge = document.getElementById("store-level-badge"); if(lvBadge) { lvBadge.textContent = `Lv. ${level}`; lvBadge.className = `store-level-badge level-badge lv-${tier}`; }
  // Grid
  const grid = document.getElementById("store-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const cat = state.storeCategory;
  const items = STORE_ITEMS.filter(i => cat==="all" || i.category===cat);
  const ownedIds = new Set(state.inventory.map(i=>i.itemId));
  items.forEach(item => {
    const locked = level < item.requiredLevel;
    const owned = ownedIds.has(item.id);
    const card = document.createElement("button");
    card.className = `store-item-card rarity-${item.rarity}${locked?" locked":""}${owned?" owned":""}`;
    card.innerHTML = `
      <div class="store-item-img">${item.emoji}</div>
      <div class="store-item-name">${item.name}</div>
      ${owned ? `<div class="store-item-owned-badge">Owned ✓</div>` : locked ? `<div class="store-item-price">Lv.${item.requiredLevel} 🔒</div>` : `<div class="store-item-price">${item.price} pts</div>`}
    `;
    card.addEventListener("click", () => openStoreItemDetail(item, owned, locked));
    grid.appendChild(card);
  });
}

function openStoreItemDetail(item, owned, locked) {
  document.getElementById("store-detail-img").textContent = item.emoji;
  document.getElementById("store-detail-name").textContent = item.name;
  document.getElementById("store-detail-desc").textContent = item.desc||"";
  document.getElementById("store-detail-price").textContent = item.price+" pts";
  const rarBadge = document.getElementById("store-detail-rarity");
  rarBadge.textContent = item.rarity; rarBadge.className = `badge rarity-badge-${item.rarity}`;
  document.getElementById("store-detail-category").textContent = item.category;
  document.getElementById("store-detail-level").textContent = `Lv.${item.requiredLevel}+`;
  const buyBtn = document.getElementById("btn-buy-item");
  if (owned) {
    const invItem = state.inventory.find(i=>i.itemId===item.id);
    const isEquipped = invItem?.equipped;
    buyBtn.textContent = isEquipped ? "Unequip" : "Equip";
    buyBtn.disabled = false;
    buyBtn.onclick = async () => {
      try {
        const { equipItem, unequipItem } = await import("./gamification.js");
        if (isEquipped) await unequipItem(db, state.familyIdKid, state.kidId, invItem.id, item.id);
        else await equipItem(db, state.familyIdKid, state.kidId, invItem.id, item.id);
        await refreshInventory();
        renderStore(); refreshKidAvatarPanel(); closeModal("modal-store-item");
      } catch(e) { alert(e.message); }
    };
  } else {
    buyBtn.textContent = locked ? "Locked" : `Buy (${item.price} pts)`;
    buyBtn.disabled = locked;
    buyBtn.onclick = async () => {
      try {
        const { purchaseItem } = await import("./gamification.js");
        await purchaseItem(db, state.familyIdKid, state.kidId, item.id);
        await refreshInventory();
        renderStore(); refreshKidAvatarPanel(); closeModal("modal-store-item");
      } catch(e) { alert(e.message); }
    };
  }
  openModal("modal-store-item");
}

export async function refreshInventory() {
  if (!state.kidId || !state.familyIdKid) return;
  const { getInventory } = await import("./gamification.js");
  state.inventory = await getInventory(db, state.familyIdKid, state.kidId);
}

// ── Daily Summary ────────────────────────────────────────
export async function showDailySummary() {
  if (!state.familyId) return;
  openModal("modal-daily-summary");
  document.getElementById("daily-summary-content").innerHTML = `<p class="empty-sm">Loading...</p>`;
  try {
    const today = todayStr();
    const compSnap = await getDocs(query(collection(db,"families",state.familyId,"completions"),where("date","==",today)));
    const todayComps = compSnap.docs.map(d=>({id:d.id,...d.data()})).filter(c=>c.status==="completed");
    let totalA=0, totalD=0;
    const sections = state.kids.map(kid => {
      const kidChores = state.chores.filter(c=>(c.assignedTo||[]).includes(kid.id));
      const doneIds = todayComps.filter(c=>c.kidId===kid.id).map(c=>c.choreId);
      const done = kidChores.filter(c=>doneIds.includes(c.id));
      const todo = kidChores.filter(c=>!doneIds.includes(c.id));
      totalA += kidChores.length; totalD += done.length;
      if (!kidChores.length) return `<div class="sum-kid"><div class="sum-kid-hdr">${kid.emoji||"⭐"} <strong>${kid.nickname||kid.name}</strong> — no chores</div></div>`;
      return `<div class="sum-kid"><div class="sum-kid-hdr">${kid.emoji||"⭐"} <strong>${kid.nickname||kid.name}</strong> — ${done.length}/${kidChores.length}</div>
        ${done.length?`<div class="sum-label">✅ Done</div>${done.map(c=>`<div class="sum-row done">${c.emoji||"📋"} ${c.name} <span class="hist-pts">+${c.points} pts</span></div>`).join("")}`:""}
        ${todo.length?`<div class="sum-label">⭕ Not Done</div>${todo.map(c=>`<div class="sum-row todo">${c.emoji||"📋"} ${c.name}</div>`).join("")}`:""}
      </div>`;
    }).join("");
    const pct = totalA ? Math.round(totalD/totalA*100) : 0;
    const dateStr = new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});
    document.getElementById("daily-summary-content").innerHTML = `
      <p style="text-align:center;color:var(--text-muted);font-size:13px;margin-bottom:12px">${dateStr}</p>
      <div class="sum-overall">Family completed <strong>${pct}%</strong> today<br><span style="font-size:13px;opacity:0.8">${totalD} of ${totalA} chores done</span></div>
      ${state.kids.length ? sections : "<p class='empty-sm'>No kids yet.</p>"}
    `;
  } catch(e) { document.getElementById("daily-summary-content").innerHTML = `<p class="empty-sm">Error.</p>`; console.error(e); }
}

// ═══════════════════════════════════════════════════════
//  BOUNTY BOARD UI
// ═══════════════════════════════════════════════════════

export function renderBountyBoard(bounties) {
  const el = document.getElementById("kid-bounty-board");
  if (!el) return;
  const active = bounties.filter(b => b.status === "open" || b.status === "claimed");
  if (!active.length) {
    el.innerHTML = `<p class="empty-sm">No bounties right now. Check back later!</p>`;
    return;
  }
  el.innerHTML = "";
  active.forEach(b => {
    const isOpen = b.status === "open";
    const isMine = b.claimedBy === state.kidId;
    const claimer = state.kids.find(k => k.id === b.claimedBy);
    const card = document.createElement("div");
    card.className = `bounty-card ${isOpen ? "bounty-open" : "bounty-claimed"}`;
    card.innerHTML = `
      <div class="bounty-emoji">${b.emoji || "⚡"}</div>
      <div class="bounty-info">
        <div class="bounty-name">${b.name}</div>
        <div class="bounty-sub">${isOpen ? "First come, first served!" : isMine ? "You claimed this!" : `Claimed by ${claimer?.nickname || claimer?.name || "someone"}`}</div>
      </div>
      ${isOpen ? `<div class="bounty-pts">${b.points} pts</div>` : `<span class="bounty-claimed-badge">${isMine ? "Yours ✓" : "Taken"}</span>`}
    `;
    card.addEventListener("click", () => openBountyDetail(b));
    el.appendChild(card);
  });
}

function openBountyDetail(bounty) {
  document.getElementById("bounty-detail-icon").textContent = bounty.emoji || "⚡";
  document.getElementById("bounty-detail-name").textContent = bounty.name;
  document.getElementById("bounty-detail-desc").textContent = bounty.description || "Complete this bounty to earn bonus points!";
  document.getElementById("bounty-detail-pts").textContent = bounty.points + " pts";
  const deadlineEl = document.getElementById("bounty-detail-deadline");
  deadlineEl.textContent = bounty.deadline ? `Due ${bounty.deadline}` : "No deadline";
  const statusEl = document.getElementById("bounty-detail-status");
  const claimBtn = document.getElementById("btn-claim-bounty");
  if (bounty.status === "open") {
    statusEl.textContent = "⚡ Open"; statusEl.className = "badge bounty-pts-badge";
    claimBtn.style.display = ""; claimBtn.textContent = "⚡ Claim It!"; claimBtn.disabled = false;
    claimBtn.onclick = async () => {
      claimBtn.disabled = true; claimBtn.textContent = "Claiming...";
      try {
        const { claimBounty } = await import("./bounty.js");
        await claimBounty(db, state.familyIdKid, bounty.id, state.kidId);
        claimBtn.textContent = "✅ Claimed!";
        setTimeout(() => closeModal("modal-bounty-detail"), 800);
      } catch (e) {
        alert(e.message);
        claimBtn.disabled = false; claimBtn.textContent = "⚡ Claim It!";
      }
    };
  } else {
    const isMine = bounty.claimedBy === state.kidId;
    statusEl.textContent = isMine ? "Yours ✓" : "Taken";
    statusEl.className = "badge";
    claimBtn.style.display = isMine ? "" : "none";
    if (isMine) {
      claimBtn.textContent = "✅ Mark Complete";
      claimBtn.disabled = false;
      claimBtn.onclick = async () => {
        claimBtn.disabled = true; claimBtn.textContent = "Completing...";
        try {
          const { completeBounty } = await import("./bounty.js");
          const result = await completeBounty(db, state.familyIdKid, bounty.id, state.kidId);
          claimBtn.textContent = `+${result.points} pts!`;
          setTimeout(() => closeModal("modal-bounty-detail"), 800);
        } catch(e) { alert(e.message); claimBtn.disabled = false; claimBtn.textContent = "✅ Mark Complete"; }
      };
    }
  }
  openModal("modal-bounty-detail");
}

// Parent bounty list
export function renderParentBountyList(bounties) {
  const el = document.getElementById("parent-bounty-list");
  if (!el) return;
  if (!bounties.length) { el.innerHTML = `<p class="empty-sm">No bounties posted.</p>`; return; }
  el.innerHTML = "";
  bounties.forEach(b => {
    const claimer = b.claimedBy ? state.kids.find(k => k.id === b.claimedBy) : null;
    const item = document.createElement("div");
    item.className = "manage-item";
    item.innerHTML = `
      <div class="manage-item-emoji">${b.emoji || "⚡"}</div>
      <div class="manage-item-info">
        <div class="manage-item-name">${b.name}</div>
        <div class="manage-item-sub">${b.points} pts · ${b.status === "open" ? "Open" : b.status === "claimed" ? `Claimed by ${claimer?.name||"?"}` : b.status}</div>
      </div>
      <button class="manage-item-action" data-id="${b.id}">×</button>
    `;
    item.querySelector(".manage-item-action").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete bounty "${b.name}"?`)) return;
      const { deleteBounty } = await import("./bounty.js");
      await deleteBounty(db, state.familyId, b.id);
    });
    el.appendChild(item);
  });
}

// ═══════════════════════════════════════════════════════
//  CHORE TRADING UI
// ═══════════════════════════════════════════════════════

export function renderPendingTrades(trades) {
  const el = document.getElementById("pending-trades-list");
  const label = document.getElementById("pending-trades-label");
  if (!el || !label) return;
  const myTrades = trades.filter(t =>
    t.status === "pending" && (t.proposerId === state.kidId || t.receiverId === state.kidId)
  );
  if (!myTrades.length) { el.innerHTML = ""; label.style.display = "none"; return; }
  label.style.display = "";
  el.innerHTML = "";
  myTrades.forEach(t => {
    const isIncoming = t.receiverId === state.kidId;
    const otherKid = state.kids.find(k => k.id === (isIncoming ? t.proposerId : t.receiverId));
    const myChores = (isIncoming ? t.receiverChoreIds : t.proposerChoreIds).map(cid => state.chores.find(c => c.id === cid)).filter(Boolean);
    const theirChores = (isIncoming ? t.proposerChoreIds : t.receiverChoreIds).map(cid => state.chores.find(c => c.id === cid)).filter(Boolean);

    const card = document.createElement("div");
    card.className = "trade-card";
    card.innerHTML = `
      <div class="trade-card-header">
        ${isIncoming ? `📥 ${otherKid?.nickname || otherKid?.name || "?"} wants to trade` : `📤 Trade with ${otherKid?.nickname || otherKid?.name || "?"}`}
        <span class="trade-badge pending">Pending</span>
      </div>
      <div class="trade-swap">
        <div class="trade-side">
          <div class="trade-side-label">${isIncoming ? "They offer" : "You offer"}</div>
          ${(isIncoming ? theirChores : myChores).map(c => `<div class="trade-chore-chip">${c.emoji||"📋"} ${c.name}</div>`).join("")}
        </div>
        <div class="trade-arrow">⇄</div>
        <div class="trade-side">
          <div class="trade-side-label">${isIncoming ? "They want" : "You get"}</div>
          ${(isIncoming ? myChores : theirChores).map(c => `<div class="trade-chore-chip">${c.emoji||"📋"} ${c.name}</div>`).join("")}
        </div>
      </div>
    `;
    card.addEventListener("click", () => openTradeView(t, isIncoming, otherKid));
    el.appendChild(card);
  });
}

function openTradeView(trade, isIncoming, otherKid) {
  const content = document.getElementById("trade-view-content");
  const actions = document.getElementById("trade-view-actions");
  const myChores = (isIncoming ? trade.receiverChoreIds : trade.proposerChoreIds).map(cid => state.chores.find(c => c.id === cid)).filter(Boolean);
  const theirChores = (isIncoming ? trade.proposerChoreIds : trade.receiverChoreIds).map(cid => state.chores.find(c => c.id === cid)).filter(Boolean);

  content.innerHTML = `
    <p style="font-size:14px;color:var(--text-muted);margin:12px 0">${isIncoming ? `${otherKid?.nickname || "?"} wants to trade with you` : `Waiting for ${otherKid?.nickname || "?"} to respond`}</p>
    <div class="trade-swap" style="text-align:left;margin:16px 0">
      <div class="trade-side">
        <div class="trade-side-label">${isIncoming ? "They offer" : "You offer"}</div>
        ${(isIncoming ? theirChores : myChores).map(c => `<div class="trade-chore-chip">${c.emoji||"📋"} ${c.name} <span style="margin-left:auto;font-size:11px;color:var(--text-muted)">${c.points||10}pts</span></div>`).join("")}
      </div>
      <div class="trade-arrow">⇄</div>
      <div class="trade-side">
        <div class="trade-side-label">${isIncoming ? "For your" : "You get"}</div>
        ${(isIncoming ? myChores : theirChores).map(c => `<div class="trade-chore-chip">${c.emoji||"📋"} ${c.name} <span style="margin-left:auto;font-size:11px;color:var(--text-muted)">${c.points||10}pts</span></div>`).join("")}
      </div>
    </div>
  `;

  if (isIncoming) {
    actions.innerHTML = `
      <button class="btn-ghost" id="btn-decline-trade">Decline</button>
      <button class="btn-primary" id="btn-accept-trade">✅ Accept Trade</button>
    `;
    document.getElementById("btn-accept-trade").onclick = async () => {
      const btn = document.getElementById("btn-accept-trade");
      btn.disabled = true; btn.textContent = "Accepting...";
      try {
        const { acceptTrade } = await import("./trading.js");
        await acceptTrade(db, state.familyIdKid, trade.id);
        btn.textContent = "✅ Traded!";
        setTimeout(() => closeModal("modal-view-trade"), 800);
      } catch(e) { alert(e.message); btn.disabled = false; btn.textContent = "✅ Accept Trade"; }
    };
    document.getElementById("btn-decline-trade").onclick = async () => {
      const { declineTrade } = await import("./trading.js");
      await declineTrade(db, state.familyIdKid, trade.id);
      closeModal("modal-view-trade");
    };
  } else {
    actions.innerHTML = `
      <button class="btn-ghost" id="btn-cancel-trade-view">Cancel Trade</button>
      <button class="btn-ghost" id="btn-close-trade-view">Close</button>
    `;
    document.getElementById("btn-cancel-trade-view").onclick = async () => {
      const { cancelTrade } = await import("./trading.js");
      await cancelTrade(db, state.familyIdKid, trade.id);
      closeModal("modal-view-trade");
    };
    document.getElementById("btn-close-trade-view").onclick = () => closeModal("modal-view-trade");
  }
  openModal("modal-view-trade");
}

// Trade proposal modal logic
export function openTradeProposal() {
  state.tradeMyChores = [];
  state.tradeTargetKid = null;
  state.tradeTheirChores = [];
  document.getElementById("trade-error").textContent = "";

  // My chores
  const myChoresEl = document.getElementById("trade-my-chores");
  const myChores = state.chores.filter(ch => (ch.assignedTo||[]).includes(state.kidId));
  myChoresEl.innerHTML = "";
  if (!myChores.length) { myChoresEl.innerHTML = `<p class="empty-sm">No chores to trade.</p>`; }
  else myChores.forEach(ch => {
    const item = document.createElement("div");
    item.className = "trade-pick-item";
    item.innerHTML = `<div class="trade-pick-check">✓</div><span style="font-size:18px">${ch.emoji||"📋"}</span><span style="font-size:14px;font-weight:600;flex:1">${ch.name}</span><span style="font-size:12px;color:var(--text-muted)">${ch.points||10}pts</span>`;
    item.addEventListener("click", () => {
      const idx = state.tradeMyChores.indexOf(ch.id);
      if (idx >= 0) state.tradeMyChores.splice(idx, 1); else state.tradeMyChores.push(ch.id);
      item.classList.toggle("selected", state.tradeMyChores.includes(ch.id));
    });
    myChoresEl.appendChild(item);
  });

  // Target kids
  const kidsEl = document.getElementById("trade-target-kids");
  const siblings = state.kids.filter(k => k.id !== state.kidId);
  kidsEl.innerHTML = "";
  if (!siblings.length) kidsEl.innerHTML = `<p class="empty-sm">No siblings to trade with.</p>`;
  else siblings.forEach(kid => {
    const char = getCharById(kid.baseCharacterId);
    const avatar = char?.emoji || kid.emoji || "⭐";
    const btn = document.createElement("button");
    btn.className = "trade-kid-btn";
    btn.innerHTML = `<span style="font-size:20px">${avatar}</span> ${kid.nickname||kid.name}`;
    btn.addEventListener("click", () => {
      state.tradeTargetKid = kid.id;
      kidsEl.querySelectorAll(".trade-kid-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      renderTargetKidChores(kid.id);
    });
    kidsEl.appendChild(btn);
  });

  document.getElementById("trade-their-chores").innerHTML = `<p class="empty-sm">Select a sibling first</p>`;
  openModal("modal-trade-proposal");
}

function renderTargetKidChores(kidId) {
  const el = document.getElementById("trade-their-chores");
  state.tradeTheirChores = [];
  const theirChores = state.chores.filter(ch => (ch.assignedTo||[]).includes(kidId));
  el.innerHTML = "";
  if (!theirChores.length) { el.innerHTML = `<p class="empty-sm">They have no chores right now.</p>`; return; }
  theirChores.forEach(ch => {
    const item = document.createElement("div");
    item.className = "trade-pick-item";
    item.innerHTML = `<div class="trade-pick-check">✓</div><span style="font-size:18px">${ch.emoji||"📋"}</span><span style="font-size:14px;font-weight:600;flex:1">${ch.name}</span><span style="font-size:12px;color:var(--text-muted)">${ch.points||10}pts</span>`;
    item.addEventListener("click", () => {
      const idx = state.tradeTheirChores.indexOf(ch.id);
      if (idx >= 0) state.tradeTheirChores.splice(idx, 1); else state.tradeTheirChores.push(ch.id);
      item.classList.toggle("selected", state.tradeTheirChores.includes(ch.id));
    });
    el.appendChild(item);
  });
}

export async function sendTradeProposal() {
  const errEl = document.getElementById("trade-error");
  errEl.textContent = "";
  if (!state.tradeMyChores.length) { errEl.textContent = "Select at least one of your chores."; return; }
  if (!state.tradeTargetKid) { errEl.textContent = "Pick a sibling to trade with."; return; }
  if (!state.tradeTheirChores.length) { errEl.textContent = "Select at least one of their chores."; return; }
  try {
    const { proposeTrade } = await import("./trading.js");
    await proposeTrade(db, state.familyIdKid, state.kidId, state.tradeTargetKid, state.tradeMyChores, state.tradeTheirChores);
    closeModal("modal-trade-proposal");
  } catch(e) { errEl.textContent = e.message; }
}

