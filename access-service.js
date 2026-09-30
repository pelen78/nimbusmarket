export function normalizeCode(value) { return value.trim().replace(/[\s-]/g, '').toUpperCase(); }
export async function redeemInvitation({db, user, code, displayName, sdk}) {
  code = normalizeCode(code);
  displayName = displayName.trim();
  if (!user?.emailVerified) throw new Error('access/verify-email');
  if (!/^[A-F0-9]{32}$/.test(code)) throw new Error('access/invalid-invite');
  if (!displayName || displayName.length > 80) throw new Error('access/name');
  const email = user.email.toLowerCase();
  const memberRef = sdk.doc(db, 'members', user.uid);
  const inviteRef = sdk.doc(db, 'inviteCodes', code);
  return sdk.runTransaction(db, async tx => {
    const member = await tx.get(memberRef);
    if (member.exists()) throw new Error('access/already-member');
    const snap = await tx.get(inviteRef);
    if (!snap.exists()) throw new Error('access/invalid-invite');
    const invite = snap.data();
    if (invite.email !== email || invite.used !== false) throw new Error('access/invalid-invite');
    // The server rules validate expiration using request.time, not this device's clock.
    tx.set(memberRef, {email, displayName, status:'active', inviteCode:code, joinedAt:sdk.serverTimestamp()});
    tx.update(inviteRef, {used:true, usedBy:user.uid, usedAt:sdk.serverTimestamp()});
  });
}
