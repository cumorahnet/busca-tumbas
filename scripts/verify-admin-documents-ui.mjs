import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const source = await fs.readFile('www/index.html', 'utf8');
const output = path.resolve('.browser-check');
await fs.mkdir(output, {recursive:true});
const names = ['escapeHtml','inlineJsValue','safeImageUrl','duplicateDisputeReason','deleteMyContribution','renderTombDetail','auditExistingDuplicatesAdmin','changeExistingDuplicateAudit','renderExistingDuplicateAudit','adminDocumentNeedsReview','adminDocumentContextHtml','renderAdminCatalog','clearAdminCatalogFilters','loadAdminStats','loadErrorReviewsAdmin','loadPendingCemeteriesAdmin'];
const functions = names.map(name => source.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n}'))[0]).join('\n');
const head = source.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const code = `
let adminDuplicateDisputes=[],adminContributionRecords=[],clicked='';
let existingDuplicateAudit=null,existingDuplicateAuditIndex=0;
let tombExtraCameraCapture=null;
const isSuperuserActive=()=>true;
let myContributions=[],currentDetailTomb={id:'record',nombre_finado:'Aporte de prueba',contributorId:'another-user'},currentCemeteryContribution=null,recordDetailZoomLevel=1,deleted=null;
const auth={currentUser:{uid:'admin'}};
const tombOwnerId=data=>data.contributorId;
const eliminarMiAportacionFunction=async data=>{deleted=data;return {data:{deleted:true}}};
function closeRecordDetail(){} function showToast(){} function recordDetailPhotoHtml(){return '<p>Foto de prueba</p>'} function detailDataHtml(){return '<p>Datos de prueba</p>'}
function tombHasLocation(tomb){return Number.isFinite(tomb?.geolocation?.latitude)&&Number.isFinite(tomb?.geolocation?.longitude)} function loadTombCommunityMedia(){}
window.confirm=()=>true;
const records=[
 {id:'reported',type:'tomb',person:'María López',cemetery:'Panteón Municipal',contributor:'Ana',status:'published'},
 {id:'duplicate',type:'tomb',person:'José Pérez',cemetery:'Panteón Municipal',contributor:'Luis',status:'published'},
 {id:'pending',type:'cemetery',person:'Aporte de lugar',cemetery:'Panteón del Norte',contributor:'Rosa',status:'pending'},
 {id:'normal',type:'tomb',person:'Pedro García',cemetery:'Panteón Municipal',contributor:'Ana',status:'published'}];
records.forEach((record,index)=>{record.timestamp='2026-10-'+String(10+index).padStart(2,'0')+'T12:00:00Z';record.state=index===3?'Puebla':'Jalisco';record.municipality=index===3?'Puebla':'Guadalajara'});
const cases=[{id:'tomb_reported',recordType:'tomb',recordId:'reported',name:'María López',count:3,notes:[{requesterName:'Luis',description:'La fecha de nacimiento no coincide con la fotografía',status:'open',messages:[]}]}];
const disputes=[{id:'case1',status:'pending',recordType:'tomb',similarity:85,reason:'Coinciden nombre y panteón, pero difiere la fecha de defunción.',matches:[{recordId:'duplicate'}]}];
const obtenerEstadisticasAdminFunction=async()=>({data:{records,contributors:[],totalRecords:3,totalCemeteryContributions:1,totalContributors:3}});
const auditPair={recordType:'tomb',similarity:97.62,nameSimilarity:95,sameImageHash:true,first:{id:'a',name:'Marce Muciño Ramírez',birth:'1962',death:'1982'},second:{id:'b',name:'Marce Mociño Ramírez',birth:'1962',death:'1982'},previousResolutions:[{decision:'distinct',note:'son personas distintas'}]};
const functionsApi={httpsCallable:name=>async()=>({data:name==='auditarDuplicadosAdmin'?{records:24,totalMatches:2,checkedAt:new Date().toISOString(),matches:[auditPair,{...auditPair,first:{id:'c',name:'Otro caso'}}]}:{cases}})};
const db={collection:name=>({where(){return this},get:async()=>({docs:name==='_duplicateDisputes'?disputes.map(item=>({id:item.id,data:()=>item})):[]})})};
function renderDuplicateDisputes(){} function adminRecordActionsHtml(){return ''}
function getFirebaseErrorMessage(error){return error.message}
function openCommunityCemeteryReview(id){clicked='approval:'+id}
function openAdminDocumentDispute(id){clicked='duplicate:'+id}
${functions}
(async()=>{
 const viewport=Number(new URLSearchParams(location.search).get('width'));
 document.body.style.width=viewport+'px';document.body.style.boxSizing='border-box';
 await loadAdminStats();
 await auditExistingDuplicatesAdmin();
 const auditPanel=document.getElementById('admin-existing-duplicates');
 if(auditPanel.querySelectorAll('article').length!==2||!auditPanel.textContent.includes('son personas distintas')||auditPanel.textContent.includes('Otro caso'))throw Error('Auditoría no muestra un solo par y su historial');
 changeExistingDuplicateAudit(1);
 if(!auditPanel.textContent.includes('Otro caso'))throw Error('Auditoría no navega al siguiente par');
 const table=document.getElementById('admin-review-documents');
 if(!table)throw Error('Faltan columnas administrativas');
 const rows=[...table.querySelectorAll('tbody tr')];
 if(rows.length!==3)throw Error('La lista de pendientes debe contener solo tres casos');
 const catalog=document.getElementById('admin-full-catalog');
 if(catalog.open)throw Error('El catálogo completo debe iniciar cerrado');
 if(document.querySelectorAll('#admin-catalog-documents tbody tr').length!==4)throw Error('El catálogo debe conservar los cuatro documentos');
 if(table.textContent.includes('Pedro García'))throw Error('Registro normal mezclado con pendientes');
 if(!rows[0].textContent.includes(cases[0].notes[0].description))throw Error('No muestra el reporte real');
 rows[0].querySelector('td:last-child button').click();
 rows[1].querySelector('td:last-child button').click();
 if(clicked!=='duplicate:case1')throw Error('No abre la disputa correspondiente');
 rows[2].querySelector('td:last-child button').click();
 if(clicked!=='approval:pending')throw Error('No abre aprobación');
 const catalogTable=document.getElementById('admin-catalog-documents');
 if(/Motivo y situación|Requiere decisión|Revisar reportes/.test(catalogTable.textContent))throw Error('Catálogo contiene motivos o acciones de revisión');
 if(!catalogTable.querySelector('tbody tr').textContent.includes('Pedro García'))throw Error('Orden reciente incorrecto');
 document.getElementById('admin-catalog-order').value='oldest';renderAdminCatalog();
 if(!catalogTable.querySelector('tbody tr').textContent.includes('María López'))throw Error('Orden antiguo incorrecto');
 for(const [key,value] of [['state','jalisco'],['municipality','guadalajara'],['contributor','ana'],['cemetery','municipal']])document.getElementById('admin-catalog-'+key).value=value;
 renderAdminCatalog();
 if(catalogTable.querySelectorAll('tbody tr').length!==1||!catalogTable.textContent.includes('María López'))throw Error('Filtros combinados incorrectos');
 document.getElementById('admin-catalog-state').value='No existe';renderAdminCatalog();
 if(!catalogTable.textContent.includes('No hay aportaciones'))throw Error('Falta estado sin resultados');
 clearAdminCatalogFilters();
 if(catalogTable.querySelectorAll('tbody tr').length!==4)throw Error('No limpia filtros');
 if(!rows[1].textContent.includes(disputes[0].reason))throw Error('Falta el motivo del duplicado');
 if(viewport<768) for(const row of rows) {
   const reason=row.children[5].getBoundingClientRect(),action=row.children[6].getBoundingClientRect();
   if(reason.right>viewport || action.right>viewport || action.top<reason.bottom-2)throw Error('Motivo o acción recortados en móvil');
 }
 table.scrollIntoView();
 const detail=document.createElement('div');detail.innerHTML='<h5 id="record-detail-title"></h5><div id="record-detail-content"></div>';document.body.appendChild(detail);
 renderTombDetail();
 const deleteButton=[...detail.querySelectorAll('button')].find(button=>button.textContent.includes('ELIMINAR APORTACIÓN'));
 if(!deleteButton)throw Error('Falta botón de eliminación en detalle administrativo');
 deleteButton.click();await new Promise(resolve=>setTimeout(resolve,0));
 if(deleted?.recordId!=='record'||deleted?.recordType!=='tomb')throw Error('El clic no llama a eliminación con lista personal vacía');
 if(!document.getElementById('admin-existing-duplicates').textContent.includes('Par 1 de 2'))throw Error('No actualiza auditoría después de eliminar');
 detail.remove();document.getElementById('admin-review-documents').scrollIntoView();
 document.body.dataset.browserCheck='passed';
})().catch(error=>{document.body.dataset.browserCheck='failed';document.body.dataset.browserError=error.message});`;
const file=path.join(output,'admin-documents.html');
await fs.writeFile(file,`<!doctype html><html lang="es"><head><base href="${pathToFileURL(path.resolve('www')).href}/">${head}</head><body style="display:block;padding:16px;background:#eef2f6"><main><h4>Documentos administrativos</h4><div id="admin-summary" class="row"></div><div id="admin-content"></div></main><script>${code}</script></body></html>`);
for(const [name,width,height] of [['desktop',1440,1200],['mobile',412,1500]]) {
 const args=['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars',`--user-data-dir=${path.join(output,'admin-profile-'+name)}`,`--window-size=${width},${height}`,'--virtual-time-budget=5000',`--screenshot=${path.join(output,'admin-'+name+'.png')}`,'--dump-dom',pathToFileURL(file).href+'?width='+width];
 const result=await new Promise((resolve,reject)=>{const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',args,{windowsHide:true});let stdout='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',()=>{});child.on('error',reject);child.on('close',code=>resolve({code,stdout}));});
 if(result.code!==0||!result.stdout.includes('data-browser-check="passed"'))throw Error(name+': '+(result.stdout.match(/data-browser-error="([^"]*)"/)?.[1]||result.code));
 console.log(name+': panel completo de www, motivos por documento y botones verificados con datos de prueba');
}
