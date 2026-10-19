import test from 'node:test';
import assert from 'node:assert/strict';
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
        getCurrentUser: () => user, setTimeout: (fn, ms) => { if (ms === 1000) fn(); }});
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
test('only a verified owner can prepare a tomb photo, including legacy userId ownership', () => {
    for (const user of [null, {...owner, uid: 'other'}, {...owner, emailVerified: false}]) assert.throws(() => buildDraft(tomb, user));
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
