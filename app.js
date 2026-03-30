// ═══════════════════════════════════════════════════════
// ChoreQuest — Main App (Event Wiring & Bootstrap)
// ═══════════════════════════════════════════════════════
import { auth, db, state, showScreen, openModal, closeModal, genCode, hexToRgb, todayStr, renderEmojiGrid, KID_EMOJIS, CHORE_EMOJIS, THEME_COLORS, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, signOut, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, query, where, getDocs, onSnapshot, serverTimestamp } from "./app-core.js";
import { CHARACTERS, getCharById, getLevel, getLevelTier } from "./gamedata.js";
import { seedStoreIfNeeded } from "./gamification.js";
import { renderLeaderboard, renderParentChoreGrid, renderKidChoreGrid, renderManageLists, addKid, removeKid, openAddChore, saveChore, showDailySummary, renderAvatarContent, renderCharSelectGrid, openChoreDetail, refreshKidAvatarPanel, renderStore, refreshInventory, viewKidHistory, renderBountyBoard, renderParentBountyList, renderPendingTrades, sendTradeProposal, renderParentTradeReview } from "./app-ui.js";
import { postBounty } from "./bounty.js";

// ── Notifications ────────────────────────────────────────
async function requestNotificationPermission() {
 if (!("Notification" in window)) return false;
 if (Notification.permission === "granted") return true;
 return (await Notification.requestPermission()) === "granted";
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
 if (h===17 && m===0 && state.kidId && state.familyIdKid) {
   const key = `kidRem-${state.kidId}-${todayStr()}`;
   if (!localStorage.getItem(key)) {
     const today = todayStr();
     const incomplete = state.chores.filter(ch => (ch.assignedTo||[]).includes(state.kidId) && !state.completions.find(c => c.choreId===ch.id && c.status==="completed" && c.date===today));
     if (incomplete.length) {
       sendNotification("ChoreQuest ⭐", `You still have ${incomplete.length} chore${incomplete.length>1?"s":""} left today!`);
       localStorage.setItem(key,"1");
     }
   }
 }
 if (h===21 && m===0 && state.parentUser && state.familyId) {
   const key = `parentSum-${todayStr()}`;
   if (!localStorage.getItem(key)) {
     sendNotification("ChoreQuest ⭐", "Daily summary is ready.");
     localStorage.setItem(key,"1");
     showDailySummary();
   }
 }
}

// ── Invite ───────────────────────────────────────────────
function renderInvite() {
 const code = state.familyDoc?.inviteCode || "";
 const codeEl = document.getElementById("invite-code-display");
 const linkEl = document.getElementById("invite-link-wrap");
 if (codeEl) codeEl.textContent = code || "------";
 if (linkEl) linkEl.textContent = `${location.origin}${location.pathname}?join=${code}`;
}
async function regenCode() {
 if (!state.familyId) return;
 const code = genCode();
 await updateDoc(doc(db, "families", state.familyId), { inviteCode: code });
 renderInvite();
 document.getElementById("copy-success").textContent = "New code generated!";
 setTimeout(() => { document.getElementById("copy-success").textContent = ""; }, 2500);
}

// ── Bounty Board (Parent) ──────────────────────────────
function openPostBounty() {
 document.getElementById("bounty-name-input").value = "";
 document.getElementById("bounty-desc-input").value = "";
 document.getElementById("bounty-points-input").value = "75";
 document.getElementById("bounty-deadline-input").value = "";
 document.getElementById("bounty-error").textContent = "";
 state.selectedBountyEmoji = "⚡";
 renderEmojiGrid("bounty-emoji-picker", CHORE_EMOJIS, e => { state.selectedBountyEmoji = e; }, "⚡");
 openModal("modal-post-bounty");
}
async function saveBounty() {
 const name = document.getElementById("bounty-name-input").value.trim();
 const desc = document.getElementById("bounty-desc-input").value.trim();
 const pts = parseInt(document.getElementById("bounty-points-input").value) || 75;
 const deadline = document.getElementById("bounty-deadline-input").value;
 const errEl = document.getElementById("bounty-error");
 if (!name) { errEl.textContent = "Enter a bounty name."; return; }
 try {
   const { postBounty } = await import("./bounty.js");
   await postBounty(db, state.familyId, { name, description: desc, emoji: state.selectedBountyEmoji, points: pts, deadline });
   closeModal("modal-post-bounty");
 } catch (e) { errEl.textContent = e.message; }
}

// ── Firestore listeners ──────────────────────────────────
function startParentListeners(familyId) {
 stopListeners();
 state.unsubKids = onSnapshot(collection(db, "families", familyId, "kids"), snap => {
   state.kids = snap.docs.map(d => ({ id:d.id, ...d.data() }));
   renderLeaderboard("parent-leaderboard", state.kids, state.completions);
   renderParentChoreGrid(); renderManageLists();
 });
 state.unsubChores = onSnapshot(collection(db, "families", familyId, "chores"), snap => {
   state.chores = snap.docs.map(d => ({ id:d.id, ...d.data() }));
   renderLeaderboard("parent-leaderboard", state.kids, state.completions);
   renderParentChoreGrid(); renderManageLists();
 });
 state.unsubCompletions = onSnapshot(collection(db, "families", familyId, "completions"), snap => {
   state.completions = snap.docs.map(d => ({ id:d.id, ...d.data() }));
   renderLeaderboard("parent-leaderboard", state.kids, state.completions);
   renderParentChoreGrid(); renderManageLists();
 });
 state.unsubBounties = onSnapshot(collection(db, "families", familyId, "bounties"), snap => {
   state.bounties = snap.docs.map(d => ({ id:d.id, ...d.data() }));
   renderParentBountyList(state.bounties);
 });
 state.unsubTrades = onSnapshot(collection(db, "families", familyId, "trades"), snap => {
   state.trades = snap.docs.map(d => ({ id:d.id, ...d.data() }));
   renderParentTradeReview(state.trades);
 });
}
function startKidListeners(familyId) {
 stopListeners();
 state.unsubKids = onSnapshot(collection(db, "families", familyId, "kids"), snap => {
   state.kids = snap.docs.map(d => ({ id:d.id, ...d.data() }));
   const fresh = state.kids.find(k => k.id===state.kidId);
   if (fresh) { state.kidDoc = fresh; applyKidTheme(fresh.themeColor); }
   renderLeaderboard("kid-leaderboard", state.kids, state.completions);
   renderKidChoreGrid(); refreshKidHeader(); refreshKidAvatarPanel(); renderStore();
 });
 state.unsubChores = onSnapshot(collection(db, "families", familyId, "chores"), snap => {
   state.chores = snap.docs.map(d => ({ id:d.id, ...d.data() }));
   renderKidChoreGrid();
 });
 state.unsubCompletions = onSnapshot(collection(db, "families", familyId, "completions"), snap => {
   state.completions = snap.docs.map(d => ({ id:d.id, ...d.data() }));
   renderLeaderboard("kid-leaderboard", state.kids, state.completions);
   renderKidChoreGrid();
 });
 state.unsubBounties = onSnapshot(collection(db, "families", familyId, "bounties"), snap => {
   state.bounties = snap.docs.map(d => ({ id:d.id, ...d.data() }));
   renderBountyBoard(state.bounties);
 });
 state.unsubTrades = onSnapshot(collection(db, "families", familyId, "trades"), snap => {
   state.trades = snap.docs.map(d => ({ id:d.id, ...d.data() }));
   renderPendingTrades(state.trades);
 });
}
function stopListeners() {
 if (state.unsubKids) state.unsubKids();
 if (state.unsubChores) state.unsubChores();
 if (state.unsubCompletions) state.unsubCompletions();
 if (state.unsubBounties) state.unsubBounties();
 if (state.unsubTrades) state.unsubTrades();
 state.unsubKids = state.unsubChores = state.unsubCompletions = state.unsubBounties = state.unsubTrades = null;
}

// ── Kid theme & header ───────────────────────────────────
function applyKidTheme(color) {
 if (!color) return;
 document.documentElement.style.setProperty("--kid-color", color);
 document.documentElement.style.setProperty("--kid-color-rgb", hexToRgb(color));
}
function refreshKidHeader() {
 const kid = state.kids.find(k => k.id===state.kidId) || state.kidDoc;
 if (!kid) return;
 const nameEl = document.getElementById("kid-name-display");
 const ptsEl = document.getElementById("kid-points-val");
 const streakEl = document.getElementById("kid-streak-val");
 const avatarEl = document.getElementById("kid-avatar-display");
 if (nameEl) nameEl.textContent = kid.nickname || kid.name || "Kid";
 if (ptsEl) ptsEl.textContent = kid.currentPoints || kid.points || 0;
 if (streakEl) streakEl.textContent = kid.streak || 0;
 if (avatarEl) renderAvatarContent(avatarEl, kid);
}

// ── Dashboard routing ────────────────────────────────────
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
 await seedStoreIfNeeded(db, familyId);
 setTimeout(() => {
   const h=new Date().getHours();
   const key=`parentSum-${todayStr()}`;
   if(h>=21 && !localStorage.getItem(key)) { localStorage.setItem(key,"1"); showDailySummary(); }
 }, 1200);
}
async function goToKidDashboard(kid, familyId) {
 state.kidId = kid.id;
 state.kidDoc = kid;
 state.familyIdKid = familyId;
 // Persist kid session so refresh/close restores it automatically
 localStorage.setItem("cq_kid_session", JSON.stringify({ kidId:kid.id, familyId }));
 applyKidTheme(kid.themeColor);
 refreshKidHeader();
 startKidListeners(familyId);
 await refreshInventory();
 refreshKidAvatarPanel();
 renderStore();
 showScreen("screen-kid-dashboard");
}

// ── Parent auth ──────────────────────────────────────────
async function handleParentAuth(isSignUp) {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  const errEl = document.getElementById("auth-error");
  errEl.textContent = "";
  if (!email||!password) { errEl.textContent = "Fill in all fields."; return; }
  
  // Provide feedback and hide keyboard
  const btn = document.getElementById("btn-email-auth");
  const oldTxt = btn.textContent;
  btn.textContent = "Processing...";
  btn.disabled = true;
  document.querySelectorAll(".form-input").forEach(i => i.blur());

  try {
    if(isSignUp) await createUserWithEmailAndPassword(auth,email,password);
    else await signInWithEmailAndPassword(auth,email,password);
  } catch(e) { 
    errEl.textContent = e.message; 
    btn.textContent = oldTxt;
    btn.disabled = false;
  }
}

// Detect iOS/Safari where signInWithPopup is blocked by ITP
function isIosSafari() {
  const ua = navigator.userAgent;
  return /iP(hone|od|ad)/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

// Google Auth - use redirect on iOS/Safari (ITP blocks popups), popup elsewhere
async function handleGoogleAuth() {
  const provider = new GoogleAuthProvider();
  if (isIosSafari()) {
    try {
      await signInWithRedirect(auth, provider);
    } catch (e) {
      document.getElementById("auth-error").textContent = e.message;
    }
  } else {
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
        document.getElementById("auth-error").textContent = e.message;
      }
    }
  }
}

async function findOrPromptFamily(user) {
 const snap = await getDocs(query(collection(db,"families"),where("parentUid","==",user.uid)));
 if (snap.empty) showScreen("screen-create-family");
 else await goToParentDashboard(snap.docs[0].id);
}
async function createFamily() {
 const name = document.getElementById("family-name-input").value.trim();
 const errEl = document.getElementById("family-error");
 errEl.textContent = "";
 if (!name) { errEl.textContent = "Enter a family name."; return; }
 if (!state.parentUser) return;
 try {
   const ref = await addDoc(collection(db,"families"), { name, parentUid:state.parentUser.uid, inviteCode:genCode(), createdAt:serverTimestamp() });
   await goToParentDashboard(ref.id);
 } catch(e) { errEl.textContent = e.message; }
}

// ── Kid join flow ────────────────────────────────────────
async function joinFamily() {
  const input = document.getElementById("join-code-input");
  const code = input.value.trim().toUpperCase();
  const errEl = document.getElementById("join-error");
  errEl.textContent = "";
  if (!code||code.length<4) { errEl.textContent = "Enter a valid invite code."; return; }
  
  input.blur();
  try {
    const snap = await getDocs(query(collection(db,"families"),where("inviteCode","==",code)));
    if (snap.empty) { errEl.textContent = "Code not found."; return; }
    const famDoc = snap.docs[0];
    state.familyIdKid = famDoc.id;
    const kidsSnap = await getDocs(collection(db,"families",famDoc.id,"kids"));
    state.kids = kidsSnap.docs.map(d => ({ id:d.id, ...d.data() }));
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
   card.innerHTML = `<div class="kid-select-emoji">${kid.emoji||"⭐"}</div><div class="kid-select-name">${kid.nickname||kid.name}</div>`;
   card.addEventListener("click", () => selectKid(kid));
   grid.appendChild(card);
 });
}
function selectKid(kid) {
 state.kidDoc = kid;
 state.kidId = kid.id;
 if (!kid.baseCharacterId) { renderCharSelectGrid(); showScreen("screen-char-select"); return; }
 showPinScreen(kid);
}
function showPinScreen(kid) {
 const char = getCharById(kid.baseCharacterId);
 const avatarEl = document.getElementById("pin-avatar");
 if (char?.img) avatarEl.innerHTML = `<img src="${char.img}" alt="${char.name}">`;
 else avatarEl.textContent = char?.emoji || kid.emoji || "⭐";
 const hasPin = !!kid.pin;
 document.getElementById("pin-title").textContent = hasPin ? "Enter Your PIN" : "Create a PIN";
 document.getElementById("pin-subtitle").textContent = hasPin ? "Enter your 4-digit PIN" : "Choose a new 4-digit PIN";
 document.getElementById("pin-error").textContent = "";
 resetPinDots();
 showScreen("screen-kid-pin");
}

// ── Character confirm ────────────────────────────────────
async function confirmCharacterSelection() {
 if (!state.selectedCharId || !state.kidId || !state.familyIdKid) return;
 try {
   await updateDoc(doc(db, "families", state.familyIdKid, "kids", state.kidId), { baseCharacterId: state.selectedCharId });
   state.kidDoc.baseCharacterId = state.selectedCharId;
   showPinScreen(state.kidDoc);
 } catch(e) { document.getElementById("char-select-error").textContent = e.message; }
}

// ── PIN logic ────────────────────────────────────────────
let pinBuffer = "";
function resetPinDots() {
 pinBuffer = "";
 document.querySelectorAll(".pin-dot").forEach(d => d.classList.remove("filled"));
}
function updatePinDots() {
 document.querySelectorAll(".pin-dot").forEach((d,i) => d.classList.toggle("filled", i<pinBuffer.length));
}
async function submitPin() {
 if (!state.kidDoc || !state.familyIdKid) return;
 const errEl = document.getElementById("pin-error");
 errEl.textContent = "";
 if (state.kidDoc.pin) {
   if (pinBuffer !== state.kidDoc.pin) { errEl.textContent = "Wrong PIN."; resetPinDots(); return; }
   goToKidDashboard(state.kidDoc, state.familyIdKid);
 } else {
   try {
     await updateDoc(doc(db,"families",state.familyIdKid,"kids",state.kidDoc.id), { pin:pinBuffer });
     state.kidDoc.pin=pinBuffer;
     goToKidDashboard(state.kidDoc, state.familyIdKid);
   } catch(e) { errEl.textContent = e.message; }
 }
}

// ── Kid customize ────────────────────────────────────────
function openKidCustomize() {
 const kid = state.kidDoc;
 document.getElementById("kid-nickname-input").value = kid?.nickname || kid?.name || "";
 state.selectedThemeColor = kid?.themeColor || "#8b7cf8";
 renderColorPicker();
 openModal("modal-kid-customize");
}
function renderColorPicker() {
 const el = document.getElementById("kid-color-picker");
 if (!el) return;
 el.innerHTML = "";
 THEME_COLORS.forEach(c => {
   const btn = document.createElement("button");
   btn.className = "color-swatch" + (c.hex===state.selectedThemeColor?" selected":"");
   btn.style.background = c.hex; btn.title = c.name; btn.type = "button";
   btn.addEventListener("click", () => {
     state.selectedThemeColor=c.hex;
     el.querySelectorAll(".color-swatch").forEach(s=>s.classList.remove("selected"));
     btn.classList.add("selected");
   });
   el.appendChild(btn);
 });
}
async function saveKidCustomize() {
 if (!state.kidId || !state.familyIdKid) return;
 const nickname = document.getElementById("kid-nickname-input").value.trim();
 const phone = (document.getElementById("kid-phone-input")?.value||"").trim();
 try {
   await updateDoc(doc(db,"families",state.familyIdKid,"kids",state.kidId), { nickname:nickname||state.kidDoc.name, themeColor:state.selectedThemeColor, phone:phone||null });
   state.kidDoc.nickname = nickname||state.kidDoc.name;
   state.kidDoc.themeColor = state.selectedThemeColor;
   applyKidTheme(state.selectedThemeColor);
   refreshKidHeader();
   closeModal("modal-kid-customize");
 } catch(e) { console.error(e); }
}

// ── Logout ───────────────────────────────────────────────
async function parentLogout() {
 stopListeners();
 state.parentUser=null; state.familyId=null; state.familyDoc=null;
 state.kids=[]; state.chores=[]; state.completions=[];
 await signOut(auth);
 showScreen("screen-landing");
}
function kidLogout() {
 stopListeners();
 state.kidId=null; state.kidDoc=null; state.familyIdKid=null;
 state.kids=[]; state.chores=[]; state.completions=[]; state.inventory=[];
 localStorage.removeItem("cq_kid_session");
 showScreen("screen-landing");
}

// ── Kid session restore (persists across refresh/close) ──
async function tryRestoreKidSession() {
 const raw = localStorage.getItem("cq_kid_session");
 if (!raw) return false;
 try {
   const { kidId, familyId } = JSON.parse(raw);
   const kidSnap = await getDoc(doc(db,"families",familyId,"kids",kidId));
   if (!kidSnap.exists()) {
     // Kid was deleted — clear session
     localStorage.removeItem("cq_kid_session");
     return false;
   }
   const kid = { id:kidSnap.id, ...kidSnap.data() };
   await goToKidDashboard(kid, familyId);
   return true;
 } catch(e) {
   // Don't clear session on network/transient errors — only on "not found"
   // so kids stay signed in even when offline
   console.warn("Could not restore kid session:", e.message);
   return false;
 }
}

function checkJoinParam() {
 const p=new URLSearchParams(location.search);
 const j=p.get("join");
 if(j){showScreen("screen-kid-join"); document.getElementById("join-code-input").value=j.toUpperCase(); history.replaceState({},"",location.pathname);}
}
function setupParentSettings() {
 const phone = state.familyDoc?.parentPhone||"";
 const el=document.getElementById("parent-phone-input");
 if(el) el.value=phone;
 const nb = document.getElementById("btn-enable-notifs");
 if (nb) {
   if(Notification.permission==="granted") nb.textContent="✅ Notifications On";
   nb.addEventListener("click", async()=>{const ok=await requestNotificationPermission(); nb.textContent=ok?"✅ Notifications On":"Blocked";});
 }
}

// ══════════════════════════════════════════════════════════
// WIRE UP ALL EVENTS
// ══════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  // Landing
  document.getElementById("btn-parent-role").addEventListener("click", () => showScreen("screen-parent-auth"));
  document.getElementById("btn-kid-role").addEventListener("click", () => showScreen("screen-kid-join"));

  // Parent Auth
  let isSignUp = false;
  document.getElementById("auth-back-btn").addEventListener("click", () => showScreen("screen-landing"));
  document.getElementById("tab-signin").addEventListener("click", () => {
    isSignUp=false;
    document.getElementById("tab-signin").classList.add("active");
    document.getElementById("tab-signup").classList.remove("active");
    document.getElementById("btn-email-auth").textContent="Sign In";
    document.getElementById("signup-name-group").style.display="none";
  });
  document.getElementById("tab-signup").addEventListener("click", () => {
    isSignUp=true;
    document.getElementById("tab-signup").classList.add("active");
    document.getElementById("tab-signin").classList.remove("active");
    document.getElementById("btn-email-auth").textContent="Create Account";
    document.getElementById("signup-name-group").style.display="flex";
  });
  // Note: Form submit will now handle handleParentAuth(isSignUp)
  document.getElementById("btn-google-auth").addEventListener("click", handleGoogleAuth);

  // Create Family — Form handled below
  document.getElementById("btn-logout-create").addEventListener("click", () => { signOut(auth); showScreen("screen-landing"); });

  // Parent Dashboard nav
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const p=btn.dataset.panel;
      document.querySelectorAll(".tab-panel").forEach(p2=>p2.classList.remove("active-panel"));
      document.getElementById(p).classList.add("active-panel");
      document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
  document.getElementById("btn-parent-logout").addEventListener("click", parentLogout);
  document.getElementById("btn-daily-summary").addEventListener("click", showDailySummary);

  // Manage
  document.getElementById("btn-add-kid").addEventListener("click", () => {
    document.getElementById("kid-name-input").value="";
    document.getElementById("kid-age-input").value="";
    document.getElementById("add-kid-error").textContent="";
    state.selectedKidEmoji="⭐";
    renderEmojiGrid("kid-emoji-picker",KID_EMOJIS,e=>{state.selectedKidEmoji=e;},"⭐");
    openModal("modal-add-kid");
  });
  document.getElementById("btn-add-chore").addEventListener("click", openAddChore);

  // Invite
  document.getElementById("btn-copy-code").addEventListener("click", () => {
    navigator.clipboard.writeText(state.familyDoc?.inviteCode||"").then(()=>{document.getElementById("copy-success").textContent="Copied!"; setTimeout(()=>{document.getElementById("copy-success").textContent="";},2000);});
  });
  document.getElementById("btn-copy-link").addEventListener("click", () => {
    const link=`${location.origin}${location.pathname}?join=${state.familyDoc?.inviteCode||""}`;
    navigator.clipboard.writeText(link).then(()=>{document.getElementById("copy-success").textContent="Link copied!"; setTimeout(()=>{document.getElementById("copy-success").textContent="";},2000);});
  });
  document.getElementById("btn-regen-code").addEventListener("click", regenCode);

  // Kid Join
  document.getElementById("kid-join-back").addEventListener("click", () => showScreen("screen-landing"));
  // Form handled below
  document.getElementById("kid-select-back").addEventListener("click", () => showScreen("screen-kid-join"));

  // Character Select
  document.getElementById("btn-confirm-char").addEventListener("click", confirmCharacterSelection);

  // PIN
  document.getElementById("kid-pin-back").addEventListener("click", () => { resetPinDots(); showScreen("screen-kid-select"); });
  document.querySelectorAll(".num-btn[data-num]").forEach(btn => {
    btn.addEventListener("click", () => {
      if(pinBuffer.length>=4)return;
      pinBuffer+=btn.dataset.num;
      updatePinDots();
      if(pinBuffer.length===4) submitPin();
    });
  });
  document.getElementById("pin-del").addEventListener("click", () => { pinBuffer=pinBuffer.slice(0,-1); updatePinDots(); });

  // Kid dashboard
  document.getElementById("btn-kid-customize").addEventListener("click", openKidCustomize);
  document.getElementById("btn-kid-logout").addEventListener("click", kidLogout);

  // Kid nav tabs
  document.querySelectorAll(".kid-nav-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const panelId = btn.dataset.kidPanel;
      document.querySelectorAll(".kid-tab-panel").forEach(p => p.classList.remove("active-kid-panel"));
      document.getElementById(panelId)?.classList.add("active-kid-panel");
      document.querySelectorAll(".kid-nav-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      if (panelId === "kid-panel-store") renderStore();
      if (panelId === "kid-panel-avatar") refreshKidAvatarPanel();
    });
  });

  // Store categories
  document.querySelectorAll(".store-cat-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.storeCategory=btn.dataset.cat;
      document.querySelectorAll(".store-cat-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      renderStore();
    });
  });

  // Modals
  document.getElementById("btn-cancel-kid").addEventListener("click", () => closeModal("modal-add-kid"));
  document.getElementById("btn-save-kid").addEventListener("click", addKid);
  document.getElementById("btn-cancel-chore").addEventListener("click", () => closeModal("modal-add-chore"));
  document.getElementById("btn-save-chore").addEventListener("click", saveChore);
  document.getElementById("btn-close-detail").addEventListener("click", () => closeModal("modal-chore-detail"));
  document.getElementById("btn-cancel-customize").addEventListener("click", () => closeModal("modal-kid-customize"));
  document.getElementById("btn-save-customize").addEventListener("click", saveKidCustomize);
  document.getElementById("btn-close-kid-history").addEventListener("click", () => closeModal("modal-kid-history"));
  document.getElementById("btn-close-summary").addEventListener("click", () => closeModal("modal-daily-summary"));
  document.getElementById("btn-close-store-item").addEventListener("click", () => closeModal("modal-store-item"));
  document.getElementById("btn-close-view-avatar").addEventListener("click", () => closeModal("modal-view-avatar"));

  // Bounty Board (Parent)
  document.getElementById("btn-post-bounty")?.addEventListener("click", openPostBounty);
  document.getElementById("btn-cancel-bounty")?.addEventListener("click", () => closeModal("modal-post-bounty"));
  document.getElementById("btn-save-bounty")?.addEventListener("click", saveBounty);

  // Bounty Board (Kid)
  document.getElementById("btn-close-bounty-detail")?.addEventListener("click", () => closeModal("modal-bounty-detail"));

  // Trading
  document.getElementById("btn-cancel-trade")?.addEventListener("click", () => closeModal("modal-trade-proposal"));
  document.getElementById("btn-send-trade")?.addEventListener("click", sendTradeProposal);
  document.getElementById("btn-close-view-trade")?.addEventListener("click", () => closeModal("modal-view-trade"));

  // Kid notifs
  const nkb=document.getElementById("btn-enable-kid-notifs");
  if(nkb){
    if(Notification.permission==="granted") nkb.textContent="✅ Notifications On";
    nkb.addEventListener("click",async()=>{const ok=await requestNotificationPermission(); nkb.textContent=ok?"✅ Notifications On":"Blocked";});
  }

  // Close modals via overlay
  document.querySelectorAll(".modal-overlay").forEach(o => {
    o.addEventListener("click", e => { if(e.target===o) o.classList.add("hidden"); });
  });

  // ── Handle redirect result from iOS/Safari Google Sign-In ──
  getRedirectResult(auth).catch(e => {
    if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
      const errEl = document.getElementById("auth-error");
      if (errEl) errEl.textContent = e.message;
    }
  });

  // ── Auth Handling (The "Mobile Loop Fix") ──────────────
  // ── Auth Handling (Alignment Mode v2.2) ──────────────
  onAuthStateChanged(auth, async user => {
    state.parentUser = user;
    
    // Always hide loading on first state change
    document.getElementById("auth-loading-overlay")?.classList.add("hidden");
    
    if (user) {
      // Parent is logged in - take them to the dashboard
      await findOrPromptFamily(user);
    } else if (!state.kidId) {
      // No parent user and no active kid session - try to restore or landing
      const restored = await tryRestoreKidSession();
      if (!restored) showScreen("screen-landing");
    }
  });

  // ── Form Submissions (Mobile optimization) ──────────
  document.getElementById("form-parent-auth")?.addEventListener("submit", e => {
    e.preventDefault(); handleParentAuth(isSignUp);
  });
  document.getElementById("form-create-family")?.addEventListener("submit", e => {
    e.preventDefault(); createFamily();
  });
  document.getElementById("form-kid-join")?.addEventListener("submit", e => {
    e.preventDefault(); joinFamily();
  });
  document.getElementById("form-parent-settings")?.addEventListener("submit", async e => {
    e.preventDefault();
    const phone = document.getElementById("parent-phone-input")?.value.trim() || "";
    if (!state.familyId) return;
    document.getElementById("parent-phone-input")?.blur();
    try {
      await updateDoc(doc(db, "families", state.familyId), { parentPhone: phone });
      if (state.familyDoc) state.familyDoc.parentPhone = phone;
      const msg = document.getElementById("parent-phone-msg");
      if (msg) { msg.textContent = "Saved!"; setTimeout(() => { msg.textContent = ""; }, 2000); }
    } catch (err) { console.error(err); }
  });

  checkJoinParam();
  renderEmojiGrid("kid-emoji-picker", KID_EMOJIS, e => { state.selectedKidEmoji = e; }, "⭐");
  renderEmojiGrid("chore-emoji-picker", CHORE_EMOJIS, e => { state.selectedChoreEmoji = e; }, "🧹");
});
