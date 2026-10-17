import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFunctions = createRequire(path.join(root,'functions','package.json'));

export async function setPlatformAdmin(auth, uid, email, check = true) {
  if (!uid || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('INVALID_IDENTITY');
  const user = await auth.getUser(uid);
  if (user.uid !== uid || user.email?.toLowerCase() !== email.toLowerCase()) throw Error('IDENTITY_CONFLICT');
  if (user.disabled) throw Error('ACCOUNT_DISABLED');
  const claims = user.customClaims || {};
  if (['role','schoolKey','communityId','community_admin','superuser','tenantId'].some(key => Object.hasOwn(claims,key)) ||
      (claims.platform_admin !== undefined && claims.platform_admin !== true)) throw Error('ROLE_CONFLICT');
  if (check) return user;
  if (claims.platform_admin !== true) await auth.setCustomUserClaims(uid,{...claims,platform_admin:true});
  const updated = await auth.getUser(uid);
  if (updated.customClaims?.platform_admin !== true) throw Error('ROLE_VERIFICATION_FAILED');
  return updated;
}

async function main() {
  const [mode, uid, email, ...extra] = process.argv.slice(2);
  if (!['--check','--assign'].includes(mode) || !uid || !email ||
      (extra.length && (extra.length !== 1 || extra[0] !== '--firebase-cli'))) throw Error('EXPECTED_MODE_UID_EMAIL');
  const projectId = JSON.parse(await readFile(path.join(root,'.firebaserc'),'utf8')).projects.default;
  const {initializeApp,applicationDefault,deleteApp} = requireFunctions('firebase-admin/app');
  const {getAuth} = requireFunctions('firebase-admin/auth');
  let credential = applicationDefault();
  if (extra[0] === '--firebase-cli') {
    process.env.DEBUG = '';
    const cli = require('firebase-tools/lib/auth');
    const operator = cli.getProjectDefaultAccount(root);
    if (!operator?.tokens?.refresh_token) throw Error('FIREBASE_LOGIN_REQUIRED');
    credential = {async getAccessToken() {
      const token = await cli.getAccessToken(operator.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
      return {access_token:token.access_token,expires_in:Math.max(1,Math.floor((token.expires_at-Date.now())/1000))};
    }};
  }
  const app = initializeApp({projectId,credential},'platform-admin-assignment');
  try {
    const user = await setPlatformAdmin(getAuth(app),uid,email,mode === '--check');
    console.log(`Proyecto: ${projectId}. UID: ${user.uid}. platform_admin: ${user.customClaims?.platform_admin === true}. Correo verificado: ${user.emailVerified}.`);
    console.log(mode === '--check' ? 'Solo lectura: no se realizaron cambios.' : 'Rol comprobado. Entra directamente con tu correo y contraseña independiente en el acceso de superusuario.');
  } finally { await deleteApp(app); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    const code = /^auth\/[a-z-]+$/.test(error.code || '') ? error.code : /^[A-Z_]+$/.test(error.message || '') ? error.message : 'OPERATION_FAILED_CHECK_ADC_AND_IAM';
    console.error(`Superusuario: ${code}`);
    process.exitCode = 1;
  });
}
