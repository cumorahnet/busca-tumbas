import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const host = 'https://buscatumbas-2e7cc.web.app';
const version = await fetch(`${host}/version.json`, {cache:'no-store'});
assert.equal(version.status,200);
const localVersion = JSON.parse(await readFile('version.json','utf8'));
assert.deepEqual(await version.json(), localVersion);
const html = await (await fetch(host, {cache:'no-store'})).text();
assert.equal(html, await readFile('index.html','utf8'));
console.log(`Hosting: v${localVersion.mayor}.${localVersion.menor}, identical to verified source`);
const privateBackup = await fetch(`${host}/.record-audit/before.json`);
assert.equal(privateBackup.status,404);
console.log('Private backups: inaccessible from Hosting');
for (const name of ['crearAportacionTumba','crearAportacionPanteon','actualizarAportacionPanteon','aclararDisputaDuplicado','resolverDisputaDuplicado','obtenerComparacionDisputa']) {
  const response = await fetch(`https://us-central1-buscatumbas-2e7cc.cloudfunctions.net/${name}`, {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:{}})});
  const body = await response.json();
  assert.equal(response.status,401);
  assert.equal(body.error.status,'UNAUTHENTICATED');
  console.log(`${name}: deployed, rejects anonymous writes`);
}
