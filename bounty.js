// ═══════════════════════════════════════════════════════
//  ChoreQuest — Bounty Board System
// ═══════════════════════════════════════════════════════
import {
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Post Bounty (Parent) ─────────────────────────────────
export async function postBounty(db, familyId, { name, description, emoji, points, deadline }) {
  return addDoc(collection(db, "families", familyId, "bounties"), {
    name: name || "Bonus Chore",
    description: description || "",
    emoji: emoji || "⚡",
    points: points || 50,
    status: "open",
    claimedBy: null,
    claimedAt: null,
    completedAt: null,
    deadline: deadline || null,
    createdAt: serverTimestamp()
  });
}

// ── Claim Bounty (Kid) — Race-condition safe ──────────────
export async function claimBounty(db, familyId, bountyId, kidId) {
  const bountyRef = doc(db, "families", familyId, "bounties", bountyId);

  return runTransaction(db, async (transaction) => {
    const bountySnap = await transaction.get(bountyRef);
    if (!bountySnap.exists()) throw new Error("Bounty not found.");

    const data = bountySnap.data();
    if (data.status !== "open") {
      throw new Error("Too late! Someone already claimed this bounty.");
    }

    // Check deadline
    if (data.deadline) {
      const now = new Date().toISOString().slice(0, 10);
      if (now > data.deadline) {
        transaction.update(bountyRef, { status: "expired" });
        throw new Error("This bounty has expired.");
      }
    }

    // Atomically claim
    transaction.update(bountyRef, {
      status: "claimed",
      claimedBy: kidId,
      claimedAt: serverTimestamp()
    });

    return { success: true };
  });
}

// ── Complete Bounty ───────────────────────────────────────
export async function completeBounty(db, familyId, bountyId, kidId) {
  const bountyRef = doc(db, "families", familyId, "bounties", bountyId);
  const bountySnap = await getDoc(bountyRef);
  if (!bountySnap.exists()) throw new Error("Bounty not found");

  const data = bountySnap.data();
  if (data.status !== "claimed" || data.claimedBy !== kidId) {
    throw new Error("This bounty isn't assigned to you.");
  }

  // Award points
  const kidRef = doc(db, "families", familyId, "kids", kidId);
  const kidSnap = await getDoc(kidRef);
  if (kidSnap.exists()) {
    const k = kidSnap.data();
    await updateDoc(kidRef, {
      points: (k.points || 0) + data.points,
      currentPoints: (k.currentPoints || k.points || 0) + data.points,
      totalLifetimePoints: (k.totalLifetimePoints || 0) + data.points,
      totalCompletions: (k.totalCompletions || 0) + 1
    });
  }

  await updateDoc(bountyRef, {
    status: "completed",
    completedAt: serverTimestamp()
  });

  return { points: data.points };
}

// ── Delete Bounty (Parent) ────────────────────────────────
export async function deleteBounty(db, familyId, bountyId) {
  await deleteDoc(doc(db, "families", familyId, "bounties", bountyId));
}

// ── Get Open Bounties ─────────────────────────────────────
export async function getOpenBounties(db, familyId) {
  const q = query(
    collection(db, "families", familyId, "bounties"),
    where("status", "in", ["open", "claimed"])
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
