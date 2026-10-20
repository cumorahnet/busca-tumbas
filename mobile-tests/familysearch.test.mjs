import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const {buildDraft, photoUrl, createController, galleryUrl} = createRequire(import.meta.url)('../mobile/familysearch.js');
const owner = {uid: 'owner', emailVerified: true, displayName: 'Ana Pérez', email: 'private@example.com'};
const tomb = {id: 'one', type: 'tomb', contributorId: 'owner', nombre_finado: 'Elena Uribe Sánchez',
    fecha_nacimiento: '18 de agosto de 1963', fecha_defuncion: '18 de julio de 2006',
    nombre_panteon: 'Panteón Municipal', municipio_panteon: 'Ajacuba', estado_panteon: 'Hidalgo',
    imageUrl: 'https://firebasestorage.googleapis.com/photo.jpg?token=private-token',
    contributor_email: 'private@example.com', geolocation: {latitude: 19.123456, longitude: -99.56789}};
function setup(options = {}) {
    const nodes = new Map(), downloads = [], blobs = [], revoked = [], copied = [], requests = [];
    let user = {...owner};
    const node = id => {
        if (!nodes.has(id)) nodes.set(id, {value: '', textContent: '', disabled: false, open: false, events: {},
            addEventListener(name, handler) { this.events[name] = handler; },
            removeAttribute(name) { delete this[name]; }, showModal() { this.open = true; }, close() { this.open = false; },
            focus() { this.focused = true; }, select() { this.selected = true; }});
        return nodes.get(id);
    };
    const api = createController({document: {getElementById: id => node(id.replace('familysearch-', '')),
        body: {append() {}}, createElement: () => ({click() { downloads.push({filename: this.download, url: this.href}); }, remove() {}})},
        navigator: {clipboard: {writeText: async text => { if (options.clipboardFailure) throw Error('denied'); copied.push(text); }}},
        fetch: async (url, args) => { requests.push({url, args}); return options.fetch ? options.fetch(url, args) :
            {ok: true, blob: async () => new Blob(['original-bytes'], {type: 'image/jpeg'})}; },
        URL: {createObjectURL: blob => { blobs.push(blob); return 'blob:local'; }, revokeObjectURL: url => revoked.push(url)},
        nativeDownloads: options.nativeDownloads, nativeHttp: options.nativeHttp, getCurrentUser: () => user, setTimeout: (fn, ms) => { if (ms === 1000) fn(); }});
    return {api, node, downloads, blobs, revoked, copied, requests, changeUser: next => { user = next; }};
}
test('draft includes attribution and estimated dates without exposing email, GPS or image tokens', () => {
    const draft = buildDraft({...tomb, fecha_nacimiento_estimada: true}, owner);
    assert.equal(draft.title, 'Lápida de Elena Uribe Sánchez');
    assert.match(draft.description, /Nacimiento estimado: 18 de agosto/);
    assert.match(draft.description, /Fotografía aportada por: Ana Pérez/);
    assert.match(draft.description, /Ajacuba, Hidalgo/);
    assert.doesNotMatch(draft.description, /private|token|19\.123456|-99\.56789/);
    assert.equal(draft.filename, 'lapida-elena-uribe-sanchez');
    assert.doesNotMatch(buildDraft({...tomb, fecha_defuncion: null, pais_panteon: null}, owner).description, /Defunción:|México/);
});
test('a verified collaborator can prepare tomb photos, including legacy records', () => {
    for (const user of [null, {...owner, emailVerified: false}]) assert.throws(() => buildDraft(tomb, user));
    assert.throws(() => buildDraft({...tomb, type: 'cemetery'}, owner));
    assert.throws(() => buildDraft({...tomb, imageUrl: ''}, owner));
    assert.ok(buildDraft({...tomb, contributorId: undefined, userId: 'owner'}, owner));
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'https://name:password@example.com/photo', 'http://example.com/photo']) assert.equal(photoUrl(url), '');
});
test('copy and text export use the reviewed edits without modifying the original record', async () => {
    const s = setup(); const before = JSON.stringify(tomb); s.api.open(tomb);
    s.node('memory-title').value = '<Título revisado>';
    s.node('memory-description').value = 'Descripción corregida';
    await s.node('copy-title').events.click(); await s.node('copy-description').events.click();
    assert.deepEqual(s.copied, ['<Título revisado>', 'Descripción corregida']);
    s.node('download-text').events.click();
    assert.equal(await s.blobs[0].text(), '<Título revisado>\n\nDescripción corregida\n');
    assert.match(s.downloads[0].filename, /\.txt$/);
    assert.equal(JSON.stringify(tomb), before);
    assert.equal(s.node('open-gallery').href, galleryUrl);
    assert.equal(s.requests.length, 0);
});
test('clipboard denial leaves text selected and explains the manual alternative', async () => {
    const s = setup({clipboardFailure: true}); s.api.open(tomb);
    await s.node('copy-description').events.click();
    assert.equal(s.node('memory-description').selected, true);
    assert.match(s.node('status').textContent, /texto está seleccionado/);
});
test('photo download preserves the original bytes and omits cookies', async () => {
    const s = setup(); s.api.open(tomb); await s.node('download-photo').events.click();
    assert.equal(await s.blobs[0].text(), 'original-bytes');
    assert.match(s.downloads[0].filename, /\.jpg$/);
    assert.equal(s.requests[0].args.credentials, 'omit');
    assert.ok(s.requests[0].args.signal);
    assert.deepEqual(s.revoked, ['blob:local']);
    assert.equal(s.node('download-photo').disabled, false);
});
test('unavailable or non-image downloads show a usable original-photo fallback', async () => {
    for (const response of [{ok: false}, {ok: true, blob: async () => new Blob(['<html>error</html>'], {type: 'text/html'})}]) {
        const s = setup({fetch: async () => response}); s.api.open(tomb);
        await s.node('download-photo').events.click();
        assert.equal(s.downloads.length, 0); assert.match(s.node('status').textContent, /Abrir foto original/);
        assert.equal(s.node('original-photo').href, tomb.imageUrl);
    }
});
test('closing or switching accounts during a download prevents a stale save', async () => {
    for (const cancel of [s => s.api.close(), s => s.changeUser({...owner, uid: 'other'})]) {
        let finish;
        const s = setup({fetch: () => new Promise(resolve => { finish = resolve; })});
        s.api.open(tomb); const pending = s.node('download-photo').events.click();
        cancel(s); finish({ok: true, blob: async () => new Blob(['photo'], {type: 'image/jpeg'})}); await pending;
        assert.equal(s.downloads.length, 0);
    }
});
test('session changes prevent copy, download and navigation, and clear the preparation', async () => {
    const s = setup(); s.api.open(tomb); s.changeUser(null);
    await s.node('copy-title').events.click();
    assert.equal(s.node('preparation-dialog').open, false);
    assert.equal(s.node('memory-title').value, ''); assert.equal(s.node('photo').src, undefined);
    assert.equal(s.copied.length, 0);
    let prevented = false; s.node('open-gallery').events.click({preventDefault() { prevented = true; }});
    assert.equal(prevented, true);
});


test('collaborative export keeps the original contributor and never credits the viewer',()=>{
    const viewer={uid:'viewer',emailVerified:true,displayName:'Viewer Name'};
    const shared=buildDraft({...tomb,contributor_name:'Original Contributor'},viewer);
    assert.ok(shared.description.includes('Original Contributor'));
    assert.ok(!shared.description.includes('Viewer Name'));
    assert.ok(buildDraft({...tomb,contributorId:undefined,userId:'original'},viewer));
    const unknown=buildDraft(tomb,viewer);
    assert.ok(unknown.description.includes('Colaborador de Busca Tumbas'));
    assert.ok(!unknown.description.includes('Viewer Name'));
});

test('a collaborator can open another contribution and copy its attributed details',async()=>{
    const s=setup();s.changeUser({uid:'viewer',emailVerified:true,displayName:'Viewer Name'});
    const original={...tomb,contributor_name:'Original Contributor'};
    const before=JSON.stringify(original);s.api.open(original);
    assert.equal(s.node('preparation-dialog').open,true);
    await s.node('copy-description').events.click();
    assert.ok(s.copied[0].includes('Original Contributor'));
    assert.equal(JSON.stringify(original),before);
});

test('search details show FamilySearch for other contributors without granting editing',()=>{
    const html=fs.readFileSync('index.html','utf8');
    const source='function renderTombDetail'+html.split('function renderTombDetail')[1].split('function enableTombDetailEditing')[0];
    for(const [uid,imageUrl,expected]of [['viewer',tomb.imageUrl,true],['owner',tomb.imageUrl,true],['viewer','',false]]){
        const nodes=new Map();
        const node=id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id)};
        const ctx={document:{getElementById:node},currentDetailTomb:{...tomb,imageUrl},auth:{currentUser:{uid,emailVerified:true}},tombExtraCameraCapture:null,recordDetailZoomLevel:1,
            tombOwnerId:t=>t.contributorId||t.userId,recordDetailPhotoHtml:()=>'',escapeHtml:String,detailDataHtml:()=>'',isSuperuserActive:()=>false,
            inlineJsValue:JSON.stringify,adminRecordActionsHtml:()=>'',tombHasLocation:()=>false,loadTombCommunityMedia:()=>{}};
        vm.createContext(ctx);vm.runInContext(source,ctx);ctx.renderTombDetail();
        const rendered=node('record-detail-content').innerHTML;
        assert.equal(rendered.includes('prepareForFamilySearch('),expected);
        assert.equal(rendered.includes('enableTombDetailEditing()'),uid==='owner');
        assert.equal(rendered.includes('deleteMyContribution('),uid==='owner');
    }
});


test('Android only confirms saving after the native write completes and exposes the saved file',async()=>{
    let complete;let received;const opened=[];
    const s=setup({nativeDownloads:{saveFile:options=>{received=options;return new Promise(resolve=>{complete=resolve})},openFile:async options=>opened.push(options)}});
    s.api.open(tomb);const pending=s.node('download-photo').events.click();
    for(let i=0;i<20&&!complete;i++)await new Promise(resolve=>setImmediate(resolve));
    assert.ok(complete);assert.equal(s.node('open-download').hidden,true);
    assert.ok(!s.node('status').textContent.includes('verificada'));
    assert.equal(Buffer.from(received.data,'base64').toString(),'original-bytes');
    assert.equal(received.mimeType,'image/jpeg');
    complete({bytes:14,filename:received.filename,path:'Descargas/Busca Tumbas/'+received.filename,uri:'content://media/external/downloads/123'});
    await pending;assert.equal(s.node('open-download').hidden,false);
    assert.ok(s.node('status').textContent.includes('Descargas/Busca Tumbas/'));
    await s.node('open-download').events.click();assert.equal(opened[0].uri,'content://media/external/downloads/123');
});

test('Android save failures, cancellation and incomplete writes never claim a saved photo',async()=>{
    for(const result of [new Error('Disk full'),{code:'SAVE_CANCELLED'},{bytes:0,path:'Descargas/test.jpg',uri:'content://test'}]){
        const s=setup({nativeDownloads:{saveFile:async()=>{if(result instanceof Error||result.code)throw result;return result}}});
        s.api.open(tomb);await s.node('download-photo').events.click();
        assert.equal(s.node('open-download').hidden,true);
        assert.ok(!s.node('status').textContent.includes('verificada'));
        assert.equal(s.node('download-photo').disabled,false);
    }
});


test('Android downloads the real image through native HTTP before verified storage',async()=>{
    const requests=[];const writes=[];
    const s=setup({fetch:()=>{throw Error('WebView fetch must not handle native photo downloads')},
        nativeHttp:{request:async options=>{requests.push(options);return {status:200,headers:{'Content-Type':'image/jpeg'},data:Buffer.from('original-bytes').toString('base64')}}},
        nativeDownloads:{saveFile:async options=>{writes.push(options);return {bytes:14,uri:'content://saved',path:'Descargas/Busca Tumbas/'+options.filename}}}});
    s.api.open(tomb);await s.node('download-photo').events.click();
    assert.equal(requests[0].url,tomb.imageUrl);
    assert.equal(requests[0].responseType,'arraybuffer');
    assert.equal(Buffer.from(writes[0].data,'base64').toString(),'original-bytes');
    assert.equal(s.node('open-download').hidden,false);
});
