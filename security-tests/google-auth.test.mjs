import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('index.html','utf8');
function setup({native=false}={}) {
    const nodes=new Map(),calls=[],notices=[];
    const node=id=>{if(!nodes.has(id))nodes.set(id,{checked:false,disabled:false,value:'password',innerHTML:'Google',style:{display:'none'},focus(){calls.push('focus')}});return nodes.get(id)};
    const user={emailVerified:true};
    const provider=function(){this.setCustomParameters=p=>calls.push(p.prompt)};
    provider.credential=token=>({idToken:token});
    const ctx={document:{getElementById:node},window:{Capacitor:{isNativePlatform:()=>native,registerPlugin:name=>({signInWithGoogle:async options=>{calls.push({name,options});return {credential:{idToken:'native-test-token'}}}})}},
        firebase:{auth:{GoogleAuthProvider:provider}},authFlowInProgress:false,
        auth:{signInWithPopup:async()=>{calls.push('popup');return {user,additionalUserInfo:{isNewUser:true}}},signInWithCredential:async c=>{calls.push(c);return {user}},signOut:async()=>calls.push('signOut')},
        clearVerificationPending:()=>calls.push('clearPending'),showToast:t=>notices.push(t),setAuthMode:()=>calls.push('registerMode')};
    vm.createContext(ctx);
    vm.runInContext('async function handleGoogleAuth' + html.split('async function handleGoogleAuth')[1].split('async function handleAuth')[0],ctx);
    return {ctx,node,calls,notices,user};
}
test('Google requires acceptance before contacting either provider',async()=>{
    for(const native of [false,true]){const s=setup({native});await s.ctx.handleGoogleAuth();assert.deepEqual(s.calls,['registerMode','focus']);assert.match(s.notices[0],/acepta/);}
});
test('web creates a Google session without requiring name or password',async()=>{
    const s=setup();s.node('auth-terms-accepted').checked=true;await s.ctx.handleGoogleAuth();
    assert.ok(s.calls.includes('popup'));assert.ok(s.calls.includes('select_account'));assert.ok(s.calls.includes('clearPending'));assert.match(s.notices[0],/Cuenta creada/);assert.equal(s.node('auth-password').value,'');assert.equal(s.ctx.authFlowInProgress,false);
});
test('Android exchanges the native Google token for the existing web session',async()=>{
    const s=setup({native:true});s.node('auth-terms-accepted').checked=true;await s.ctx.handleGoogleAuth();
    assert.equal(s.calls[0].name,'FirebaseAuthentication');assert.equal(s.calls[0].options.skipNativeAuth,true);assert.equal(s.calls[1].idToken,'native-test-token');assert.ok(!s.calls.includes('popup'));
});
test('unverified Google identities are signed out',async()=>{
    const s=setup();s.node('auth-terms-accepted').checked=true;s.user.emailVerified=false;await s.ctx.handleGoogleAuth();assert.ok(s.calls.includes('signOut'));assert.ok(!s.calls.includes('clearPending'));
});
test('cancellation restores controls without displaying an error',async()=>{
    const s=setup();s.node('auth-terms-accepted').checked=true;s.ctx.auth.signInWithPopup=async()=>{throw {code:'auth/popup-closed-by-user'}};await s.ctx.handleGoogleAuth();assert.equal(s.notices.length,0);assert.equal(s.node('google-auth-btn').disabled,false);assert.equal(s.ctx.authFlowInProgress,false);
});
test('blocked popups explain recovery and allow retry',async()=>{
    const s=setup();s.node('auth-terms-accepted').checked=true;s.ctx.auth.signInWithPopup=async()=>{throw {code:'auth/popup-blocked'}};await s.ctx.handleGoogleAuth();assert.match(s.notices[0],/ventanas emergentes/);assert.equal(s.node('login-btn').disabled,false);
});
test('a second click cannot start a concurrent session',async()=>{
    const s=setup();s.node('auth-terms-accepted').checked=true;s.ctx.authFlowInProgress=true;await s.ctx.handleGoogleAuth();assert.equal(s.calls.length,0);
});
