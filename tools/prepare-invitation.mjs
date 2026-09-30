// Generates a draft only. It never contacts Firebase or sends an invitation.
import {randomBytes} from 'node:crypto';
const email=(process.argv[2]||'').trim().toLowerCase();
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
 console.error('Uso: node tools/prepare-invitation.mjs correo@ejemplo.com'); process.exit(1);
}
const code=randomBytes(16).toString('hex').toUpperCase();
const expiresAt=new Date(Date.now()+7*86400000).toISOString();
console.log(JSON.stringify({collection:'inviteCodes',documentId:code,fields:{email:{type:'string',value:email},used:{type:'boolean',value:false},expiresAt:{type:'timestamp',value:expiresAt}}},null,2));
console.log('\nCrea este documento desde Firebase Console. Comparte el código solo con la persona invitada. El borrador no está guardado en Firebase.');
