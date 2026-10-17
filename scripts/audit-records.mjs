import {createRequire} from 'node:module';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
const require = createRequire(import.meta.url);
const admin = createRequire(new URL('../functions/package.json', import.meta.url));
process.env.DEBUG = '';
const cli = require('firebase-tools/lib/auth');
const operator = cli.getProjectDefaultAccount(process.cwd());
if (!operator?.tokens?.refresh_token) throw Error('FIREBASE_LOGIN_REQUIRED');
const projectId = JSON.parse(await readFile('.firebaserc', 'utf8')).projects.default;
const {initializeApp, deleteApp} = admin('firebase-admin/app');
const {getFirestore} = admin('firebase-admin/firestore');
const app = initializeApp({projectId, credential: {async getAccessToken() {
  const token = await cli.getAccessToken(operator.tokens.refresh_token,
    ['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
  return {access_token: token.access_token, expires_in: Math.max(1, Math.floor((token.expires_at-Date.now())/1000))};
}}}, 'record-audit');
try {
  const {access_token} = await app.options.credential.getAccessToken();
  const records = [];
  let pageToken = '';
  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/tumbas`);
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, {headers: {Authorization: `Bearer ${access_token}`}});
    if (!response.ok) throw Error(`FIRESTORE_READ_${response.status}: ${await response.text()}`);
    const page = await response.json();
    for (const doc of page.documents || []) records.push({id: doc.name.split('/').at(-1), raw: doc,
      data: Object.fromEntries(Object.entries(doc.fields || {}).map(([key, value]) => [key,
        value.stringValue ?? value.booleanValue ?? value.integerValue ?? value.nullValue ?? value]))});
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  await mkdir('.record-audit', {recursive: true});
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await writeFile(`.record-audit/before-${stamp}.json`, JSON.stringify({projectId, records}, null, 2));
  console.log(JSON.stringify(records.map(({id, data}) => ({id, ...Object.fromEntries(Object.entries(data).filter(([key]) => /nombre|apellido|fecha/.test(key)))})), null, 2));
  console.log('TOTAL', records.length);
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const spellings = {maria: 'María', rodriguez: 'Rodríguez', hernandez: 'Hernández', sanchez: 'Sánchez', panteon: 'Panteón'};
  const correct = text => text.replace(/\p{L}+/gu, word => spellings[word.toLowerCase()] || word).normalize('NFC');
  const writes = [];
  const changes = [];
  for (const record of records) {
    const patch = {};
    for (const key of ['nombres','apellido_paterno','apellido_materno','nombre_finado','nombre_panteon']) {
      if (typeof record.data[key] === 'string') {
        const value = correct(record.data[key]);
        if (value !== record.data[key]) patch[key] = value;
      }
    }
    for (const key of ['fecha_nacimiento','fecha_defuncion']) {
      const original = record.data[key];
      if (typeof original !== 'string') continue;
      let value;
      if (/^\d{4}$/.test(original)) value = original;
      else {
        const match = original.toLowerCase().match(/^(?:(\d{1,2})(?: de)?\s+)?([a-z]+)(?: de)?\s+(\d{4})$/);
        if (!match) throw Error(`UNRECOGNIZED_DATE: ${record.id} ${original}`);
        const month = months.findIndex(m => m.startsWith(match[2]));
        if (month < 0) throw Error('INVALID_MONTH');
        if (match[1]) {
          const date = new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
          if (date.getUTCMonth() !== month || date.getUTCDate() !== Number(match[1])) throw Error('INVALID_DAY');
          const iso = `${match[3]}-${String(month+1).padStart(2,'0')}-${match[1].padStart(2,'0')}`;
          if (record.data[`${key}_iso`] !== iso) throw Error(`DATE_CONFLICT: ${record.id}`);
        }
        value = `${match[1] ? `${Number(match[1])} de ` : ''}${months[month]} de ${match[3]}`;
      }
      if (value !== original) patch[key] = value;
    }
    if (!Object.keys(patch).length) continue;
    changes.push({id: record.id, before: Object.fromEntries(Object.keys(patch).map(key => [key, record.data[key]])), after: patch});
    writes.push({update: {name: record.raw.name, fields: Object.fromEntries(Object.entries(patch).map(([key,value]) => [key,{stringValue:value}]))},
      updateMask: {fieldPaths: Object.keys(patch)}, currentDocument: {updateTime: record.raw.updateTime}});
  }
  await writeFile(`.record-audit/changes-${stamp}.json`, JSON.stringify(changes, null, 2));
  console.log('CHANGES', JSON.stringify(changes, null, 2));
  if (process.argv.includes('--apply') && writes.length) {
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`, {
      method:'POST', headers:{Authorization:`Bearer ${access_token}`, 'Content-Type':'application/json'}, body:JSON.stringify({writes})});
    if (!response.ok) throw Error(`COMMIT_${response.status}: ${await response.text()}`);
    console.log('APPLIED', (await response.json()).writeResults.length);
  }
} finally { await deleteApp(app); }
