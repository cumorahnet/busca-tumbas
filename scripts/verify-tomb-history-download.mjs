import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {randomUUID, randomBytes} from 'node:crypto';
import path from 'node:path';
import {chromium} from 'playwright';

if(process.argv[2] !== '--run') throw Error('Use --run to create and remove an isolated test account and private tomb.');
process.env.DEBUG='';
const require=createRequire(import.meta.url);
const requireFunctions=createRequire(path.resolve('functions/package.json'));
const projectId=JSON.parse(await readFile('.firebaserc','utf8')).projects.default;
const source=await readFile('index.html','utf8');
const apiKey=source.match(/apiKey:\s*"([^"]+)"/)?.[1];
const bucket=source.match(/storageBucket:\s*"([^"]+)"/)?.[1];
assert.ok(bucket?.startsWith(projectId+'.'));
const cliAuth=require('firebase-tools/lib/auth');
const account=cliAuth.getProjectDefaultAccount(process.cwd());
if(!account?.tokens?.refresh_token) throw Error('Firebase login required.');
const credential={async getAccessToken(){
    const token=await cliAuth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
    return {access_token:token.access_token,expires_in:Math.max(1,Math.floor((token.expires_at-Date.now())/1000))};
}};
const {initializeApp,deleteApp}=requireFunctions('firebase-admin/app');
const {getAuth}=requireFunctions('firebase-admin/auth');
const app=initializeApp({projectId,storageBucket:bucket,credential},'verify-history-download');
const uid='tomb-check-'+randomUUID();
const recordId=uid;
const email=uid+'@example.invalid';
const password=randomBytes(24).toString('hex');
const storagePath=`tumbas_images/${uid}/check.png`;
const objectUrl=`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(storagePath)}`;
const firestore=`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const origin='https://buscatumbas.cumorahnet.com';
const bytes=await readFile('assets/brand/logo.png');
let browser;
let token;
let accountCreated=false;
let recordCreated=false;
let fileCreated=false;
async function admin(url,method='GET',body,contentType='application/json'){
    const {access_token}=await credential.getAccessToken();
    return fetch(url,{method,headers:{Authorization:'Bearer '+access_token,'Content-Type':contentType},
        ...(body===undefined?{}:{body:contentType==='application/json'?JSON.stringify(body):body}),signal:AbortSignal.timeout(30000)});
}
async function call(name,data){
    const response=await fetch(`https://us-central1-${projectId}.cloudfunctions.net/${name}`,{method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({data}),signal:AbortSignal.timeout(30000)});
    const result=await response.json();
    if(!response.ok || result.error) throw Error(name+': '+(result.error?.status || response.status));
    return result.result;
}
const field=value=>value instanceof Date?{timestampValue:value.toISOString()}:typeof value==='boolean'?{booleanValue:value}:{stringValue:value};
try {
    accountCreated=true;await getAuth(app).createUser({uid,email,password,emailVerified:true,displayName:'Verificación temporal'});
    const login=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,{method:'POST',
        headers:{'Content-Type':'application/json',Referer:origin+'/'},body:JSON.stringify({email,password,returnSecureToken:true})});
    const session=await login.json();assert.equal(login.ok,true,'Temporary test account sign-in');token=session.idToken;assert.ok(token);
    const upload=await admin(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(storagePath)}`,'POST',bytes,'image/png');
    assert.equal(upload.ok,true,'Fixture upload');fileCreated=true;
    const imageToken=randomUUID();
    assert.equal((await admin(objectUrl,'PATCH',{metadata:{firebaseStorageDownloadTokens:imageToken}})).ok,true);
    const imageUrl=`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(storagePath)}?alt=media&token=${imageToken}`;
    const values={userId:uid,contributorId:uid,contributor_name:'Verificación temporal',nombre_finado:'Verificación '+uid,
        nombres:'Verificación '+uid,visibility:'private',status:'pending',imageUrl,timestamp:new Date()};
    const create=await admin(`${firestore}/tumbas/${recordId}`,'PATCH',{fields:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,field(value)]))});
    assert.equal(create.ok,true,'Private test tomb creation');recordCreated=true;
    const changed='Verificación corregida '+uid;
    await call('actualizarAportacionTumba',{recordId,changes:{nombres:changed,nombre_finado:changed}});
    let history;
    for(let attempt=0;attempt<20;attempt++){
        history=await call('obtenerHistorialTumba',{recordId});
        if(history.entries.some(entry=>entry.action==='created') && history.entries.some(entry=>entry.action==='edited' && entry.changes.some(change=>change.field==='nombres' && change.after===changed))) break;
        await new Promise(resolve=>setTimeout(resolve,2000));
    }
    const edit=history.entries.find(entry=>entry.action==='edited' && entry.changes.some(change=>change.after===changed));
    assert.ok(edit,'Actual Firestore trigger records the edit');
    assert.equal(edit.actorName,'Verificación temporal');assert.ok(edit.changedAt);
    assert.equal(edit.actorUid,undefined);assert.equal(edit.canContact,false);
    assert.ok(edit.changes.some(change=>change.before===values.nombres && change.after===changed));
    console.log('LIVE: private test tomb edit recorded by Firestore with before/after values, server date and correct editor.');
    const download=await fetch(origin+'/api/tomb-photo?recordId='+recordId,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
    assert.equal(download.status,200);assert.equal(download.headers.get('content-type'),'image/png');
    assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
    console.log('LIVE: authenticated same-origin download returns original image bytes.');
    assert.equal((await fetch(origin+'/api/tomb-photo?recordId='+recordId)).status,401);
    browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.goto(origin,{waitUntil:'networkidle'});
    await page.evaluate(async ({email,password})=>{await auth.signInWithEmailAndPassword(email,password);},{email,password});
    await page.waitForFunction(()=>auth.currentUser?.emailVerified && document.getElementById('main-app').style.display==='flex');
    if(await page.locator('#pwa-install-dialog').isVisible())await page.locator('#pwa-install-dismiss').click();
    await page.evaluate(id=>openTombDetail(id),recordId);
    await page.locator('#tomb-history-list').getByText('Datos actualizados',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Preparar para FamilySearch',exact:true}).click();
    await page.evaluate(()=>Object.defineProperty(navigator,'canShare',{value:undefined,configurable:true}));
    const browserDownload=page.waitForEvent('download');
    await page.locator('#familysearch-download-photo').click();
    assert.deepEqual(await readFile(await (await browserDownload).path()),bytes);
    console.log('LIVE: download button saves the complete original photo in Chrome; history is visible in the record.');
    await page.evaluate(()=>auth.signOut());
} finally {
    if(browser)await browser.close();
    const failures=[];
    if(recordCreated){
        try {
            const deletion=await admin(`${firestore}/tumbas/${recordId}`,'DELETE');assert.ok(deletion.ok || deletion.status===404);
            for(let attempt=0;attempt<15;attempt++){
                const response=await admin(`${firestore}/tumbas/${recordId}/history`);
                const records=(await response.json()).documents || [];
                if(records.some(record=>record.fields?.action?.stringValue==='deleted') || attempt===14){
                    for(const record of records)assert.equal((await admin('https://firestore.googleapis.com/v1/'+record.name,'DELETE')).ok,true);
                    break;
                }
                await new Promise(resolve=>setTimeout(resolve,2000));
            }
        } catch {failures.push('private tomb/history');}
    }
    if(fileCreated)try{const response=await admin(objectUrl,'DELETE');assert.ok(response.ok || response.status===404);}catch{failures.push('test photo');}
    for(const collection of ['_entitlements','_moderation']){
        try{const response=await admin(`${firestore}/${collection}/${uid}`,'DELETE');assert.ok(response.ok || response.status===404);}catch{failures.push(collection);}
    }
    if(accountCreated)try{await getAuth(app).deleteUser(uid);}catch(error){if(error.code!=='auth/user-not-found')failures.push('test account');}
    await deleteApp(app);
    if(failures.length)throw Error('Temporary fixture cleanup needs attention: '+failures.join(', ')+'; fixture '+recordId);
    console.log('Temporary account, private tomb, test photo and test history removed. No user messages were sent.');
}
