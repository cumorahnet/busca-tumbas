import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const source = await fs.readFile('index.html','utf8');
const output = path.resolve('.browser-check');
await fs.mkdir(output,{recursive:true});
const names = ['escapeHtml','inlineJsValue','safeImageUrl','duplicateDisputeReason','renderDisputeComparison',
  'renderDuplicateDisputes','changeAdminDispute','selectDisputePublication','resolveSelectedDisputePublication'];
const functions = names.map(name => source.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n}'))?.[0]).join('\n');
const head = source.match(/<head>([\s\S]*?)<\/head>/i)[1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const fixture = `
const duplicateDisputeComparisons=new Map(),duplicateDisputeSelections=new Map(),duplicateDisputeResolutionNotes=new Map();
let adminDuplicateDisputes=[],myDuplicateDisputes=[],activeAdminDisputeId=null;
const isSuperuserActive=()=>true;
function showToast(){} function openImageZoom(){} async function loadAdminStats(){}
function getFirebaseErrorMessage(error){return error.message}
let submitted;
const functionsApi={httpsCallable:()=>async data=>{submitted=data;return {data:{ok:true}}}};
function photo(name){const c=document.createElement('canvas');c.width=700;c.height=400;const x=c.getContext('2d');x.fillStyle='#d8d9d7';x.fillRect(0,0,700,400);x.fillStyle='#48504a';x.fillRect(65,40,570,320);x.fillStyle='#f4f1e5';x.font='bold 30px Georgia';x.textAlign='center';x.fillText('EJEMPLO DE REVISIÓN',350,105);x.fillText(name,350,195);x.font='24px Georgia';x.fillText('1910 — 1980',350,255);return c.toDataURL('image/png')}
${functions}
(async()=>{
const viewport=Number(new URLSearchParams(location.search).get('width'));document.body.style.width=viewport+'px';
const id='a'.repeat(64);
const candidate={nombre_finado:'María Hernández',fecha_nacimiento:'1910',fecha_defuncion:'1980',nombre_panteon:'Panteón Municipal',estado_panteon:'Jalisco',municipio_panteon:'Guadalajara',colonia_panteon:'Centro',contributor_name:'Aportador de ejemplo',imageUrl:photo('María Hernández')};
adminDuplicateDisputes=[{id,recordType:'tomb',status:'pending',similarity:93.5,reason:'Coincidencia superior al 50 % en nombre, fechas y panteón. Se debe aclarar la diferencia en el apellido.',candidate,matches:[],messages:[]}];
duplicateDisputeComparisons.set(id,{matches:[{recordId:'existing',score:0.935,revision:{seconds:1,nanoseconds:0},publication:{...candidate,nombre_finado:'María Hernándes',imageUrl:photo('María Hernándes'),contributor_name:'Publicación anterior'},currentComparison:{score:0.935,fields:[{label:'Nombre',left:'María Hernández',right:'María Hernándes',similarity:0.9}]}}]});
renderDuplicateDisputes();
adminDuplicateDisputes.push({...adminDuplicateDisputes[0],id:'b'.repeat(64),candidate:{...candidate,nombre_finado:'Segundo caso de prueba'}});
renderDuplicateDisputes();
changeAdminDispute(1);
if(document.querySelectorAll('#admin-duplicate-disputes article').length!==1||!document.getElementById('admin-duplicate-disputes').textContent.includes('Segundo caso de prueba'))throw Error('No navega un caso a la vez');
changeAdminDispute(-1);
const radios=document.querySelectorAll('input[type=radio]');
if(radios.length!==3)throw Error('Faltan opciones visuales');
radios[1].click();
const note=document.getElementById('dispute-resolution-note-'+id);note.value='La fotografía nueva permite leer el apellido correcto';note.dispatchEvent(new Event('input'));
const columns=document.querySelectorAll('.row.g-3 > .col-md-6');
const a=columns[0].getBoundingClientRect(),b=columns[1].getBoundingClientRect();
if(innerWidth>=768 ? Math.abs(a.top-b.top)>2 || b.left<=a.left : b.top<=a.top)throw Error('Distribución de publicaciones incorrecta');
if(Math.max(a.right,b.right)>viewport+2)throw Error('Publicación recortada horizontalmente');
await resolveSelectedDisputePublication(id);
if(submitted?.decision!=='replace'||submitted?.matchedRecordId!=='existing'||!submitted.note)throw Error('Selección o motivo no enviados');
document.body.dataset.browserCheck='passed';
})().catch(error=>{document.body.dataset.browserCheck='failed';document.body.dataset.browserError=error.message});
`;
const file = path.join(output,'dispute-comparison.html');
await fs.writeFile(file,`<!doctype html><html lang="es"><head>${head}</head><body style="display:block;padding:16px;background:#eef2f6"><main class="container"><h4>Revisión administrativa de disputa</h4><button id="duplicate-dispute-alert" hidden></button><div id="my-duplicate-disputes" hidden></div><div id="admin-duplicate-disputes"></div></main><script>${fixture}</script></body></html>`);
for (const [name,width,height] of [['desktop',1280,1800],['mobile',412,2800]]) {
  const args=['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars',
    `--user-data-dir=${path.join(output,'dispute-profile-'+name)}`,`--window-size=${width},${height}`,
    '--virtual-time-budget=5000',`--screenshot=${path.join(output,'dispute-'+name+'.png')}`,'--dump-dom',pathToFileURL(file).href+'?width='+width];
  const result=await new Promise((resolve,reject)=>{
    const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',args,{windowsHide:true});
    let stdout='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',()=>{});
    child.on('error',reject);child.on('close',code=>resolve({code,stdout}));
  });
  if(result.code!==0||!result.stdout.includes('data-browser-check="passed"'))throw Error(name+': '+(result.stdout.match(/data-browser-error="([^"]*)"/)?.[1]||result.code));
  console.log(name+': comparación, selección y motivo verificados');
}
