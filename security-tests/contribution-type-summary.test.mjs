import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('index.html','utf8');
const functions=['filterMyContributions','renderMyContributions','loadMyContributions','communityPlaceTypeLabel','escapeHtml','inlineJsValue'].map(name=>{
 const match=source.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n}'));assert.ok(match,name);return match[0];
}).join('\n');
for(const [placeType,label,otherPlaceType] of [['tomb','Tumba'],['church','Iglesia'],['hospital','Hospital'],['convent','Convento'],['other','Otro: Capilla','Capilla'],['cemetery','Panteón'],[undefined,'Panteón']]) {
 test('existing '+(placeType||'legacy cemetery')+' contribution summary uses its saved type',async()=>{
  const nodes={};const get=id=>nodes[id]??={innerHTML:'',textContent:'',classList:{add(){},remove(){}}};
  const item={id:'existing-place',data:()=>({nombre_finado:'San José <img src=x>',name:'San José <img src=x>',placeType,otherPlaceType,status:'pending'})};
  const context=vm.createContext({auth:{currentUser:{uid:'owner'}},document:{getElementById:get},window:{matchMedia:()=>({matches:true})},
    db:{collection:name=>({where:()=>({get:async()=>({docs:(placeType==='tomb'?name==='tumbas':name==='cemeteries')?[item]:[]})})})},
    getFirebaseErrorMessage:e=>e.message,myContributions:[]});
  vm.runInContext(functions,context);
  await context.loadMyContributions();
  const rendered=get('my-contributions-list').innerHTML;
  assert.ok(rendered.includes('<strong>San José &lt;img src=x&gt;</strong>'),rendered);
  assert.ok(rendered.includes('contribution-type-badge\">'+label+'</span>'),rendered);
  assert.equal(rendered.includes('contribution-status'),placeType!=='tomb');
  assert.equal(rendered.includes('PENDIENTE'),placeType!=='tomb');
  assert.ok(!rendered.includes(label+': San José'));
  if(placeType && placeType!=='cemetery')assert.ok(!rendered.includes('Panteón:'));
  assert.equal(context.myContributions[0].placeType,placeType);
 });
}

test('filters each saved type, preserves legacy cemeteries and never mutates the full list',()=>{
 const records=[{id:'t',type:'tomb',placeType:'church'},{id:'p',type:'cemetery',placeType:'cemetery'},
 {id:'legacy',type:'cemetery'},{id:'i',type:'cemetery',placeType:'church'},
 {id:'h',type:'cemetery',placeType:'hospital'},{id:'c',type:'cemetery',placeType:'convent'},
 {id:'o',type:'cemetery',placeType:'other',otherPlaceType:'Capilla'}];
 const ctx=vm.createContext({myContributions:records});vm.runInContext(functions,ctx);
 for(const [type,ids] of [['all',['t','p','legacy','i','h','c','o']],['tomb',['t']],['cemetery',['p','legacy']],['church',['i']],['hospital',['h']],['convent',['c']],['other',['o']],['unknown',[]]]) {
   assert.deepEqual(Array.from(ctx.filterMyContributions(type),item=>item.id),ids);
 }
 assert.equal(records.length,7);
});
