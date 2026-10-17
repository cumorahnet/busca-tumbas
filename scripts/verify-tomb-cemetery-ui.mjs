import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const root = process.cwd();
const output = path.join(root, '.browser-check');
await fs.mkdir(output, {recursive: true});
const source = await fs.readFile('index.html', 'utf8');
const names = ['normalizeSearchText', 'formatProperName', 'escapeHtml', 'getTombCatalogProvider',
    'isManualTombLocation', 'clearSelectedTombCatalogEntry', 'changeTombCountry', 'toggleManualTombLocation',
    'getTombCemeteryDraft', 'renderActiveTombCemetery', 'confirmTombCemetery', 'loadInegiStates',
    'loadInegiMunicipalities', 'updateInegiSearchState', 'searchNearbyCemeteries', 'selectInegiCemetery',
    'clearFormFields', 'clearDisplayedData', 'selectAddTombMode'];
const functions = names.map(name => source.match(new RegExp('(?:async )?function ' + name + '\\([^]*?\\n}'))?.[0]).join('\n');
const fixture = [{id: 'example', name: 'Panteón de Belén', colony: 'Centro', stateCode: '14', state: 'Jalisco',
    municipalityCode: '039', municipality: 'Guadalajara', latitude: 20.68, longitude: -103.35}];
const code = `
let activeTombCemetery=null, selectedInegiCemetery=null, inegiCemeteryResults=[], tombCountrySequence=0,
    cemeterySearchSequence=0, stateChoices=null, municipalityChoices=null, pendingCanvas=null,
    pendingTombRecordId=null, currentGeolocation=null, imageSourceType=null, birthYearWasEstimated=false;
const tombCemeteryCatalogProviders=new Map([['mexico',{source:'inegi',label:'INEGI',load:async()=>${JSON.stringify(fixture)}}]]);
const db={collection:()=>({where(){return this},get:async()=>({docs:[],forEach(){}})})};
function showToast(){} function setInlineZoomEnabled(){} function setImageEnhancementEnabled(){}
function createSearchableLocationSelect(){return {destroy(){},removeActiveItems(){}}}
function getFirebaseErrorMessage(error){return error.message}
function formatCoordinates(value){return value ? 'Lat: '+value.latitude+', Long: '+value.longitude : 'N/A'}
${functions}
(async()=>{
 const get=id=>document.getElementById(id);
 get('splash-screen').style.display='none';get('auth-screen').style.display='none';get('main-app').style.display='block';
 get('app-header-version').textContent='v2.17.0';
 selectAddTombMode();await new Promise(resolve=>setTimeout(resolve,50));
 if(get('tomb-cemetery-card').getBoundingClientRect().height<100)throw Error('Place selector is hidden');
 if(!get('open-camera-btn').disabled)throw Error('Capture enabled before confirmation');
 get('display-estado').value='14';await loadInegiMunicipalities();
 get('display-municipio').value='039';await updateInegiSearchState();confirmTombCemetery();
 if(!activeTombCemetery || activeTombCemetery.name!=='Panteón de Belén')throw Error('Catalog selection failed');
 clearDisplayedData();
 if(!get('tomb-cemetery-editor').hidden || get('tomb-cemetery-summary').getBoundingClientRect().height<30)throw Error('Selected place not visible');
 if(!get('image-upload-input').multiple)throw Error('Multiple files unavailable');
 if(get('upload-file-btn').disabled)throw Error('Upload is disabled after confirmation');
 document.body.dataset.browserCheck='passed';
 get('tomb-cemetery-card').scrollIntoView({block:'start'});
})().catch(error=>{document.body.dataset.browserCheck='failed';document.body.dataset.browserError=error.message});`;
const html = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<link\b[^>]*>/gi, '').replace('</body>', `<script>${code}</script></body>`);
const file = path.join(output, 'tomb-cemetery.html');
await fs.writeFile(file, html);
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const args = ['--headless=new', '--disable-gpu', '--force-device-scale-factor=1', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${path.join(output, 'profile')}`, '--window-size=430,1000', '--virtual-time-budget=2000',
    `--screenshot=${path.join(output, 'tomb-cemetery.png')}`, '--dump-dom', pathToFileURL(file).href];
const result = await new Promise((resolve, reject) => {
    const child = spawn(chrome, args, {windowsHide: true});
    let stdout = '';
    child.stdout.on('data', chunk => {stdout += chunk});
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', code => resolve({code, stdout}));
});
if (result.code !== 0 || !result.stdout.includes('data-browser-check="passed"')) {
    throw Error('Browser check failed: ' + (result.stdout.match(/data-browser-error="([^"]*)"/)?.[1] || result.code));
}
console.log('Chrome móvil: selección visible, datos del catálogo conservados y varias fotos habilitadas.');
console.log(path.join(output, 'tomb-cemetery.png'));
