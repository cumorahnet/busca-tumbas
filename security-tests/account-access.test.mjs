import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync('index.html','utf8');
const source = name => html.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n}'))[0];
test('registration rejects every missing profile field before creating an authentication account',async()=>{
    for(const missing of ['phone','country','state','municipality']) {
        const nodes = new Map();const notices=[];let requests=0;
        const values={'auth-full-name':'Nombre Apellidos','auth-email':'name@example.com','auth-phone':'5512345678','auth-country':'México','auth-state':'Hidalgo','auth-municipality':'Ajacuba'};
        values['auth-'+missing]='';
        const ctx={authFlowInProgress:false,document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{value:values[id]||'',checkValidity:()=>true,focus(){}});return nodes.get(id);}},
            showToast:message=>notices.push(message),auth:{createUserWithEmailAndPassword:()=>{requests++;}}};
        vm.createContext(ctx);vm.runInContext(source('handleAuth'),ctx);
        await ctx.handleAuth(false,{});assert.equal(requests,0);assert.ok(notices.some(text=>text.includes('Completa todos')));
    }
});
test('incomplete verified users are directed to complete their profile before a member action',()=>{
    let shown=0;
    const ctx={auth:{currentUser:{uid:'member',emailVerified:true}},window:{accountProfileComplete:false},showAccount:()=>shown++,pendingMemberAction:null};
    vm.createContext(ctx);vm.runInContext(source('requireMember'),ctx);
    const action=()=>{};
    assert.equal(ctx.requireMember(action,'Test'),false);assert.equal(shown,1);assert.equal(ctx.pendingMemberAction,action);
    assert.equal(ctx.requireMember(action,'Test',true),true);
    ctx.window.accountProfileComplete=true;assert.equal(ctx.requireMember(action,'Test'),true);
});
test('exit signs out, clears access secrets and opens the login screen',async()=>{
    const nodes=new Map();let exited=0;
    const ctx={logoutRequested:false,pendingMemberAction:()=>{},window:{accountProfileComplete:true},
        auth:{currentUser:{uid:'member'},signOut:async()=>{exited++;ctx.auth.currentUser=null;}},
        document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{value:'secret',style:{},close(){},focus(){}});return nodes.get(id);}},
        resetPasswordVisibility:()=>{},setAuthMode:()=>{},showToast:()=>{}};
    vm.createContext(ctx);vm.runInContext(source('logout'),ctx);await ctx.logout();
    assert.equal(exited,1);assert.equal(ctx.auth.currentUser,null);assert.equal(ctx.pendingMemberAction,null);
    assert.equal(nodes.get('auth-password').value,'');assert.equal(nodes.get('superuser-password').value,'');
    assert.equal(nodes.get('auth-screen').style.display,'flex');assert.equal(ctx.window.accountProfileComplete,false);
});
