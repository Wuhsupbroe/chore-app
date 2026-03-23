// ═══════════════════════════════════════════════════════
//  ChoreQuest — Peer-to-Peer Chore Trading
// ═══════════════════════════════════════════════════════
import {
  doc, getDoc, addDoc, updateDoc,
  collection, query, where, getDocs, serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Propose Trade ────────────────────────────────────────
export async function proposeTrade(db, familyId, proposerId, receiverId, proposerChoreIds, receiverChoreIds) {
  if (!proposerChoreIds.length) throw new Error("Select at least one of your chores to offer.");
  if (!receiverChoreIds.length) throw new Error("Select at least one of their chores to request.");
  if (proposerId === receiverId) throw new Error("Can't trade with yourself!");

  // Validate chores exist and are assigned correctly
  for (const cid of proposerChoreIds) {
    const snap = await getDoc(doc(db, "families", familyId, "chores", cid));
    if (!snap.exists()) throw new Error("One of your chores no longer exists.");
    if (!(snap.data().assignedTo || []).includes(proposerId)) throw new Error("One of the chores isn't assigned to you.");
  }
  for (const cid of receiverChoreIds) {
    const snap = await getDoc(doc(db, "families", familyId, "chores", cid));
    if (!snap.exists()) throw new Error("One of their chores no longer exists.");
    if (!(snap.data().assignedTo || []).includes(receiverId)) throw new Error("One of the chores isn't assigned to them.");
  }

  // Check no existing pending trade for same chores
  const existingQ = query(
    collection(db, "families", familyId, "trades"),
    where("status", "==", "pending")
  );
  const existingSnap = await getDocs(existingQ);
  const allChoreIds = [...proposerChoreIds, ...receiverChoreIds];
  for (const td of existingSnap.docs) {
    const d = td.data();
    const involvedIds = [...(d.proposerChoreIds||[]), ...(d.receiverChoreIds||[])];
    if (allChoreIds.some(c => involvedIds.includes(c))) {
      throw new Error("One of these chores is already in a pending trade.");
    }
  }

  return addDoc(collection(db, "families", familyId, "trades"), {
    proposerId,
    receiverId,
    proposerChoreIds,
    receiverChoreIds,
    status: "pending",
    createdAt: serverTimestamp(),
    resolvedAt: null,
    voidReason: null
  });
}

// ── Accept Trade — Atomic chore swap ─────────────────────
export async function acceptTrade(db, familyId, tradeId) {
  const tradeRef = doc(db, "families", familyId, "trades", tradeId);

  return runTransaction(db, async (transaction) => {
    const tradeSnap = await transaction.get(tradeRef);
    if (!tradeSnap.exists()) throw new Error("Trade not found.");

    const trade = tradeSnap.data();
    if (trade.status !== "pending") throw new Error("This trade is no longer pending.");

    const { proposerId, receiverId, proposerChoreIds, receiverChoreIds } = trade;

    // Read all chore docs inside transaction
    const allChoreRefs = [];
    const allChoreData = [];

    for (const cid of proposerChoreIds) {
      const ref = doc(db, "families", familyId, "chores", cid);
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error("A chore was deleted. Trade voided.");
      const data = snap.data();
      if (!(data.assignedTo || []).includes(proposerId)) throw new Error("A chore was reassigned. Trade voided.");
      allChoreRefs.push({ ref, data, owner: proposerId, newOwner: receiverId });
    }

    for (const cid of receiverChoreIds) {
      const ref = doc(db, "families", familyId, "chores", cid);
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error("A chore was deleted. Trade voided.");
      const data = snap.data();
      if (!(data.assignedTo || []).includes(receiverId)) throw new Error("A chore was reassigned. Trade voided.");
      allChoreRefs.push({ ref, data, owner: receiverId, newOwner: proposerId });
    }

    // Check no chore was completed while pending (today)
    const today = new Date().toISOString().slice(0, 10);
    // We skip completion check inside transaction since we can't query — 
    // the auto-void on completion handles this case

    // Swap assignments atomically
    for (const { ref, data, owner, newOwner } of allChoreRefs) {
      const assigned = [...(data.assignedTo || [])];
      const idx = assigned.indexOf(owner);
      if (idx !== -1) assigned[idx] = newOwner;
      else assigned.push(newOwner);
      transaction.update(ref, { assignedTo: assigned });
    }

    // Mark trade accepted
    transaction.update(tradeRef, {
      status: "accepted",
      resolvedAt: serverTimestamp()
    });

    return { success: true };
  });
}

// ── Decline Trade ────────────────────────────────────────
export async function declineTrade(db, familyId, tradeId) {
  await updateDoc(doc(db, "families", familyId, "trades", tradeId), {
    status: "declined",
    resolvedAt: serverTimestamp()
  });
}

// ── Cancel Trade (by proposer) ───────────────────────────
export async function cancelTrade(db, familyId, tradeId) {
  await updateDoc(doc(db, "families", familyId, "trades", tradeId), {
    status: "canceled",
    resolvedAt: serverTimestamp()
  });
}

// ── Auto-void trades when a chore is completed ──────────
export async function voidTradesForChore(db, familyId, choreId) {
  const q = query(
    collection(db, "families", familyId, "trades"),
    where("status", "==", "pending")
  );
  const snap = await getDocs(q);
  for (const tdoc of snap.docs) {
    const d = tdoc.data();
    const involved = [...(d.proposerChoreIds||[]), ...(d.receiverChoreIds||[])];
    if (involved.includes(choreId)) {
      await updateDoc(doc(db, "families", familyId, "trades", tdoc.id), {
        status: "voided",
        resolvedAt: serverTimestamp(),
        voidReason: "A chore in this trade was completed."
      });
    }
  }
}
