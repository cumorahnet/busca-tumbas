import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
const source = fs.readFileSync('mobile/app.js','utf8');
function setup(native = true) {
    const handlers = {}, events = {}, calls = [], visible = new Set();
    const app = { addListener: async (name, fn) => { handlers[name] = fn; }, minimizeApp: async () => calls.push('minimize') };
    const context = {
        window: { Capacitor: { isNativePlatform: () => native, registerPlugin: () => app }, addEventListener: (name,fn) => events[name]=fn, confirm: () => false },
        navigator: { onLine: false }, console,
        document: { documentElement: { classList: { toggle() {} } }, createElement: () => ({setAttribute(){}}),
            body: { append: element => { context.status=element; } },
            getElementById: id => ({ getClientRects: () => visible.has(id) ? [1] : [] }) },
        closeImageZoom: () => calls.push('zoom'), closeScanner: () => calls.push('camera'),
        closeRecordDetail: () => calls.push('detail'), showModeSelection: () => calls.push('menu'),
        setAuthMode: () => calls.push('login')
    };
    vm.runInNewContext(source,context);
    return {handlers,events,calls,visible,context};
}
test('web does not register native events',()=>assert.deepEqual(Object.keys(setup(false).handlers),[]));
test('Back closes the topmost overlay before navigating',async()=>{
    const s=setup(); s.visible.add('image-zoom-modal'); s.visible.add('record-detail-modal');
    await s.handlers.backButton(); assert.deepEqual(s.calls,['zoom']);
});
test('Back preserves an unconfirmed capture',async()=>{
    const s=setup(); s.visible.add('back-to-mode-selection'); s.visible.add('add-tomb-section');
    await s.handlers.backButton(); assert.deepEqual(s.calls,[]);
    s.context.window.confirm=()=>true;
    await s.handlers.backButton(); assert.deepEqual(s.calls,['camera','menu']);
});
test('Back returns from registration and minimizes only at root',async()=>{
    const s=setup(); s.visible.add('auth-name-wrapper'); await s.handlers.backButton();
    s.visible.clear(); await s.handlers.backButton(); assert.deepEqual(s.calls,['login','minimize']);
});
test('Background releases camera and reconnect clears offline notice',()=>{
    const s=setup(); s.visible.add('ia-modal'); s.handlers.appStateChange({isActive:false});
    assert.deepEqual(s.calls,['camera']); assert.equal(s.context.status.hidden,false);
    s.context.navigator.onLine=true; s.events.online(); assert.equal(s.context.status.hidden,true);
});
test('Android packages scripts, CSS, legal pages and fonts locally',()=>{
    const html=fs.readFileSync('www/index.html','utf8');
    for(const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)){
        assert.ok(!match[1].startsWith('https://'), match[1]);
        assert.ok(fs.existsSync(path.join('www',match[1])),match[1]);
    }
    for(const file of fs.readdirSync('www/vendor').filter(p=>p.endsWith('.css'))){
        const css=fs.readFileSync(path.join('www/vendor',file),'utf8');
        for(const match of css.matchAll(/url\(["']?([^)"']+)["']?\)/g)){
            if(match[1].startsWith('data:'))continue;
            assert.ok(fs.existsSync(path.join('www/vendor',match[1].split('#')[0])),match[1]);
        }
    }
    assert.ok(fs.existsSync('www/privacy.html')); assert.ok(fs.existsSync('www/delete-account.html'));
    for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
});
