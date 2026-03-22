// ═══════════════════════════════════════════════════════
//  ChoreQuest — Gamification Logic
// ═══════════════════════════════════════════════════════
import { getLevel, getLevelTier, STREAK_BONUSES, getCharById, getItemById, STORE_ITEMS } from "./gamedata.js";
import {
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Streak Calculation ────────────────────────────────────
export async function calculateStreak(db, familyId, kidId, chores, completions) {
  const kidRef = doc(db, "families", familyId, "kids", kidId);
  const kidSnap = await getDoc(kidRef);
  if (!kidSnap.exists()) return { streak: 0, bonus: 0 };

  const kidData = kidSnap.data();
  const today = new Date().toISOString().slice(0, 10);
  
  // Get chores assigned to this kid
  const myChores = chores.filter(ch => (ch.assignedTo || []).includes(kidId));
  if (myChores.length === 0) return { streak: kidData.streak || 0, bonus: 0 };

  // Check if ALL assigned chores are done today
  const todayCompletions = completions.filter(c =>
    c.kidId === kidId && c.status === "completed" && c.date === today
  );
  const todayDoneIds = new Set(todayCompletions.map(c => c.choreId));
  const allDone = myChores.every(ch => todayDoneIds.has(ch.id));
  
  if (!allDone) return { streak: kidData.streak || 0, bonus: 0 };

  // All chores done today - calculate streak
  const lastDate = kidData.lastStreakDate || "";
  let newStreak;
  
  if (lastDate === today) {
    // Already counted today
    return { streak: kidData.streak || 0, bonus: 0 };
  }
  
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (lastDate === yesterday) {
    newStreak = (kidData.streak || 0) + 1;
  } else {
    newStreak = 1;
  }

  // Check for milestone bonus
  let bonus = 0;
  const bonusEarned = kidData.streakBonusEarned || {};
  if (STREAK_BONUSES[newStreak] && !bonusEarned[newStreak]) {
    bonus = STREAK_BONUSES[newStreak];
    bonusEarned[newStreak] = true;
  }

  // Update kid document
  const updates = {
    streak: newStreak,
    lastStreakDate: today,
    streakBonusEarned: bonusEarned,
  };
  if (bonus > 0) {
    updates.currentPoints = (kidData.currentPoints || kidData.points || 0) + bonus;
    updates.totalLifetimePoints = (kidData.totalLifetimePoints || 0) + bonus;
  }
  await updateDoc(kidRef, updates);

  return { streak: newStreak, bonus };
}

// ── Purchase Item ─────────────────────────────────────────
export async function purchaseItem(db, familyId, kidId, itemId) {
  const item = getItemById(itemId);
  if (!item) throw new Error("Item not found");

  const kidRef = doc(db, "families", familyId, "kids", kidId);
  const kidSnap = await getDoc(kidRef);
  if (!kidSnap.exists()) throw new Error("Kid not found");

  const kidData = kidSnap.data();
  const currentPts = kidData.currentPoints || kidData.points || 0;
  const level = getLevel(kidData.totalLifetimePoints || 0);

  if (level < item.requiredLevel) {
    throw new Error(`Requires Level ${item.requiredLevel}. You are Level ${level}.`);
  }
  if (currentPts < item.price) {
    throw new Error(`Not enough points. Need ${item.price}, have ${currentPts}.`);
  }

  // Check if already owned
  const invQ = query(
    collection(db, "families", familyId, "kids", kidId, "inventory"),
    where("itemId", "==", itemId)
  );
  const invSnap = await getDocs(invQ);
  if (!invSnap.empty) throw new Error("You already own this item!");

  // Deduct points
  await updateDoc(kidRef, {
    currentPoints: currentPts - item.price,
    points: currentPts - item.price // keep legacy field in sync
  });

  // Add to inventory
  await addDoc(collection(db, "families", familyId, "kids", kidId, "inventory"), {
    itemId: itemId,
    purchasedAt: serverTimestamp(),
    equipped: false
  });

  return { newBalance: currentPts - item.price };
}

// ── Equip Item ────────────────────────────────────────────
export async function equipItem(db, familyId, kidId, inventoryDocId, itemId) {
  const item = getItemById(itemId);
  if (!item) throw new Error("Item not found");

  // Unequip any item in the same category slot
  const invQ = query(collection(db, "families", familyId, "kids", kidId, "inventory"));
  const invSnap = await getDocs(invQ);
  
  for (const invDoc of invSnap.docs) {
    const data = invDoc.data();
    if (data.equipped) {
      const existingItem = getItemById(data.itemId);
      if (existingItem && existingItem.category === item.category) {
        await updateDoc(doc(db, "families", familyId, "kids", kidId, "inventory", invDoc.id), {
          equipped: false
        });
      }
    }
  }

  // Equip the selected item
  await updateDoc(doc(db, "families", familyId, "kids", kidId, "inventory", inventoryDocId), {
    equipped: true
  });

  // Update kid's equippedItems map
  const kidRef = doc(db, "families", familyId, "kids", kidId);
  const kidSnap = await getDoc(kidRef);
  const equippedItems = kidSnap.data()?.equippedItems || {};
  equippedItems[item.category] = itemId;
  await updateDoc(kidRef, { equippedItems });
}

// ── Unequip Item ──────────────────────────────────────────
export async function unequipItem(db, familyId, kidId, inventoryDocId, itemId) {
  const item = getItemById(itemId);
  if (!item) return;

  await updateDoc(doc(db, "families", familyId, "kids", kidId, "inventory", inventoryDocId), {
    equipped: false
  });

  const kidRef = doc(db, "families", familyId, "kids", kidId);
  const kidSnap = await getDoc(kidRef);
  const equippedItems = kidSnap.data()?.equippedItems || {};
  if (equippedItems[item.category] === itemId) {
    equippedItems[item.category] = null;
    await updateDoc(kidRef, { equippedItems });
  }
}

// ── Get Inventory ─────────────────────────────────────────
export async function getInventory(db, familyId, kidId) {
  const invSnap = await getDocs(collection(db, "families", familyId, "kids", kidId, "inventory"));
  return invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Seed Store Items (called once per family) ─────────────
export async function seedStoreIfNeeded(db, familyId) {
  const storeRef = collection(db, "families", familyId, "storeItems");
  const existing = await getDocs(storeRef);
  if (!existing.empty) return; // already seeded

  for (const item of STORE_ITEMS) {
    await setDoc(doc(storeRef, item.id), {
      ...item,
      createdAt: serverTimestamp()
    });
  }
}
