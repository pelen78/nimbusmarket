import {readFile} from 'node:fs/promises';
import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import {redeemInvitation,normalizeCode} from '../access-service.js';
let env;
const code = 'ABCDEF0123456789ABCDEF0123456789';
const email = 'friend@example.test';
const user = {uid:'friend',email,emailVerified:true};
const invitePath = `inviteCodes/${code}`;
const memberPath = 'members/friend';
const context = (uid='friend', verified=true, address=email) => env.authenticatedContext(uid,{email:address,email_verified:verified}).firestore();
const member = (extra={}) => ({email,displayName:'Amiga',status:'active',inviteCode:code,joinedAt:sdk.serverTimestamp(),...extra});
async function seed(path,data) { await env.withSecurityRulesDisabled(async c => sdk.setDoc(sdk.doc(c.firestore(),path),data)); }
async function seedInvite(extra={}) { await seed(invitePath,{email,used:false,expiresAt:sdk.Timestamp.fromMillis(Date.now()+3600000),...extra}); }
function redeemBatch(db,extra={},inviteExtra={}) {
 const batch=sdk.writeBatch(db);
 batch.set(sdk.doc(db,memberPath),member(extra));
 batch.update(sdk.doc(db,invitePath),{used:true,usedBy:'friend',usedAt:sdk.serverTimestamp(),...inviteExtra});
 return batch.commit();
}
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-nimbus-market',firestore:{host:'127.0.0.1',port:8088,rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')}});});
beforeEach(async()=>{await env.clearFirestore();await seedInvite();});
after(async()=>{await env.cleanup();});
test('anonymous and unverified accounts cannot read invitations or membership',async()=>{
 for(const db of [env.unauthenticatedContext().firestore(),context('friend',false)]) {
  await assertFails(sdk.getDoc(sdk.doc(db,invitePath)));
  await assertFails(sdk.getDoc(sdk.doc(db,memberPath)));
  await assertFails(redeemBatch(db));
 }
});
test('verified recipient can read own invitation, cannot enumerate or read another recipient',async()=>{
 await assertSucceeds(sdk.getDoc(sdk.doc(context(),invitePath)));
 await assertFails(sdk.getDocs(sdk.collection(context(),'inviteCodes')));
 await assertFails(sdk.getDoc(sdk.doc(context('stranger',true,'stranger@example.test'),invitePath)));
 await assertFails(redeemBatch(context('stranger',true,'stranger@example.test')));
});
test('valid invitation is atomically redeemed through the real client service',async()=>{
 const db=context();
 await assertSucceeds(redeemInvitation({db,user,code:code.toLowerCase(),displayName:' Amiga ',sdk}));
 assert.equal((await sdk.getDoc(sdk.doc(db,memberPath))).data().displayName,'Amiga');
 assert.equal((await sdk.getDoc(sdk.doc(db,invitePath))).data().used,true);
 await assert.rejects(redeemInvitation({db,user,code,displayName:'Amiga',sdk}),/already-member/);
});
test('membership alone and invitation consumption alone are denied',async()=>{
 const db=context();
 await assertFails(sdk.setDoc(sdk.doc(db,memberPath),member()));
 await assertFails(sdk.updateDoc(sdk.doc(db,invitePath),{used:true,usedBy:'friend',usedAt:sdk.serverTimestamp()}));
});
test('expired, used, wrong-email and nonexistent invitations cannot grant membership',async()=>{
 for(const extra of [{expiresAt:sdk.Timestamp.fromMillis(Date.now()-60000)},{used:true},{email:'other@example.test'}]) {
  await seedInvite(extra); await assertFails(redeemBatch(context()));
 }
 await env.withSecurityRulesDisabled(async c=>sdk.deleteDoc(sdk.doc(c.firestore(),invitePath)));
 await assertFails(redeemBatch(context()));
});
test('users cannot add roles, forge timestamps or change invitation data',async()=>{
 await assertFails(redeemBatch(context(),{role:'admin'}));
 await assertFails(redeemBatch(context(),{status:'admin'}));
 await assertFails(redeemBatch(context(),{joinedAt:sdk.Timestamp.fromMillis(0)}));
 await assertFails(redeemBatch(context(),{email:'fake@example.test'}));
 await assertFails(redeemBatch(context(),{displayName:'x'.repeat(81)}));
 await assertFails(redeemBatch(context(),{displayName:''}));
 await assertFails(redeemBatch(context(),{}, {expiresAt:sdk.Timestamp.fromMillis(Date.now()+7200000)}));
 await assertFails(redeemBatch(context(),{}, {usedBy:'other'}));
});
test('another user cannot read or modify a membership; collections remain private',async()=>{
 await seed(memberPath,{...member(),joinedAt:sdk.Timestamp.now()});
 const db=context('other',true,'other@example.test');
 await assertFails(sdk.getDoc(sdk.doc(db,memberPath)));
 await assertFails(sdk.getDocs(sdk.collection(context(),'members')));
 await assertFails(sdk.updateDoc(sdk.doc(db,memberPath),{status:'active'}));
 await assertFails(sdk.getDocs(sdk.collection(context(),'items')));
 await assertFails(sdk.setDoc(sdk.doc(context(),'items','fake'),{title:'test'}));
});
test('member cannot edit, delete or restore a revoked membership',async()=>{
 await seed(memberPath,{...member(),status:'revoked',joinedAt:sdk.Timestamp.now()});
 const db=context();
 assert.equal((await sdk.getDoc(sdk.doc(db,memberPath))).data().status,'revoked');
 await assertFails(sdk.updateDoc(sdk.doc(db,memberPath),{status:'active'}));
 await assertFails(sdk.deleteDoc(sdk.doc(db,memberPath)));
 await assertFails(redeemBatch(db));
});
test('clients cannot create, delete or reset invitations',async()=>{
 const db=context();
 await assertFails(sdk.setDoc(sdk.doc(db,'inviteCodes','F'.repeat(32)),{email,used:false}));
 await assertFails(sdk.deleteDoc(sdk.doc(db,invitePath)));
 await assertSucceeds(redeemBatch(db));
 await assertFails(sdk.updateDoc(sdk.doc(db,invitePath),{used:false}));
});
test('simultaneous redemption consumes an invitation only once',async()=>{
 const db=context();
 const redeem=()=>redeemInvitation({db,user,code,displayName:'Amiga',sdk});
 const results=await Promise.allSettled([redeem(),redeem()]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.filter(r=>r.status==='rejected').length,1);
});
test('client rejects malformed codes and unverified emails before starting a transaction',async()=>{
 assert.equal(normalizeCode(' abcd-ef01 '),'ABCDEF01');
 await assert.rejects(redeemInvitation({db:context(),user:{...user,emailVerified:false},code,displayName:'Amiga',sdk}),/verify-email/);
 await assert.rejects(redeemInvitation({db:context(),user,code:'NIMBUS-PELEN01',displayName:'Amiga',sdk}),/invalid-invite/);
});
