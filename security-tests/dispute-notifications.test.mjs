import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync('index.html','utf8');
function setup(admin = true) {
    const nodes = new Map(); const notices = []; const listeners = [];
    const ctx = {duplicateDisputeUnsubscribe:null,myDuplicateDisputeUnsubscribe:null,
        correctionInboxItems:[],adminDuplicateDisputes:[],myDuplicateDisputes:[],activeAdminDisputeId:null,duplicateDisputeListenerGeneration:0,duplicateDisputeListenerKey:null,
        duplicateDisputeComparisons:new Map(), duplicateDisputeSelections:new Map(), duplicateDisputeResolutionNotes:new Map(),
        auth:{currentUser:{uid:'owner',emailVerified:true}},isSuperuserActive:()=>admin,
        document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',hidden:true,textContent:'',setAttribute(name,value){this[name]=value;}});return nodes.get(id);}},
        showToast:message=>notices.push(message),console,
        db:{collection:()=>({where:(field,_op,value)=>({onSnapshot:callback=>{
            const item={field,value,callback,stopped:false};listeners.push(item);return ()=>{item.stopped=true;};
        }})})}};
    vm.createContext(ctx);
    for (const name of ['escapeHtml','inlineJsValue','safeImageUrl','duplicateDisputeReason','updateMessagesCount','renderDisputeComparison','changeAdminDispute','renderDuplicateDisputes','selectDisputePublication','resolveSelectedDisputePublication','startDuplicateDisputeNotifications']) {
        const source=html.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n}'));
        assert.ok(source,name);vm.runInContext(source[0],ctx);
    }
    const snapshot=items=>({docs:items.map(item=>({id:item.id,data:()=>item}))});
    return {ctx,nodes,notices,listeners,snapshot};
}
const dispute = {id:'a'.repeat(64),status:'pending',similarity:75,recordType:'tomb',candidate:{nombre_finado:'<script>alert(1)</script>'},matches:[],messages:[]};

test('administration renders one case and navigates while keeping the selected case',()=>{
    const s=setup();
    s.ctx.adminDuplicateDisputes=[{...dispute,candidate:{nombre_finado:'Primer caso'}},{...dispute,id:'b'.repeat(64),candidate:{nombre_finado:'Segundo caso'}}];
    s.ctx.renderDuplicateDisputes();
    let html=s.nodes.get('admin-duplicate-disputes').innerHTML;
    assert.equal((html.match(/<article /g)||[]).length,1);
    assert.match(html,/Primer caso/);assert.doesNotMatch(html,/Segundo caso/);
    s.ctx.changeAdminDispute(1);
    html=s.nodes.get('admin-duplicate-disputes').innerHTML;
    assert.match(html,/Caso 2 de 2/);assert.match(html,/Segundo caso/);assert.doesNotMatch(html,/Primer caso/);
    s.ctx.renderDuplicateDisputes();assert.match(s.nodes.get('admin-duplicate-disputes').innerHTML,/Segundo caso/);
    s.ctx.adminDuplicateDisputes=[s.ctx.adminDuplicateDisputes[0]];
    s.ctx.renderDuplicateDisputes();assert.match(s.nodes.get('admin-duplicate-disputes').innerHTML,/Caso 1 de 1/);
});

test('admin receives durable pending-case notification and sees an escaped comparison card',()=>{
    const s=setup();s.ctx.startDuplicateDisputeNotifications();
    s.listeners.find(item=>item.field==='status').callback(s.snapshot([dispute]));
    assert.ok(s.notices.some(text=>text.includes('1 disputa')));
    assert.equal(s.nodes.get('duplicate-dispute-alert').hidden,false);
    assert.match(s.nodes.get('admin-duplicate-disputes').innerHTML,/Comparar ambas publicaciones/);
    assert.match(s.nodes.get('admin-duplicate-disputes').innerHTML,/¿Por qué está aquí\?/);
    assert.match(s.nodes.get('admin-duplicate-disputes').innerHTML,/Qué debes decidir/);
    assert.ok(!s.nodes.get('admin-duplicate-disputes').innerHTML.includes('<script>alert'));
    assert.match(s.nodes.get('admin-duplicate-disputes').innerHTML,/&lt;script&gt;/);
    s.listeners.find(item=>item.field==='status').callback(s.snapshot([]));
    assert.equal(s.nodes.get('duplicate-dispute-alert').hidden,true);
});

test('comparison displays both complete publications, visual selection and mandatory decision reason',async()=>{
    const s=setup();
    const caseData={...dispute,candidate:{nombre_finado:'Nueva persona',imageUrl:'https://example.com/new.jpg',fecha_nacimiento:'1910'}};
    s.ctx.adminDuplicateDisputes=[caseData];
    s.ctx.duplicateDisputeComparisons.set(dispute.id,{matches:[{recordId:'existing',score:0.75,
        publication:{nombre_finado:'Persona existente',imageUrl:'https://example.com/old.jpg',fecha_nacimiento:'1911'},
        revision:{seconds:1,nanoseconds:2},currentComparison:{score:0.75,fields:[]}}]});
    s.ctx.renderDuplicateDisputes();
    let rendered=s.nodes.get('admin-duplicate-disputes').innerHTML;
    for (const text of ['Publicación existente','Nueva propuesta','Persona existente','Nueva persona','1910','1911','conservar existente','sustituir existente','Son registros distintos']) assert.ok(rendered.includes(text),text);
    const calls=[];s.ctx.functionsApi={httpsCallable:()=>async data=>{calls.push(data);return {data:{ok:true}};}};
    s.ctx.getFirebaseErrorMessage=error=>error.message;s.ctx.loadAdminStats=async()=>{};
    await s.ctx.resolveSelectedDisputePublication(dispute.id);
    assert.equal(calls.length,0);
    s.ctx.selectDisputePublication(dispute.id,'existing','candidate');
    rendered=s.nodes.get('admin-duplicate-disputes').innerHTML;
    assert.match(rendered,/border-primary border-3/);
    await s.ctx.resolveSelectedDisputePublication(dispute.id);
    assert.equal(calls.length,0);
    s.ctx.duplicateDisputeResolutionNotes.set(dispute.id,'La foto nueva es la correcta');
    await s.ctx.resolveSelectedDisputePublication(dispute.id);
    assert.equal(calls[0].decision,'replace');
    assert.equal(calls[0].matchedRecordId,'existing');
    assert.equal(calls[0].matchedRevision.nanoseconds,2);
    assert.equal(calls[0].note,'La foto nueva es la correcta');
});

test('owner receives resolution and stale listeners cannot show data after sign-out',()=>{
    const s=setup(false);s.ctx.startDuplicateDisputeNotifications();
    assert.equal(s.listeners.length,1);
    const listener=s.listeners[0];listener.callback(s.snapshot([dispute]));
    listener.callback(s.snapshot([{...dispute,status:'approved',resolution:'Documentos verificados'}]));
    assert.ok(s.notices.some(text=>text.includes('se autorizó')));
    assert.doesNotMatch(s.nodes.get('my-duplicate-disputes').innerHTML,/<article|Documentos verificados/);
    assert.match(s.nodes.get('my-duplicate-disputes').innerHTML,/No tienes disputas pendientes/);
    assert.equal(s.nodes.get('my-disputes-menu-count').hidden,true);
    s.ctx.auth.currentUser=null;s.ctx.startDuplicateDisputeNotifications();
    assert.equal(listener.stopped,true);
    listener.callback(s.snapshot([dispute]));
    assert.equal(s.nodes.get('my-duplicate-disputes').innerHTML,'');
});

for (const status of ['approved', 'rejected']) {
    test('resolved '+status+' disputes disappear and the menu notification counts only pending cases',()=>{
        const s=setup(false); s.ctx.startDuplicateDisputeNotifications();
        const listener=s.listeners[0];
        const other={...dispute,id:'b'.repeat(64),candidate:{nombre_finado:'Otra propuesta'}};
        listener.callback(s.snapshot([dispute,other]));
        for (const id of ['my-disputes-menu-count','my-disputes-submenu-count']) {
            assert.equal(s.nodes.get(id).textContent,'2');
            assert.equal(s.nodes.get(id).hidden,false);
        }
        listener.callback(s.snapshot([{...dispute,status},other]));
        assert.equal((s.nodes.get('my-duplicate-disputes').innerHTML.match(/<article /g)||[]).length,1);
        assert.match(s.nodes.get('my-duplicate-disputes').innerHTML,/Otra propuesta/);
        assert.equal(s.nodes.get('my-disputes-menu-count').textContent,'1');
        listener.callback(s.snapshot([{...dispute,status},{...other,status}]));
        assert.doesNotMatch(s.nodes.get('my-duplicate-disputes').innerHTML,/<article /);
        assert.equal(s.nodes.get('my-disputes-menu-count').hidden,true);
    });
}

test('repeated session indicators reuse listeners and privilege changes replace them',()=>{
 const s=setup(false);s.ctx.startDuplicateDisputeNotifications();
 s.listeners[0].callback(s.snapshot([dispute]));
 s.ctx.startDuplicateDisputeNotifications();
 assert.equal(s.listeners.length,1);assert.equal(s.listeners[0].stopped,false);
 assert.equal(s.ctx.myDuplicateDisputes.length,1);
 s.ctx.isSuperuserActive=()=>true;s.ctx.startDuplicateDisputeNotifications();
 assert.equal(s.listeners[0].stopped,true);assert.equal(s.listeners.length,3);
 s.ctx.auth.currentUser=null;s.ctx.startDuplicateDisputeNotifications();
 assert.ok(s.listeners.every(item=>item.stopped));
});
