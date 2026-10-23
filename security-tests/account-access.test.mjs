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
test('incomplete verified users get a notice without automatically opening Account',()=>{
    let shown=0;const notices=[];
    const ctx={auth:{currentUser:{uid:'member',emailVerified:true}},window:{accountProfileComplete:false},showAccount:()=>shown++,showToast:message=>notices.push(message),pendingMemberAction:null};
    vm.createContext(ctx);vm.runInContext(source('requireMember'),ctx);
    const action=()=>{};
    assert.equal(ctx.requireMember(action,'Test'),false);assert.equal(shown,0);assert.match(notices[0],/Cuenta/);assert.equal(ctx.pendingMemberAction,action);
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

 test('existing accounts enter the app without automatically opening profile data',async()=>{
    const handler=html.match(/    async function handleAuthenticatedState\(user\) {[^]*?\r?\n    }\r?\n};/)[0].replace(/\r?\n};$/,'');
    for(const complete of [true,false]) {
        const nodes=new Map();let opened=0,home=0;
        const user={uid:'member',emailVerified:true,email:'member@example.com',getIdTokenResult:async()=>({claims:{}})};
        const ctx={auth:{currentUser:user},window:{accountProfileComplete:complete},
            document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{style:{},close(){}});return nodes.get(id);}},
            refreshAccountIdentity:async()=>{},showAccount:async()=>opened++,showModeSelection:()=>home++,
            correctionInboxItems:[],updateMessagesCount(){},familySearchPreparation:null,tombSocialShare:null,platformAdminUid:null,
            updateSuperuserIndicator(){},moderationUnsubscribe:null,logoutRequested:false,
            escapeHtml:s=>s,startCorrectionNotifications(){},pendingMemberAction:null,
            db:{collection:()=>({doc:()=>({onSnapshot:()=>()=>{}})})}};
        vm.createContext(ctx);vm.runInContext(handler,ctx);await ctx.handleAuthenticatedState(user);
        assert.equal(opened,0);assert.equal(home,1);
        assert.equal(nodes.get('auth-screen').style.display,'none');
        assert.equal(nodes.get('main-app').style.display,'flex');
    }
});
