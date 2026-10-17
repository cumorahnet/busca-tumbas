import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {secret} from './superuser-admin.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const rf = createRequire(path.join(root,'functions/package.json'));
const {hashPassword} = require('../functions/superuser-password.js');
async function main() {
  const [mode,uid,email,...extra] = process.argv.slice(2);
  if (!['--create','--check','--rotate'].includes(mode) || !uid || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '') || extra.length) throw Error('EXPECTED_MODE_UID_EMAIL');
  if (mode !== '--check' && (!process.stdin.isTTY || !process.stdout.isTTY)) throw Error('INTERACTIVE_TERMINAL_REQUIRED');
  process.env.DEBUG = '';
  const cli = require('firebase-tools/lib/auth');
  const operator = cli.getProjectDefaultAccount(root);
  if (!operator?.tokens?.refresh_token) throw Error('FIREBASE_LOGIN_REQUIRED');
  const projectId = JSON.parse(await readFile(path.join(root,'.firebaserc'),'utf8')).projects.default;
  async function token() {
    return cli.getAccessToken(operator.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
  }
  const {initializeApp,deleteApp} = rf('firebase-admin/app');
  const {getAuth} = rf('firebase-admin/auth');
  const app = initializeApp({projectId,credential:{async getAccessToken(){const t=await token();return {access_token:t.access_token,expires_in:Math.max(1,Math.floor((t.expires_at-Date.now())/1000))};}}},'superuser-password');
  let normal='',password='',confirmation='';
  try {
    const auth = getAuth(app);
    const user = await auth.getUser(uid);
    if (user.email?.toLowerCase() !== email.toLowerCase() || user.disabled || user.customClaims?.platform_admin !== true) throw Error('INCOMPATIBLE_ACCOUNT');
    const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/_superuserCredentials`;
    async function rest(url,options={}) {
      const t = await token();
      return fetch(url,{...options,headers:{Authorization:`Bearer ${t.access_token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(30000)});
    }
    const response = await rest(`${base}/${encodeURIComponent(uid)}`);
    if (!response.ok && response.status !== 404) throw Error('CREDENTIAL_READ_FAILED');
    const existing = response.ok ? await response.json() : null;
    console.log(`Proyecto: ${projectId}. Cuenta: ${email}. UID: ${uid}.`);
    if (mode === '--check') {console.log(existing ? 'Contraseña administrativa configurada. Solo lectura.' : 'Contraseña administrativa pendiente. Solo lectura.');return;}
    if (mode === '--create' && existing) throw Error('PASSWORD_ALREADY_CONFIGURED_USE_EXPLICIT_ROTATE');
    if (mode === '--rotate' && !existing) throw Error('PASSWORD_NOT_CONFIGURED');
    normal = await secret('Contraseña actual del usuario (entrada oculta): ');
    const html = await readFile(path.join(root,'index.html'),'utf8');
    const apiKey = html.match(/apiKey:\s*"([^"]+)"/)?.[1];
    if (!apiKey) throw Error('FIREBASE_CONFIG_MISSING');
    const verified = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:normal,returnSecureToken:false}),signal:AbortSignal.timeout(30000)});
    if (!verified.ok) throw Error('NORMAL_PASSWORD_VERIFICATION_FAILED');
    const identity = await verified.json();
    if (identity.localId !== uid) throw Error('IDENTITY_CONFLICT');
    password = await secret('Nueva contraseña de superusuario (16-128 caracteres, entrada oculta): ');
    confirmation = await secret('Confirma la contraseña de superusuario: ');
    if (password.length < 16 || password.length > 128 || password !== confirmation) throw Error('PASSWORD_POLICY_OR_CONFIRMATION');
    if (password === normal) throw Error('SUPERUSER_PASSWORD_MUST_DIFFER');
    normal='';confirmation='';
    const record = await hashPassword(password);
    password='';
    const fields = {salt:{stringValue:record.salt},hash:{stringValue:record.hash}};
    const url = existing ? `${base}/${encodeURIComponent(uid)}?currentDocument.updateTime=${encodeURIComponent(existing.updateTime)}` : `${base}?documentId=${encodeURIComponent(uid)}`;
    const saved = await rest(url,{method:existing?'PATCH':'POST',body:JSON.stringify({fields})});
    if (!saved.ok) throw Error('CREDENTIAL_WRITE_FAILED');
    if (mode === '--rotate') await auth.revokeRefreshTokens(uid);
    console.log('Contraseña de superusuario guardada como hash. La contraseña del usuario no se modificó.');
  } finally {normal='';password='';confirmation='';await deleteApp(app);}
}
main().catch(error=>{console.error(/^auth\/[a-z-]+$/.test(error.code || '') ? error.code : /^[A-Z_]+$/.test(error.message || '') ? error.message : 'SUPERUSER_PASSWORD_CONFIGURATION_FAILED');process.exitCode=1;});
