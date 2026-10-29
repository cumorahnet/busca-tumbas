import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('index.html','utf8');
function setup() {
    const nodes=new Map(), calls=[], notices=[];
    const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,style:{},dataset:{},textContent:'Button',focus(){calls.push('focus:'+id)},checkValidity(){return true},querySelector(){return null}});return nodes.get(id)};
    node('auth-full-name').value='Ana Perez';node('auth-email').value='ana@example.com';node('auth-password').value='example-password';
    for(const [id,value] of Object.entries({'auth-phone':'5512345678','auth-country':'Mexico','auth-state':'Hidalgo','auth-municipality':'Ajacuba'})) node(id).value=value;
    const user={emailVerified:true,updateProfile:async()=>calls.push('profile')};
    const ctx={localStorage:{setItem(){}},document:{getElementById:node},console,authFlowInProgress:false,
        auth:{currentUser:null,createUserWithEmailAndPassword:async()=>{calls.push('create');return {user}},signInWithEmailAndPassword:async()=>{calls.push('login');return {user}},signOut:async()=>{}},
        showToast:text=>notices.push(text),resetPasswordVisibility(){},updateVerificationPendingUI(){},
        setVerificationPending(){},sendAccountVerification:async()=>{},showVerificationRequestAccepted(){},
        getVerificationPendingEmail:()=>'',clearVerificationPending(){},getFirebaseErrorMessage:()=>{throw Error('Unexpected auth failure')}};
    vm.createContext(ctx);
    for(const name of ['setAuthMode','handleAuth'])vm.runInContext(html.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n}'))[0],ctx);
    return {ctx,node,calls,notices,event:{currentTarget:node('register-btn')}};
}
test('registration requires explicit acceptance before any account is created',async()=>{
    const s=setup();await s.ctx.handleAuth(false,s.event);
    assert.ok(!s.calls.includes('create'));assert.ok(s.calls.includes('focus:auth-terms-accepted'));assert.match(s.notices[0],/acepta/);
    s.node('auth-terms-accepted').checked=true;await s.ctx.handleAuth(false,s.event);
    assert.equal(s.calls.filter(x=>x==='create').length,1);assert.ok(s.calls.includes('profile'));
});
test('login remains available without checking registration terms',async()=>{
    const s=setup();await s.ctx.handleAuth(true,s.event);assert.ok(s.calls.includes('login'));assert.ok(!s.calls.includes('create'));
});
test('switching auth modes clears acceptance and only shows it for registration',()=>{
    const s=setup();s.node('auth-terms-accepted').checked=true;s.ctx.setAuthMode('register');
    assert.equal(s.node('auth-terms-accepted').checked,false);assert.equal(s.node('auth-terms-wrapper').style.display,'block');
    s.ctx.setAuthMode('login');assert.equal(s.node('auth-terms-wrapper').style.display,'none');
});
