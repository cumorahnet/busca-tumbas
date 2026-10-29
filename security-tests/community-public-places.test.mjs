import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('index.html','utf8');
const names=['loadApprovedCommunityCatalog','loadCommunityPlaceCatalog','chooseCommunityCatalogPlace'];
const source=names.map(n=>html.match(new RegExp('(?:async )?function '+n+'\\([^]*?\\n}'))[0]).join('\n');
for(const type of ['church','hospital','convent','other']) test(`manual catalogue loads and selects approved ${type} without INEGI`,async()=>{
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:true,replaceChildren(...o){this.options=o;},add(o){this.options.push(o);}});return nodes.get(id);};
 get('cemetery-place-type').value=type;get('community-catalog-select').value='approved';
 const region={mexican:true,country:'México',state:{value:'14'},municipality:{value:'039'}};
 const base={placeType:type,status:'approved',country:'México',stateCode:'14',municipalityCode:'039',name:'Lugar público',locality:'Centro',location:{latitude:20,longitude:-103}};
 const docs=[['approved',base],['pending',{...base,status:'pending'}],['elsewhere',{...base,municipalityCode:'001'}],['foreign',{...base,country:'España'}],['wrongType',{...base,placeType:'cemetery'}]].map(([id,data])=>({id,data:()=>data}));
 const ctx=vm.createContext({document:{getElementById:get},Option:function(text,value){this.text=text;this.value=value;},communityRegion:()=>region,normalizeSearchText:s=>s.toLowerCase(),resetCemeteryMatchConfirmation(){},loadCemeteryCatalog(){throw Error('Unexpected INEGI');},db:{collection:()=>({where:()=>({get:async()=>({docs})})})},formatProperName:s=>s,formatCoordinates:()=> '20,-103',communityCemeteryLocationSource:null});
 vm.runInContext(source,ctx);await ctx.loadCommunityPlaceCatalog();
 assert.equal(get('community-catalog-field').hidden,false);assert.deepEqual(get('community-catalog-select').options.map(o=>o.value),['','approved']);
 await ctx.chooseCommunityCatalogPlace('approved');assert.equal(get('cemetery-name').value,base.name);assert.equal(get('cemetery-locality').value,'Centro');assert.equal(ctx.communityCemeteryLocation.latitude,20);
});
