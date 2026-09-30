// Disposable data for the local emulator only. This script cannot target production.
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,Timestamp} from 'firebase/firestore';
const env=await initializeTestEnvironment({projectId:'demo-nimbus-market',firestore:{host:'127.0.0.1',port:8088}});
await env.withSecurityRulesDisabled(async c=>setDoc(doc(c.firestore(),'inviteCodes','ABCDEF0123456789ABCDEF0123456789'),{email:'amiga@example.test',used:false,expiresAt:Timestamp.fromMillis(Date.now()+7*86400000)}));
await env.cleanup();
console.log('Invitación local preparada para amiga@example.test.');
