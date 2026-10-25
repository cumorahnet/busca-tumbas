import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync('index.html', 'utf8');
const names = ['checkCemeteryMatches', 'updateCommunityPlaceType'];
const source = names.map(name => html.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n}'))[0]).join('\n');
for (const type of ['church', 'hospital', 'convent', 'other', 'cemetery']) {
  test('compare and select '+type+' without requiring an unrelated catalogue', async () => {
    const elements = {};
    for(const id of ['cemetery-place-type','cemetery-other-type','cemetery-other-type-field','cemetery-name','cemetery-state','cemetery-municipality','cemetery-match-results','cemetery-confirm-distinct','cemetery-distinct-confirmation']) elements[id] = {value:'',style:{}};
    elements['cemetery-place-type'].value=type;
    elements['cemetery-name'].value='San José';
    elements['cemetery-state'].value='15';
    elements['cemetery-municipality'].value='001';
    let catalogueLoads=0;
    const context=vm.createContext({communityCemeteryLocationSource:null,communityCemeteryLocation:null,document:{getElementById:id=>elements[id]},auth:{currentUser:{uid:'test'}},
      loadCommunityPlaceCatalog(){},communityRegion:()=>({mexican:true,country:'Mexico',state:{value:'15'},municipality:{value:'001'}}),resetCemeteryMatchConfirmation(){},formatProperName:s=>s,currentCemeteryComparisonKey:()=>type,
      showToast(){},getFirebaseErrorMessage:()=> 'Error',escapeHtml:s=>s,
      loadCemeteryCatalog:async()=>{catalogueLoads++;throw Error('Catalogue unavailable');},
      db:{collection:()=>({where:()=>({get:async()=>({docs:[]})})})}});
    vm.runInContext(source,context);
    context.updateCommunityPlaceType();
    assert.equal(elements['cemetery-other-type-field'].hidden,type!=='other');
    assert.equal(elements['cemetery-other-type'].required,type==='other');
    assert.ok(elements['cemetery-name'].placeholder.includes('San José'));
    assert.equal(await context.checkCemeteryMatches(),type!=='cemetery');
    assert.equal(catalogueLoads,type==='cemetery'?1:0);
  });
}
