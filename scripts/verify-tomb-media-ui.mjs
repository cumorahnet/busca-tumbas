import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const source=await fs.readFile('www/index.html','utf8');
const names=['escapeHtml','inlineJsValue','safeImageUrl','formatCoordinates','formatTimestamp','prepareTombExtraCameraPhoto','selectTombExtraGalleryPhoto','tombHasLocation','loadTombCommunityMedia','addPhotoToExistingTomb','addLocationToExistingTomb','renderTombDetail'];
const functions=names.map(name=>source.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n}'))[0]).join('\n');
const head=source.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const fixture=`
let currentDetailTomb={id:'existing',nombre_finado:'Persona existente',contributorId:'original-owner',imageUrl:'https://example.com/photo.jpg'},recordDetailZoomLevel=1,pendingTombExtraPhoto=null,tombExtraCameraCapture=null;
const auth={currentUser:{uid:'visitor'}};
const isSuperuserActive=()=>false,tombOwnerId=t=>t.contributorId;
const calls=[],uploads=[];
const functionsApi={httpsCallable:name=>async data=>{calls.push({name,data});return {data:{added:true}}}};
const storage={ref:path=>({getDownloadURL:async()=>photoURL})};
const db={collection:()=>({doc:()=>({collection:()=>({orderBy(){return this},get:async()=>({docs:[{data:()=>({storagePath:'extra',contributorName:'Otra persona',createdAt:new Date()})}]})})})})};
function recordDetailPhotoHtml(){return '<p>Fotografía original</p>'} function detailDataHtml(){return '<p>Datos existentes</p>'} function adminRecordActionsHtml(){return ''}
function setSavingState(button,text){button.textContent=text} function showToast(){} function getFirebaseErrorMessage(e){return e.message}
async function uploadBlobWithTimeout(ref,blob){uploads.push(blob)}
async function openTombDetail(){const latest=calls.at(-1)?.data.geolocation;if(latest)currentDetailTomb.geolocation=latest;renderTombDetail()}
window.confirm=()=>true;
Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:success=>success({coords:{latitude:0,longitude:0,accuracy:5}})}});
let photoURL;
${functions}
(async()=>{
const width=Number(new URLSearchParams(location.search).get('width'));document.body.style.width=width+'px';document.body.style.boxSizing='border-box';
const canvas=document.createElement('canvas');canvas.width=400;canvas.height=250;const x=canvas.getContext('2d');x.fillStyle='#deded5';x.fillRect(0,0,400,250);x.fillStyle='#334';x.font='24px serif';x.fillText('Foto adicional de prueba',30,125);photoURL=canvas.toDataURL('image/jpeg');
renderTombDetail();await new Promise(r=>setTimeout(r,0));
if(document.querySelector('[onclick="enableTombDetailEditing()"]'))throw Error('Otro usuario obtuvo edición de datos');
if(!document.querySelector('#tomb-extra-gallery img'))throw Error('Galería no visible');
const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg'));const file=new File([blob],'extra.jpg',{type:'image/jpeg'});const transfer=new DataTransfer();transfer.items.add(file);document.getElementById('tomb-extra-photo-file').files=transfer.files;
await addPhotoToExistingTomb();
if(uploads.length!==1||uploads[0].type!=='image/jpeg')throw Error('No preparó y subió JPEG');
const added=calls[0];if(added.name!=='aportarFotoOUbicacionTumba'||Object.keys(added.data).sort().join(',')!=='photoId,recordId'||added.data.recordId!=='existing')throw Error('Foto modificó datos ajenos');
await addLocationToExistingTomb();
if(calls[1]?.data.geolocation.latitude!==0||document.getElementById('tomb-add-location'))throw Error('No completa ubicación o permite reemplazarla');
if(currentDetailTomb.nombre_finado!=='Persona existente')throw Error('Cambió identidad');
currentDetailTomb.geolocation=null;renderTombDetail();
const cameraInput=document.getElementById('tomb-extra-camera-file');
if(cameraInput.getAttribute('capture')!=='environment')throw Error('No solicita cámara trasera');
cameraInput.files=transfer.files;await prepareTombExtraCameraPhoto(cameraInput);
if(!tombExtraCameraCapture.geolocation||!document.getElementById('tomb-extra-camera-status').textContent.includes('GPS'))throw Error('No obtiene GPS después de cámara');
await addPhotoToExistingTomb();
const cameraCall=calls.at(-1).data;
if(cameraCall.capture?.source!=='camera'||cameraCall.geolocation?.latitude!==0||!cameraCall.photoId)throw Error('Foto de cámara no envía GPS y captura juntos');
if(document.getElementById('tomb-add-location'))throw Error('No completa ubicación tras foto con GPS');
navigator.geolocation.getCurrentPosition=(_success,reject)=>reject({code:1});
const noGPS=document.getElementById('tomb-extra-camera-file');noGPS.files=transfer.files;await prepareTombExtraCameraPhoto(noGPS);
if(!document.getElementById('tomb-extra-camera-status').textContent.includes('sin GPS'))throw Error('Falta explicación de permiso denegado');
await addPhotoToExistingTomb();
if(calls.at(-1).data.geolocation)throw Error('Inventó GPS con permiso denegado');
document.getElementById('tomb-extra-photo-file').files=transfer.files;selectTombExtraGalleryPhoto();
if(tombExtraCameraCapture!==null)throw Error('GPS de cámara quedó asociado a archivos');
document.body.dataset.browserCheck='passed';
})().catch(error=>{document.body.dataset.browserCheck='failed';document.body.dataset.browserError=error.message});`;
const output=path.resolve('.browser-check');await fs.mkdir(output,{recursive:true});const file=path.join(output,'tomb-media.html');
await fs.writeFile(file,`<!doctype html><html lang="es"><head><base href="${pathToFileURL(path.resolve('www')).href}/">${head}</head><body style="display:block;padding:16px;background:#eef2f6"><h5 id="record-detail-title"></h5><div id="record-detail-content"></div><script>${fixture}</script></body></html>`);
for(const [name,width,height] of [['desktop',1280,1500],['mobile',412,2200]]) {
const args=['--headless=new','--disable-gpu','--no-first-run',`--user-data-dir=${path.join(output,'media-profile-'+name)}`,`--window-size=${width},${height}`,'--virtual-time-budget=10000',`--screenshot=${path.join(output,'media-'+name+'.png')}`,'--dump-dom',pathToFileURL(file).href+'?width='+width];
const result=await new Promise((resolve,reject)=>{const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',args,{windowsHide:true});let stdout='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',()=>{});child.on('error',reject);child.on('close',code=>resolve({code,stdout}));});
if(result.code!==0||!result.stdout.includes('data-browser-check="passed"'))throw Error(name+': '+(result.stdout.match(/data-browser-error="([^"]*)"/)?.[1]||result.code));
console.log(name+': usuario ajeno aporta foto y GPS sin modificar identidad; galería y bloqueo de reemplazo verificados');
}
