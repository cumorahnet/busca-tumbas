import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const html = fs.readFileSync('index.html', 'utf8');
function harness(failure, user = {uid: 'platform-admin', email: 'admin@example.test', emailVerified: true, getIdTokenResult: async () => ({claims:{platform_admin:true}})}) {
 const elements = new Map();
 const calls = [];
 const document = {getElementById(id) {
  if (!elements.has(id)) elements.set(id, {value: 'secret-password', type: 'password', disabled: false, attrs: {}, reportValidity: () => true, setAttribute(k,v) {this.attrs[k]=v;}, querySelector() {return {className: '', classList: {add(){},remove(){}}};}});
  return elements.get(id);
 }};
 const context = {document, authFlowInProgress: false, loadSuperuserConfig: async () => ({uid: 'platform-admin', email:'admin@example.test'}),
  firebase: {auth: {Auth: {Persistence: {NONE: 'NONE'}}}},
  auth: {async setPersistence(value) {calls.push(value); if (failure === 'persistence') throw Error('persistence');}, async signOut(){calls.push('signOut'); if(failure === 'signOut' && calls.includes('signIn')) throw Error('offline');}, async signInWithEmailAndPassword(){calls.push('signIn'); if(failure === 'password') throw Error('password'); return {user};}},
  async obtenerEstadisticasAdminFunction(){calls.push('server'); if(failure === 'server' || failure === 'signOut') throw Error('denied');},
  async showAdminPanel(){calls.push('panel');}, getFirebaseErrorMessage: e => e.message};
 vm.createContext(context);
 vm.runInContext('let platformAdminUid = null; let superuserLoginBusy = false;', context);
 for (const name of ['resetPasswordVisibility','handleSuperuserLogin','togglePasswordVisibility']) {
  vm.runInContext(html.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n}'))[0],context);
 }
 context.closeSuperuserLogin = () => calls.push('close');
 return {context, calls, document};
}
for (const failure of ['persistence', 'password', 'server', null]) test(`superuser flow: ${failure || 'success'}`, async () => {
 const {context, calls, document} = harness(failure);
 await context.handleSuperuserLogin({preventDefault(){}});
 assert.equal(document.getElementById('superuser-password').value, '');
 assert.equal(document.getElementById('superuser-password').type, 'password');
 assert.equal(document.getElementById('superuser-submit').disabled, false);
 assert.equal(calls.includes('panel'), !failure);
 if (failure === 'persistence') assert.deepEqual(calls, ['NONE']);
 if (failure === 'server') assert.equal(calls.at(-1), 'signOut');
 if (!failure) assert.deepEqual(calls, ['NONE','signOut','signIn','server','close','panel']);
});
test('unverified account is rejected before admin operations', async () => {
 const {context,calls} = harness(null, {uid:'platform-admin',email:'admin@example.test',emailVerified:false,getIdTokenResult:async()=>({claims:{platform_admin:true}})});
 await context.handleSuperuserLogin({preventDefault(){}});
 assert.equal(calls.includes('server'), false);
 assert.equal(calls.includes('panel'), false);
 assert.equal(calls.at(-1), 'signOut');
});
test('password visibility preserves value and exposes state', () => {
 const {context,document} = harness();
 const input = document.getElementById('superuser-password');
 const button = document.getElementById('superuser-password-toggle');
 context.togglePasswordVisibility('superuser-password',button);
 assert.equal(input.type,'text'); assert.equal(button.attrs['aria-pressed'],'true');
 assert.equal(input.value,'secret-password');
 context.togglePasswordVisibility('superuser-password',button);
 assert.equal(input.type,'password'); assert.equal(button.attrs['aria-pressed'],'false');
 assert.equal(input.value,'secret-password');
});

test('ordinary user with the same contact email has no global role', async () => {
 const {context,calls} = harness(null, {uid:'platform-admin',email:'admin@example.test',emailVerified:true,getIdTokenResult:async()=>({claims:{}})});
 await context.handleSuperuserLogin({preventDefault(){}});
 assert.equal(calls.includes('server'),false);
 assert.equal(calls.includes('panel'),false);
 assert.equal(calls.at(-1),'signOut');
});

test('failed sign-out still clears password and restores controls without opening panel', async () => {
 const {context,calls,document} = harness('signOut');
 await context.handleSuperuserLogin({preventDefault(){}});
 assert.equal(document.getElementById('superuser-password').value,'');
 assert.equal(document.getElementById('superuser-password').type,'password');
 assert.equal(document.getElementById('superuser-submit').disabled,false);
 assert.match(document.getElementById('superuser-feedback').textContent,/Recarga/);
 assert.equal(calls.includes('panel'),false);
});

test('parallel authentication cannot start a global login', async () => {
 const {context,calls} = harness();
 context.authFlowInProgress = true;
 await context.handleSuperuserLogin({preventDefault(){}});
 assert.deepEqual(calls,[]);
});

for(const claims of [{community_admin:true},{superuser:true},{platform_admin:'true'}]) {
 test('non-global claims are rejected: '+JSON.stringify(claims),async()=>{
  const {context,calls} = harness(null,{uid:'platform-admin',email:'admin@example.test',emailVerified:true,getIdTokenResult:async()=>({claims})});
  await context.handleSuperuserLogin({preventDefault(){}});
  assert.equal(calls.includes('server'),false);
  assert.equal(calls.includes('panel'),false);
  assert.equal(calls.at(-1),'signOut');
 });
}
