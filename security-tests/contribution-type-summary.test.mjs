import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('index.html','utf8');
const functions=['loadMyContributions','communityPlaceTypeLabel','escapeHtml','inlineJsValue'].map(name=>{
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
