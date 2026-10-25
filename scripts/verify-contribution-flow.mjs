import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {chromium, webkit} from 'playwright';
const original = await fs.readFile('index.html','utf8');
const source = (await fs.readFile('www/index.html','utf8')).replace(/<script\b[^>]*>[^]*?<\/script>/gi,'');
const names = ['openMyCemeteryContribution','enableMyCemeteryEditing','saveMyCemeteryEdits','fillCemeteryEditGps','filterMyContributions','renderMyContributions','loadMyContributions','communityPlaceTypeLabel','inlineJsValue','showContributionOptions','selectAddCemeteryMode','resetCemeteryForm','updateCommunityCountry','communityRegion','loadCommunityPlaceCatalog','chooseCommunityCatalogPlace','updateCommunityPlaceType','resetCemeteryMatchConfirmation','loadCommunityMunicipalities','useInegiCemeteryMatch','currentCemeteryComparisonKey','formatProperName','normalizeSearchText','formatCoordinates','escapeHtml','previewCemeteryPhoto','captureCemeteryLocation','getGeolocationErrorMessage','readPhotoCoordinates','applyPhotoCoordinates','captureTombPhotoLocation','saveCommunityCemetery','checkCemeteryMatches','cemeteryNameSimilarity','cemeteryComparisonName','distanceInMeters'];
const functions = names.map(name => {const m=original.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n}'));assert.ok(m,name);return m[0];}).join('\n');
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(source);return;}const file=path.resolve('www','.'+url.pathname);if(!file.startsWith(path.resolve('www')+path.sep)){res.writeHead(403);res.end();return;}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try {
for(const [engine,type] of Object.entries({chromium,webkit})) {
 const browser=await type.launch(engine==='chromium'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{});
 try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
 await page.evaluate(()=>{
   window.savedFilterMarkup=document.getElementById('my-contribution-type-filter').outerHTML;
   const ids=['mode-selection-card','add-cemetery-section','add-tomb-section'];
   const nodes=ids.map(id=>document.getElementById(id));document.body.replaceChildren(...nodes);
   nodes[0].style.display='block';nodes[1].style.display='none';nodes[2].style.display='none';
   window.requireMember=()=>true;window.showToast=message=>{window.lastNotice=message;};
   window.showModeSelection=()=>{document.getElementById('mode-selection-card').style.display='block';document.getElementById('add-cemetery-section').style.display='none';};
   window.auth={currentUser:{uid:'test',emailVerified:true}};
   window.communityCemeteryMatches=[];window.communityCemeteryComparisonKey='';window.selectedInegiCommunityMatch=null;
   window.communityCemeteryPhotoFile=null;window.communityCemeteryPhotoSource=null;window.communityCemeteryLocation=null;window.communityCemeteryLocationSource=null;
   window.pendingCanvas=null;window.currentGeolocation=null;
   window.loadCommunityStates=async()=>{document.getElementById('cemetery-state').replaceChildren(new Option('Choose',''),new Option('Jalisco','14'));};
   window.listarUbicacionesINEGIFunction=async()=>({data:{locations:[{name:'Guadalajara',code:'039'}]}});
   window.loadCemeteryCatalog=async()=>[{id:'catalog-1',name:'Panteon Municipal',stateCode:'14',municipalityCode:'039',latitude:20,longitude:-103,colony:'Centro'}];
   window.db={collection:()=>({where:()=>({get:async()=>({docs:[]})})})};
   window.prepareCemeteryPhotoBlob=async()=>new Blob(['photo']);
   window.sha256Hex=async()=> 'a'.repeat(64);window.uploadBlobWithTimeout=async()=>{};window.withTimeout=async promise=>promise;
   window.storage={ref:()=>({getDownloadURL:async()=> 'https://example.com/photo.jpg'})};
   window.functionsApi={httpsCallable:()=>async request=>{window.savedRequest=request;return {data:{saved:true}};}};
   window.getFirebaseErrorMessage=e=>e.message;
 });
 // Add a few nodes normally outside the selected contribution cards.
 await page.evaluate(()=>{for(const id of ['account-section','search-tomb-section','admin-section','corrections-section','my-contributions-section','my-disputes-section','back-to-mode-selection']){const el=document.createElement('div');el.id=id;document.body.append(el);}});
 await page.addScriptTag({content:functions});
 await page.getByRole('button',{name:'Aportar',exact:false}).first().click();
 assert.equal(await page.locator('#contribution-options').isVisible(),true);
 assert.equal(await page.locator('#contribution-options button').count(),3);
 await page.getByRole('button',{name:'Panteon u otro lugar',exact:false}).count().then(async count=>{if(count)await page.getByRole('button',{name:'Panteon u otro lugar',exact:false}).click();else await page.locator('#contribution-options button').first().click();});
 await page.selectOption('#cemetery-place-type','cemetery');
 await page.selectOption('#cemetery-state','14');
 await page.selectOption('#cemetery-municipality','039');
 await page.waitForFunction(()=>!document.getElementById('community-catalog-select').disabled);
 await page.selectOption('#community-catalog-select','catalog-1');
 await page.waitForFunction(()=>document.getElementById('cemetery-name').value==='Panteon Municipal');
 assert.equal(await page.locator('#community-catalog-field').isVisible(),true);
 await page.selectOption('#cemetery-place-type','church');
 assert.equal(await page.locator('#community-catalog-field').isVisible(),false);
 await page.fill('#cemetery-country','Guatemala');await page.locator('#cemetery-country').dispatchEvent('change');
 assert.equal(await page.locator('#community-manual-region').isVisible(),true);
 await page.fill('#cemetery-state-manual','Guatemala');await page.fill('#cemetery-municipality-manual','Antigua');
 await page.fill('#cemetery-name','Iglesia San Jose');await page.fill('#cemetery-locality','Centro');
 await page.setInputFiles('#cemetery-photo-input',{name:'photo.png',mimeType:'image/png',buffer:await fs.readFile('assets/brand/logo.png')});
 await page.locator('#add-cemetery-section details').evaluate(el=>el.open=true);
 await page.fill('#place-photo-latitude','14.56');await page.fill('#place-photo-longitude','-90.73');
 await page.locator('#add-cemetery-section').getByRole('button',{name:'Usar estas coordenadas'}).click();
 await page.locator('#save-cemetery-btn').click();
 await page.waitForFunction(()=>window.savedRequest);
 const saved=await page.evaluate(()=>window.savedRequest.data);
 assert.equal(saved.country,'Guatemala');assert.equal(saved.placeType,'church');assert.equal(saved.state,'Guatemala');assert.equal(saved.municipality,'Antigua');assert.equal(saved.location.latitude,14.56);assert.equal(saved.inegiCemeteryId,undefined);
 // An existing church photo must be labelled by its saved type in the contribution list.
 await page.evaluate(() => {
   for (const id of ['my-contributions-list','my-contribution-detail','my-contribution-type-filter','my-contribution-filter-count']) {let el=document.createElement('div');if(id==='my-contribution-type-filter'){el.innerHTML=savedFilterMarkup;el=el.firstElementChild;}el.id=id;document.body.append(el);}
   window.myContributions=[];
   const existing={id:'church-photo',data:()=>({...savedRequest.data,name:'San Jose'})};
   db={collection:name=>({where:()=>({get:async()=>({docs:name==='cemeteries'?[existing]:[]})})})};
 });
 await page.evaluate(()=>loadMyContributions());
 assert.equal(await page.locator('#my-contributions-list strong').textContent(),'San Jose');
 assert.equal(await page.locator('#my-contributions-list .contribution-type-badge').textContent(),'Iglesia');
 assert.equal(await page.locator('#my-contributions-list .contribution-type-badge').isVisible(),true);
 assert.equal(await page.locator('#my-contributions-list .contribution-status .badge').isVisible(),true);
 assert.ok((await page.locator('#my-contributions-list .contribution-status').textContent()).includes('PENDIENTE'));
 await page.locator('#my-contributions-list').screenshot({path:'.browser-check/contribution-type-'+engine+'.png'});
 assert.ok(!(await page.locator('#my-contributions-list').textContent()).includes('Panteon: San Jose'));
 // Filter the actual list using its dropdown and check empty states and stale detail clearing.
 await page.evaluate(() => {
   myContributions=[{id:'t',type:'tomb',nombre_finado:'Tumba de Ana'},
     {id:'p',type:'cemetery',name:'Panteon Municipal',placeType:'cemetery'},
     {id:'i',type:'cemetery',name:'Iglesia San Jose',placeType:'church'}];
   renderMyContributions();
 });
 assert.equal(await page.locator('#my-contributions-list button').count(),3);
 for(const [type,id] of [['tomb','t'],['cemetery','p'],['church','i']]){
   await page.selectOption('#my-contribution-type-filter',type);
   assert.equal(await page.locator('#my-contributions-list button').count(),1);
   assert.equal(await page.locator('#my-contributions-list button').getAttribute('data-contribution-id'),id);
   assert.equal(await page.locator('#my-contribution-filter-count').textContent(),'1 de 3 aportaciones');
 }
 await page.evaluate(()=>{document.getElementById('my-contribution-detail').textContent='Old church detail';});
 await page.selectOption('#my-contribution-type-filter','hospital');
 assert.equal(await page.locator('#my-contributions-list button').count(),0);
 assert.ok(!(await page.locator('#my-contribution-detail').textContent()).includes('Old church detail'));
 await page.selectOption('#my-contribution-type-filter','all');
 assert.equal(await page.locator('#my-contributions-list button').count(),3);
 // A place detail displays GPS and lets its owner complete it manually or using GPS.
 await page.evaluate(() => {
   for(const id of ['record-detail-modal','record-detail-content','record-detail-title']) {const el=document.createElement('div');el.id=id;document.body.append(el);}
   document.getElementById('record-detail-modal').append(document.getElementById('record-detail-title'),document.getElementById('record-detail-content'));
   window.existingPlace={...savedRequest.data,contributorId:'test',status:'pending',location:{latitude:14.56,longitude:-90.73}};
   window.currentCemeteryContribution=null;window.recordDetailZoomLevel=1;
   window.isSuperuserActive=()=>false;window.adminRecordActionsHtml=()=>'';
   window.recordDetailPhotoHtml=()=>'<img alt="Place photo">';
   window.getGeolocation=async()=>({latitude:20,longitude:-103});
   db={collection:()=>({doc:id=>({get:async()=>({id,exists:true,data:()=>existingPlace})}),where:()=>({get:async()=>({docs:[]})})})};
   functionsApi={httpsCallable:()=>async request=>{existingPlace={...existingPlace,...request.data};window.savedEdit=request;return {data:{saved:true}};}};
 });
 await page.evaluate(()=>openMyCemeteryContribution('existing-place'));
 assert.ok((await page.locator('#record-detail-content').textContent()).includes('14.56'));
 await page.locator('[onclick="enableMyCemeteryEditing()"]').click();
 await page.getByRole('button',{name:'Obtener GPS actual',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('edit-place-latitude').value==='20');
 await page.fill('#edit-place-latitude','14.57');await page.fill('#edit-place-longitude','-90.74');
 await page.getByRole('button',{name:'GUARDAR CAMBIOS',exact:true}).click();
 await page.waitForFunction(()=>window.savedEdit);
 assert.equal(await page.evaluate(()=>savedEdit.data.location.latitude),14.57);
 await page.waitForFunction(()=>document.getElementById('record-detail-content').textContent.includes('14.57'));
 // A live camera image requests GPS; a later manual edit wins over an old callback.
 await page.evaluate(() => {
   window.gpsSuccess = null;
   Object.defineProperty(navigator, 'geolocation', {configurable:true, value:{getCurrentPosition(success){window.gpsSuccess=success;}}});
   communityCemeteryPhotoFile={};communityCemeteryPhotoSource='camera';communityCemeteryLocation=null;communityCemeteryLocationSource=null;
   captureCemeteryLocation();
   gpsSuccess({coords:{latitude:20,longitude:-103,accuracy:5}});
 });
 assert.equal(await page.evaluate(()=>communityCemeteryLocationSource),'device');
 assert.equal(await page.evaluate(()=>communityCemeteryLocation.latitude),20);
 await page.evaluate(() => {
   captureCemeteryLocation();
   document.getElementById('place-photo-latitude').value='14.56';document.getElementById('place-photo-longitude').value='-90.73';
   applyPhotoCoordinates('place');
   gpsSuccess({coords:{latitude:1,longitude:1,accuracy:5}});
 });
 assert.equal(await page.evaluate(()=>communityCemeteryLocation.latitude),14.56);
 // GPS failure and blank/invalid coordinates must not manufacture a location.
 await page.evaluate(()=>{document.getElementById('place-photo-latitude').value='';document.getElementById('place-photo-longitude').value='0';});
 assert.equal(await page.evaluate(()=>readPhotoCoordinates('place-photo')),null);
 await page.evaluate(()=>{pendingCanvas={};document.getElementById('tomb-photo-latitude').value='20';document.getElementById('tomb-photo-longitude').value='-103';applyPhotoCoordinates('tomb');});
 assert.equal(await page.evaluate(()=>currentGeolocation.latitude),20);
 await fs.mkdir('.browser-check',{recursive:true});
 console.log(engine+': menu, Mexico catalogue, church abroad, photo upload, manual coordinates and saved payload OK');
 } finally {await browser.close();}
}
} finally {await new Promise(r=>server.close(r));}
