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

// ── Accept Trade (Recipient kid accepts) ────────────────
export async function acceptTrade(db, familyId, tradeId) {
  const tradeRef = doc(db, "families", familyId, "tradeId", tradeId); // Oops, fixed path below
  await updateDoc(doc(db, "families", familyId, "trades", tradeId), {
    status: "accepted_by_recipient",
    recipientAcceptedAt: serverTimestamp()
  });
}

// ── Approve Trade (By Parent — Atomic swap) ─────────────
export async function approveTrade(db, familyId, tradeId) {
  const tradeRef = doc(db, "families", familyId, "trades", tradeId);

  return runTransaction(db, async (transaction) => {
    const tradeSnap = await transaction.get(tradeRef);
    if (!tradeSnap.exists()) throw new Error("Trade not found.");

    const trade = tradeSnap.data();
    if (trade.status !== "accepted_by_recipient") throw new Error("This trade isn't ready for approval.");

    const { proposerId, receiverId, proposerChoreIds, receiverChoreIds } = trade;

    // Read all chore docs inside transaction
    const allChoreRefs = [];
    for (const cid of proposerChoreIds) {
      const ref = doc(db, "families", familyId, "chores", cid);
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error("A chore was deleted.");
      const data = snap.data();
      if (!(data.assignedTo || []).includes(proposerId)) throw new Error("A chore was reassigned.");
      allChoreRefs.push({ ref, data, owner: proposerId, newOwner: receiverId });
    }
    for (const cid of receiverChoreIds) {
      const ref = doc(db, "families", familyId, "chores", cid);
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error("A chore was deleted.");
      const data = snap.data();
      if (!(data.assignedTo || []).includes(receiverId)) throw new Error("A chore was reassigned.");
      allChoreRefs.push({ ref, data, owner: receiverId, newOwner: proposerId });
    }

    // Swap assignments atomically
    for (const { ref, data, owner, newOwner } of allChoreRefs) {
      const assigned = [...(data.assignedTo || [])];
      const idx = assigned.indexOf(owner);
      if (idx !== -1) assigned[idx] = newOwner;
      else assigned.push(newOwner);
      transaction.update(ref, { assignedTo: assigned });
    }

    // Mark trade completed
    transaction.update(tradeRef, {
      status: "completed",
      resolvedAt: serverTimestamp()
    });

    return { success: true };
  });
}

// ── Reject Trade (By Parent) ─────────────────────────────
export async function rejectTradeByParent(db, familyId, tradeId) {
  await updateDoc(doc(db, "families", familyId, "trades", tradeId), {
    status: "rejected_by_parent",
    resolvedAt: serverTimestamp()
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
    where("status", "in", ["pending", "accepted_by_recipient"])
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
