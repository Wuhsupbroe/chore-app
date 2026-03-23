// ═══ ChoreQuest — Core (Firebase, State, Helpers) ═══
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, query, where, getDocs, onSnapshot, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp({
  apiKey: "AIzaSyDkrzifUy1sCGvuniL312Pp7Lh13Wt2DKI",
  authDomain: "login-app-b0f88.firebaseapp.com",
  projectId: "login-app-b0f88",
  storageBucket: "login-app-b0f88.firebasestorage.app",
  messagingSenderId: "760154109686",
  appId: "1:760154109686:web:42670bf2f61ed599b89ed7"
});
export const auth = getAuth(app);
export const db = getFirestore(app);

// Re-export firebase functions we need elsewhere
export { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, query, where, getDocs, onSnapshot, serverTimestamp, orderBy };

export const KID_EMOJIS = ["⭐","🦁","🐯","🦊","🐼","🐨","🐸","🦄","🐉","🦋","🐙","🦀","🌟","🚀","⚡","🎮","🎸","⚽","🏀","🎨","🌈","🍕","🎩","🔥","🐶","🐱","🐰","🐻","🦝","🦉","🦚","🐳"];
export const CHORE_EMOJIS = ["🧹","🍽️","🗑️","🧺","🛏️","🧼","🌿","🐾","📚","🧽","🚿","🪥","🪣","🧴","🪟","🚪","🛁","🍳","🥗","🧹","🧸","🎒","👕","🪴","🔧","🧲","💻","📦","🎯","🌟","⭐","✨"];
export const THEME_COLORS = [
  {name:"Violet",hex:"#8b7cf8"},{name:"Sky",hex:"#38bdf8"},{name:"Rose",hex:"#fb7185"},{name:"Amber",hex:"#f59e0b"},
  {name:"Emerald",hex:"#34d399"},{name:"Orange",hex:"#fb923c"},{name:"Pink",hex:"#f472b6"},{name:"Cyan",hex:"#22d3ee"},
  {name:"Lime",hex:"#a3e635"},{name:"Fuchsia",hex:"#e879f9"},{name:"Teal",hex:"#2dd4bf"},{name:"Red",hex:"#f87171"},
];

export const state = {
  parentUser:null, familyId:null, familyDoc:null,
  kidId:null, kidDoc:null, familyIdKid:null,
  kids:[], chores:[], completions:[], inventory:[],
  bounties:[], trades:[],
  unsubKids:null, unsubChores:null, unsubCompletions:null, unsubBounties:null, unsubTrades:null,
  editingChoreId:null,
  selectedKidEmoji:"⭐", selectedChoreEmoji:"🧹", selectedAssignedTo:[],
  selectedAvatarEmoji:"⭐", selectedThemeColor:"#8b7cf8",
  selectedCharId:null, storeCategory:"all",
  selectedBountyEmoji:"⚡", tradeMyChores:[], tradeTargetKid:null, tradeTheirChores:[],
};

export function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
}
export function openModal(id)  { document.getElementById(id)?.classList.remove("hidden"); }
export function closeModal(id) { document.getElementById(id)?.classList.add("hidden"); }
export function genCode(len=6) {
  const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length:len},()=>c[Math.floor(Math.random()*c.length)]).join("");
}
export function hexToRgb(hex) {
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`;
}
export function todayStr() { return new Date().toISOString().slice(0,10); }

export function renderEmojiGrid(containerId, emojis, onSelect, initialSelected) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  emojis.forEach(e => {
    const btn = document.createElement("button");
    btn.className = "emoji-btn" + (e === initialSelected ? " selected" : "");
    btn.textContent = e; btn.type = "button";
    btn.addEventListener("click", () => {
      container.querySelectorAll(".emoji-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected"); onSelect(e);
    });
    container.appendChild(btn);
  });
}
