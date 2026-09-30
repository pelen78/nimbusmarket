import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendEmailVerification, sendPasswordResetEmail, updateProfile, reload, getIdToken, connectAuthEmulator} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {getFirestore, doc, onSnapshot, runTransaction, serverTimestamp, connectFirestoreEmulator} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
import {redeemInvitation} from './access-service.js';

window.nimbusAccessStarted = true;
const $ = id => document.getElementById(id);
const localTest = ['localhost','127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('emulators') === '1';
const app = initializeApp(localTest ? {...firebaseConfig, apiKey:'demo-key', projectId:'demo-nimbus-market'} : firebaseConfig);
const auth = getAuth(app);
auth.languageCode = 'es';
const db = getFirestore(app);
if (localTest) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings:true});
  connectFirestoreEmulator(db, '127.0.0.1', 8088);
}
const sections = [...document.querySelectorAll('main > section')];
let busy = false;
let stopMember = null;
let generation = 0;
let accessTimer = null;
let lastVerificationSent = 0;
function show(id) { sections.forEach(section => { section.hidden = section.id !== id; }); }
function message(text = '', error = false) {
  $('status').textContent = text;
  $('status').dataset.error = String(error);
}
function failure(error) {
  const code = error.code || error.message;
  const messages = {
    'auth/invalid-credential':'No pudimos iniciar sesión. Revisa tu correo y contraseña.',
    'auth/wrong-password':'No pudimos iniciar sesión. Revisa tu correo y contraseña.',
    'auth/user-not-found':'No pudimos iniciar sesión. Revisa tu correo y contraseña.',
    'auth/email-already-in-use':'No pudimos crear la cuenta. Si ya tienes una, inicia sesión o recupera tu contraseña.',
    'auth/invalid-email':'Revisa que el correo esté escrito correctamente.',
    'auth/weak-password':'Elige una contraseña de al menos 8 caracteres.',
    'auth/too-many-requests':'Hubo varios intentos seguidos. Espera un momento y vuelve a intentarlo.',
    'auth/network-request-failed':'No pudimos conectar. Revisa tu conexión y vuelve a intentarlo.',
    'auth/user-disabled':'Esta cuenta está desactivada. Contacta a quien te invitó.',
    'access/password-match':'Las contraseñas no coinciden.',
    'access/verify-email':'Primero confirma tu correo electrónico.',
    'access/name':'Escribe cómo quieres que te llamemos (hasta 80 caracteres).',
    'access/invalid-invite':'No pudimos activar esta invitación. Revisa el código y el correo al que te invitaron; también puede haber vencido o estar usado.',
    'permission-denied':'No pudimos activar esta invitación. Revisa el código y el correo al que te invitaron; también puede haber vencido o estar usado.',
    'access/already-member':'Esta cuenta ya tiene un acceso asignado.',
  };
  return messages[code] || 'No pudimos completar la operación. Inténtalo de nuevo en un momento.';
}
function clearSubscription() {
  generation++;
  stopMember?.(); stopMember = null;
  clearTimeout(accessTimer);
}
function renderAccess(user) {
  clearSubscription();
  $('signOut').hidden = !user;
  document.querySelectorAll('.account-email').forEach(el => { el.textContent = user?.email || ''; });
  if (!user) { show('loginView'); return; }
  if (!user.emailVerified) { show('verifyView'); return; }
  show('loadingView');
  const version = generation;
  accessTimer = setTimeout(() => { if (version === generation) show('errorView'); }, 12000);
  stopMember = onSnapshot(doc(db,'members',user.uid), {includeMetadataChanges:true}, snapshot => {
    if (version !== generation) return;
    // A cached membership alone never grants access. Server rules remain authoritative.
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    clearTimeout(accessTimer);
    if (!snapshot.exists()) {
      $('memberName').value = user.displayName || '';
      show('inviteView');
    } else if (snapshot.data().status === 'active') {
      $('memberGreeting').textContent = `Bienvenido, ${snapshot.data().displayName}`;
      show('memberView');
    } else { show('blockedView'); }
  }, () => {
    if (version === generation) { clearTimeout(accessTimer); show('errorView'); }
  });
}
async function action(operation) {
  if (busy) return;
  busy = true; message();
  document.querySelectorAll('button').forEach(button => { button.disabled = true; });
  try { await operation(); }
  catch (error) { message(failure(error), true); }
  finally {
    busy = false;
    document.querySelectorAll('button').forEach(button => { button.disabled = false; });
    if (auth.currentUser) renderAccess(auth.currentUser);
  }
}
onAuthStateChanged(auth, user => { if (!busy) renderAccess(user); });
$('showSignup').onclick = () => { message(); show('signupView'); };
$('showLogin').onclick = () => { message(); show('loginView'); };
$('loginForm').onsubmit = event => {
  event.preventDefault();
  action(async () => {
    await signInWithEmailAndPassword(auth, $('loginEmail').value.trim(), $('loginPass').value);
    $('loginPass').value = '';
  });
};
$('signupForm').onsubmit = event => {
  event.preventDefault();
  action(async () => {
    const name = $('regName').value.trim();
    if (!name) throw new Error('access/name');
    if ($('regPass').value !== $('regPassConfirm').value) throw new Error('access/password-match');
    const credential = await createUserWithEmailAndPassword(auth, $('regEmail').value.trim(), $('regPass').value);
    $('regPass').value = ''; $('regPassConfirm').value = '';
    await updateProfile(credential.user, {displayName:name});
    await sendEmailVerification(credential.user);
    lastVerificationSent = Date.now();
    message('Te enviamos un correo de verificación. Revisa también la carpeta de spam.');
  });
};
$('checkVerified').onclick = () => action(async () => {
  if (!auth.currentUser) return;
  await reload(auth.currentUser);
  await getIdToken(auth.currentUser, true);
  if (!auth.currentUser.emailVerified) message('Tu correo todavía no aparece confirmado. Abre el enlace que te enviamos y vuelve a intentarlo.', true);
});
$('resendVerification').onclick = () => action(async () => {
  if (!auth.currentUser) return;
  if (Date.now() - lastVerificationSent < 60000) { message('Ya enviamos el correo. Revisa tu bandeja o espera un minuto para reenviarlo.'); return; }
  await sendEmailVerification(auth.currentUser);
  lastVerificationSent = Date.now();
  message('Correo enviado. Revisa también la carpeta de spam.');
});
$('resetPassword').onclick = () => action(async () => {
  if (!$('loginEmail').reportValidity()) return;
  try { await sendPasswordResetEmail(auth, $('loginEmail').value.trim()); }
  catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
  message('Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña.');
});
$('inviteForm').onsubmit = event => {
  event.preventDefault();
  action(async () => {
    await redeemInvitation({db,user:auth.currentUser,code:$('inviteCode').value,displayName:$('memberName').value,sdk:{doc,runTransaction,serverTimestamp}});
    $('inviteCode').value = '';
    message();
  });
};
$('retryAccess').onclick = () => { message(); renderAccess(auth.currentUser); };
$('signOut').onclick = () => action(async () => {
  await signOut(auth);
  clearSubscription();
  document.querySelectorAll('input[type=password]').forEach(input => { input.value = ''; });
  $('inviteCode').value = '';
  renderAccess(null);
});
