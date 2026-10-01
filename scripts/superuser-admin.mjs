import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {emitKeypressEvents} from 'node:readline';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modes = ['--check', '--create', '--rotate', '--complete'];
const marker = 'Busca Tumbas - superusuario independiente';

export function validateConfig(config, project, contact) {
  if (config.projectId !== project || typeof config.uid !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(config.uid) || typeof config.email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email)) throw Error('CONFIGURE_DEDICATED_EMAIL_AND_UID');
  if (config.email.toLowerCase() === contact?.toLowerCase()) throw Error('NORMAL_ACCOUNT_MUST_REMAIN_SEPARATE');
}

export function validateAccount(user, config, mode) {
  if (!user) return;
  if (user.uid !== config.uid || user.email?.toLowerCase() !== config.email.toLowerCase()) throw Error('IDENTITY_CONFLICT');
  const claims = user.customClaims || {};
  if (Object.keys(claims).some(key => key !== 'platform_admin') ||
      (claims.platform_admin !== undefined && claims.platform_admin !== true)) throw Error('ROLE_CONFLICT');
  if (user.disabled && mode !== '--complete') throw Error('ACCOUNT_DISABLED');
  if (mode === '--complete') {
    if (!user.disabled || user.displayName !== marker) throw Error('NOT_PARTIAL_SETUP');
  } else if (claims.platform_admin !== true) throw Error('ROLE_MISSING');
}

export async function inspect(auth, config, mode) {
  async function find(method, value) {
    try { return await auth[method](value); }
    catch (error) { if (error.code === 'auth/user-not-found') return null; throw error; }
  }
  const byUid = await find('getUser', config.uid);
  const byEmail = await find('getUserByEmail', config.email);
  if (byEmail && byEmail.uid !== config.uid) throw Error('EMAIL_IN_USE');
  validateAccount(byUid, config, mode);
  return byUid;
}

function secret(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw Error('INTERACTIVE_TERMINAL_REQUIRED');
  return new Promise((resolve, reject) => {
    let value = '';
    const previousRaw = process.stdin.isRaw;
    process.stdout.write(prompt);
    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    function finish(error) {
      process.stdin.removeListener('keypress', onKey);
      process.stdin.setRawMode(previousRaw);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolve(value);
      value = '';
    }
    function onKey(text, key = {}) {
      if (key.ctrl && key.name === 'c') return finish(Error('CANCELLED'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') { value = Array.from(value).slice(0,-1).join(''); return; }
      if (!key.ctrl && !key.meta && text && !/[\x00-\x1f\x7f]/.test(text)) value += text;
    }
    process.stdin.on('keypress', onKey);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  if (!modes.includes(mode) || args.length > 3 ||
      (args.length > 1 && (args[1] !== '--operator' || !args[2]))) throw Error('USAGE: node scripts/superuser-admin.mjs --check|--create|--rotate|--complete [--operator EMAIL]');
  const config = JSON.parse(await readFile(path.join(root,'superuser-config.json'),'utf8'));
  const project = JSON.parse(await readFile(path.join(root,'.firebaserc'),'utf8')).projects.default;
  const html = await readFile(path.join(root,'index.html'),'utf8');
  const contact = html.match(/const SUPPORT_EMAIL = '([^']+)'/)?.[1];
  validateConfig(config, project, contact);
  if (mode !== '--check' && (!process.stdin.isTTY || !process.stdout.isTTY)) throw Error('INTERACTIVE_TERMINAL_REQUIRED');
  // Adapter for installed firebase-tools 15.x; no tokens are printed.
  process.env.DEBUG = '';
  const cli = require('firebase-tools/lib/auth');
  const operator = args[2] ? cli.getAllAccounts().find(a => a.user.email === args[2]) : cli.getProjectDefaultAccount(root);
  if (!operator?.tokens?.refresh_token) throw Error('FIREBASE_LOGIN_REQUIRED');
  console.log(`Proyecto: ${project}\nOperador: ${operator.user.email}\nCuenta: ${config.email}\nUID: ${config.uid}\nModo: ${mode}`);
  const {initializeApp, deleteApp} = require('../functions/node_modules/firebase-admin/app');
  const {getAuth} = require('../functions/node_modules/firebase-admin/auth');
  const app = initializeApp({projectId:project,credential:{async getAccessToken() {
    const token = await cli.getAccessToken(operator.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
    return {access_token:token.access_token,expires_in:Math.max(1, Math.floor((token.expires_at-Date.now())/1000))};
  }}},'superuser-cli');
  let password = '', confirmation = '', stage = 'read-auth';
  try {
    const auth = getAuth(app);
    const existing = await inspect(auth,config,mode);
    if (mode === '--check') {
      console.log(existing ? `Cuenta compatible. Correo verificado: ${existing.emailVerified}.` : 'Cuenta ausente. No se realizaron cambios.');
      return;
    }
    if (mode === '--create' && existing) throw Error('ACCOUNT_ALREADY_EXISTS');
    if ((mode === '--rotate' || mode === '--complete') && !existing) throw Error('ACCOUNT_MISSING');
    if (mode === '--create' || mode === '--rotate') {
      password = await secret('Nueva contrasena (16-128 caracteres, entrada oculta): ');
      confirmation = await secret('Confirma la contrasena: ');
      if (password.length < 16 || password.length > 128 || password !== confirmation) throw Error('PASSWORD_POLICY_OR_CONFIRMATION');
      confirmation = '';
    }
    if (mode === '--create') {
      stage = 'create-auth';
      await auth.createUser({uid:config.uid,email:config.email,password,disabled:true,emailVerified:false,displayName:marker});
      password = '';
      stage = 'assign-role';
      await auth.setCustomUserClaims(config.uid,{platform_admin:true});
      stage = 'enable-new-account';
      await auth.updateUser(config.uid,{disabled:false});
    } else if (mode === '--complete') {
      stage = 'complete-partial-setup';
      await auth.setCustomUserClaims(config.uid,{platform_admin:true});
      await auth.updateUser(config.uid,{disabled:false});
    } else {
      stage = 'rotate-password';
      await auth.updateUser(config.uid,{password});
      password = '';
      stage = 'revoke-refresh-tokens';
      await auth.revokeRefreshTokens(config.uid);
      console.log('Tokens de renovacion revocados. Los tokens de acceso ya emitidos pueden seguir vigentes hasta expirar.');
    }
    console.log('Operacion completada. Verifica el correo de la cuenta antes del acceso global.');
  } catch(error) {
    console.error(`Etapa: ${stage}. Si Auth se creo pero el alta no termino, la cuenta permanece deshabilitada; revisa --complete antes de reintentar.`);
    throw error;
  } finally {
    password = ''; confirmation = '';
    await deleteApp(app);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Do not print SDK messages, request objects, tokens or passwords.
    const safeCode = /^auth\/[a-z-]+$/.test(error.code || '') ? error.code :
      (/^[A-Z_]+$/.test(error.message || '') ? error.message : 'OPERATION_FAILED');
    console.error(`Superusuario: ${safeCode}`);
    process.exitCode = 1;
  });
}
