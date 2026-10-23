import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {buildDraft,createController}=createRequire(import.meta.url)('../mobile/tomb-share.js');
const tomb={id:'record',nombre_finado:'María Pérez',fecha_nacimiento:'1920-01-02',fecha_defuncion:'2000-03-04',nombre_panteon:'Panteón Central',municipio_panteon:'Ajacuba',email:'private@example.com'};
function setup({shareable=true,response,shareError}={}) {
    const nodes=new Map(),shares=[],copies=[],revoked=[],downloads=[];
    let user={uid:'member',emailVerified:true};
    const node=id=>{
        if(!nodes.has(id))nodes.set(id,{events:{},open:false,addEventListener(k,fn){this.events[k]=fn;},showModal(){this.open=true;},close(){this.open=false;},removeAttribute(k){delete this[k];},focus(){},select(){this.selected=true;},append(link){downloads.push(link);}});
        return nodes.get(id);
    };
    const controller=createController({
        document:{getElementById:id=>node(id.replace('tomb-share-','')),createElement:()=>({click(){this.clicked=true;},remove(){}})},
        navigator:{canShare:()=>shareable,share:async data=>{if(shareError)throw shareError;shares.push(data);},clipboard:{writeText:async text=>copies.push(text)}},
        URL:{createObjectURL:()=> 'blob:photo',revokeObjectURL:url=>revoked.push(url)},File,
        fetchPhoto:response||(async()=>({ok:true,blob:async()=>new Blob(['photo bytes'],{type:'image/jpeg'})})),getCurrentUser:()=>user
    });
    return {controller,node,shares,copies,revoked,downloads,setUser:value=>user=value};
}
test('description includes public identity, dates and burial place, with no account details',()=>{
    const draft=buildDraft(tomb);assert.match(draft.text,/María Pérez\nNacimiento:/);assert.match(draft.text,/Defunción:/);assert.match(draft.text,/Panteón Central/);assert.ok(!draft.text.includes(tomb.email));
});
test('prepares actual photo and shares it with the reviewed description only after another click',async()=>{
    const s=setup();await s.controller.open(tomb);assert.equal(s.shares.length,0);assert.equal(s.node('send').hidden,false);
    s.node('description').value='Descripción revisada';await s.node('send').events.click();
    assert.equal(s.shares[0].text,'Descripción revisada');assert.equal(s.shares[0].files[0].name,'lapida-record.jpg');assert.equal(await s.shares[0].files[0].text(),'photo bytes');
    s.controller.close();assert.deepEqual(s.revoked,['blob:photo']);
});
test('unsupported file sharing offers photo download and description copy',async()=>{
    const s=setup({shareable:false});await s.controller.open(tomb);assert.equal(s.node('send').hidden,true);assert.equal(s.node('download').disabled,false);
    await s.node('copy').events.click();assert.match(s.copies[0],/María Pérez/);
    s.node('download').events.click();assert.equal(s.downloads[0].href,'blob:photo');assert.equal(s.downloads[0].clicked,true);
});
test('invalid photo never enables sharing or downloading',async()=>{
    const s=setup({response:async()=>({ok:true,blob:async()=>new Blob(['html'],{type:'text/html'})})});await s.controller.open(tomb);
    assert.equal(s.node('send').disabled,true);assert.equal(s.node('download').disabled,true);assert.match(s.node('status').textContent,/No se pudo/);
});
test('account changes prevent sending a prepared photo; guests cannot prepare one',async()=>{
    const s=setup();await s.controller.open(tomb);s.setUser(null);await s.node('send').events.click();assert.equal(s.shares.length,0);assert.equal(s.node('dialog').open,false);
    await assert.rejects(s.controller.open(tomb),/Inicia sesión/);
});
test('cancelling sharing leaves the prepared photo available without reporting an error',async()=>{
    const s=setup({shareError:Object.assign(Error(),{name:'AbortError'})});await s.controller.open(tomb);const status=s.node('status').textContent;
    await s.node('send').events.click();assert.equal(s.node('status').textContent,status);assert.equal(s.node('send').disabled,false);
});
