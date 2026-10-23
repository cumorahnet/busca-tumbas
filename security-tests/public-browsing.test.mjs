import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync('index.html', 'utf8');
function setup(user = null) {
    const nodes = new Map();
    const get = id => {
        if (!nodes.has(id)) nodes.set(id, {style: {}, textContent: '', open:false, showModal() {this.open=true;}, close() {this.open=false;}, focus() { this.focused = true; }});
        return nodes.get(id);
    };
    const ctx = {window:{accountProfileComplete:true}, auth: {currentUser: user}, document: {getElementById: get}, closeRecordDetail() {}, setAuthMode() {}};
    vm.createContext(ctx);
    vm.runInContext(html.slice(html.indexOf('let pendingMemberAction = null;'), html.indexOf('async function loadRecentTombs()')), ctx);
    return {ctx, get};
}
test('guest actions request a session and preserve the action; cancel discards it', () => {
    const {ctx, get} = setup();
    let resumed = false;
    ctx.action = () => { resumed = true; };
    assert.equal(ctx.requireMember(ctx.action, 'Para descargar'), false);
    assert.equal(get('member-access-dialog').open, true);
    assert.notEqual(get('auth-screen').style.display, 'flex');
    ctx.continueMemberAccess();
    assert.equal(get('member-access-dialog').open, false);
    assert.equal(get('auth-screen').style.display, 'flex');
    assert.equal(get('auth-action-reason').textContent, 'Para descargar');
    vm.runInContext('pendingMemberAction()', ctx);
    assert.equal(resumed, true);
    ctx.continueBrowsing();
    assert.equal(get('auth-screen').style.display, 'none');
    assert.equal(vm.runInContext('pendingMemberAction', ctx), null);
});
test('declining registration keeps browsing and clears the pending action', () => {
    const {ctx, get} = setup();
    ctx.requireMember(() => {}, 'Para modificar');
    ctx.cancelMemberAccess();
    assert.equal(get('member-access-dialog').open, false);
    assert.notEqual(get('auth-screen').style.display, 'flex');
    assert.equal(vm.runInContext('pendingMemberAction', ctx), null);
});

test('only verified accounts pass the contribution/download gate', () => {
    assert.equal(setup({uid: 'a', emailVerified: false}).ctx.requireMember(() => {}, 'Verifica tu cuenta'), false);
    assert.equal(setup({uid: 'a', emailVerified: true}).ctx.requireMember(() => {}, ''), true);
});
test('public query adapter preserves filters and paginates sanitized results', async () => {
    const ctx = {window: {}};
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync('mobile/catalog.js', 'utf8'), ctx);
    const calls = [];
    const call = async data => {
        calls.push(data);
        return {data: data.after ? {docs: [{id: 'b', data: {nombre_finado: 'B', timestamp: {seconds: 123}}}], more: false} : {docs: [{id: 'a', data: {nombre_finado: 'A'}}], more: true, after: 'a'}};
    };
    const query = ctx.window.createPublicCatalogQuery(call, 'tumbas').where('estado_panteon', '==', 'Jalisco').orderBy('nombre_finado_lower').orderBy('timestamp', 'desc');
    const result = await query.get();
    assert.equal(result.size, 2);
    assert.equal(result.docs[1].data().nombre_finado, 'B');
    assert.equal(calls[1].after, 'a');
    assert.equal(calls[0].filters[0][0], 'estado_panteon');
    assert.equal(calls[0].orders.length, 2);
    assert.equal(calls[0].orders[0][0], 'nombre_finado_lower');
    assert.equal(calls[0].orders[1][0], 'timestamp');
    assert.equal(result.docs[1].data().timestamp.toMillis(), 123000);
});
