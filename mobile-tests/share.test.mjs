import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('mobile/share.js', 'utf8');
const publicUrl = 'https://buscatumbas.cumorahnet.com/';
function setup(navigator = {}) {
    const nodes = new Map();
    const node = id => {
        if (!nodes.has(id)) nodes.set(id, {hidden: true, events: {}, open: false,
            addEventListener(type, handler) { this.events[type] = handler; },
            showModal() { this.open = true; }, close() { this.open = false; },
            focus() { this.focused = true; }, select() { this.selected = true; }});
        return nodes.get(id);
    };
    const actions = [node('auth'), node('header'), node('footer')];
    vm.runInNewContext(source, {navigator, document: {getElementById: node, querySelectorAll: () => actions},
        window: {location: {href: 'https://example.invalid/?token=private#account'}}});
    return {node, actions};
}
test('shares only the public URL from a user click, without account or URL parameters', async () => {
    const shares = [];
    const s = setup({share: async data => shares.push(data)});
    assert.equal(shares.length, 0);
    assert.ok(s.actions.every(action => !action.hidden));
    await s.actions[0].events.click();
    assert.equal(shares.length, 1);
    assert.equal(shares[0].url, publicUrl);
    assert.ok(!JSON.stringify(shares).includes('private'));
});
test('without native sharing the selected URL can be copied explicitly', async () => {
    const copied = [];
    const s = setup({clipboard: {writeText: async text => copied.push(text)}});
    await s.actions[1].events.click();
    assert.equal(s.node('app-share-dialog').open, true);
    assert.equal(s.node('app-share-url').selected, true);
    assert.equal(copied.length, 0);
    await s.node('app-share-copy').events.click();
    assert.deepEqual(copied, [publicUrl]);
    assert.match(s.node('app-share-status').textContent, /copiada/);
    s.node('app-share-dismiss').events.click();
    assert.equal(s.node('app-share-dialog').open, false);
});
test('denied clipboard leaves a manual copy option without claiming success', async () => {
    const s = setup({clipboard: {writeText: async () => { throw Error('denied'); }}});
    await s.actions[0].events.click();
    await s.node('app-share-copy').events.click();
    assert.equal(s.node('app-share-url').selected, true);
    assert.match(s.node('app-share-status').textContent, /Selecciona y copia/);
    assert.equal(s.node('app-share-copy').disabled, false);
});
test('cancelled sharing closes quietly while unavailable sharing falls back to the URL', async () => {
    for (const name of ['AbortError', 'NotAllowedError']) {
        const s = setup({share: async () => { const error = Error(); error.name = name; throw error; }});
        await s.actions[0].events.click();
        assert.equal(s.node('app-share-dialog').open, name !== 'AbortError');
    }
});

test('footer share is available to guests without requiring a session',async()=>{
    const html=fs.readFileSync('index.html','utf8');
    const footer=html.match(/<nav id="bottom-navigation"[^]*?<\/nav>/)[0];
    assert.match(footer, /data-app-share/);
    const calls=[];const s=setup({share:async data=>calls.push(data)});
    await s.actions[2].events.click();
    assert.equal(calls[0].url,publicUrl);
});
