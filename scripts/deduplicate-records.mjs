import {createRequire} from 'node:module';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
const require = createRequire(import.meta.url);
const {tombDuplicate, cemeteryDuplicate} = require('../functions/duplicates.js');
process.env.DEBUG = '';
const cli = require('firebase-tools/lib/auth');
const operator = cli.getProjectDefaultAccount(process.cwd());
if (!operator?.tokens?.refresh_token) throw Error('FIREBASE_LOGIN_REQUIRED');
const projectId = JSON.parse(await readFile('.firebaserc', 'utf8')).projects.default;
const token = await cli.getAccessToken(operator.tokens.refresh_token,
  ['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
async function api(path, body) {
  const response = await fetch(base + path, {method: body ? 'POST' : 'GET',
    headers: {Authorization: `Bearer ${token.access_token}`, 'Content-Type':'application/json'},
    ...(body ? {body:JSON.stringify(body)} : {})});
  if (!response.ok) throw Error(`FIRESTORE_${response.status}: ${await response.text()}`);
  return response.json();
}
const decode = value => 'nullValue' in value ? null : value.stringValue ?? value.booleanValue ??
  (value.integerValue !== undefined ? Number(value.integerValue) : value.doubleValue) ??
  value.geoPointValue ?? (value.arrayValue ? (value.arrayValue.values || []).map(decode) : value);
async function list(collection) {
  const docs = [];
  let pageToken = '';
  do {
    const page = await api(`/${collection}?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
    docs.push(...(page.documents || [])); pageToken = page.nextPageToken || '';
  } while(pageToken);
  return docs.map(raw=>({raw, id:raw.name.split('/').at(-1), data:Object.fromEntries(
    Object.entries(raw.fields || {}).map(([k,v])=>[k,decode(v)]))}));
}
const snapshot = {};
for (const collection of ['tumbas','cemeteries','correction_requests','_errorReviews']) snapshot[collection] = await list(collection);
await mkdir('.record-audit',{recursive:true});
const stamp = new Date().toISOString().replace(/[:.]/g,'-');
await writeFile(`.record-audit/dedup-before-${stamp}.json`,JSON.stringify(snapshot,null,2));
const writes = [];
for (const collection of ['tumbas','cemeteries']) {
  const records = snapshot[collection]; const kept = [];
  console.log(collection, records.length);
  for (const record of records) {
    const canonical = kept.find(item => collection === 'tumbas' ? tombDuplicate(item.data,record.data) : cemeteryDuplicate(item.data,record.data));
    if (!canonical) { kept.push(record); continue; }
    console.log('MERGE', collection, record.id, '=>', canonical.id, record.data.nombre_finado || record.data.name);
    writes.push({update:{name:base.replace('https://firestore.googleapis.com/v1/','') + `/_mergedRecords/${collection}_${record.id}`,
      fields:{original:{mapValue:{fields:record.raw.fields}}, canonicalId:{stringValue:canonical.id},
        collection:{stringValue:collection}, mergedAt:{timestampValue:new Date().toISOString()}}},currentDocument:{exists:false}});
    for (const refCollection of ['correction_requests','_errorReviews']) for (const linked of snapshot[refCollection]) {
      const fields = {};
      for (const key of ['tombId','recordId']) if (linked.data[key] === record.id) fields[key] = {stringValue:canonical.id};
      if (Object.keys(fields).length) writes.push({update:{name:linked.raw.name,fields},updateMask:{fieldPaths:Object.keys(fields)},currentDocument:{updateTime:linked.raw.updateTime}});
    }
    if (collection === 'cemeteries') for (const linked of snapshot.tumbas) if (linked.data.cemetery_id === record.id) {
      writes.push({update:{name:linked.raw.name,fields:{cemetery_id:{stringValue:canonical.id}}},updateMask:{fieldPaths:['cemetery_id']},currentDocument:{updateTime:linked.raw.updateTime}});
    }
    // Protect the chosen canonical record from a concurrent removal or edit.
    writes.push({update:{name:canonical.raw.name,fields:{deduplicatedAt:{timestampValue:new Date().toISOString()}}},
      updateMask:{fieldPaths:['deduplicatedAt']},currentDocument:{updateTime:canonical.raw.updateTime}});
    writes.push({delete:record.raw.name,currentDocument:{updateTime:record.raw.updateTime}});
  }
}
if (process.argv.includes('--apply') && writes.length) console.log('APPLIED', (await api(':commit',{writes})).writeResults.length);
else console.log('PLANNED_WRITES',writes.length);
