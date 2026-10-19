import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
const source = await fs.readFile('www/index.html', 'utf8');
const head = source.match(/<head>([^]*?)<\/head>/)[1].replace(/<script\b[^>]*>[^]*?<\/script>/gi, '');
const dialog = source.match(/<dialog id="familysearch-preparation-dialog"[^]*?<\/dialog>/)[0];
const names = ['escapeHtml', 'inlineJsValue', 'tombOwnerId', 'showMyContributionDetail', 'prepareForFamilySearch'];
const functions = names.map(name => source.match(new RegExp('function '+name+'\\([^]*?\\n}'))[0]).join('\n');
const fixture = `<!doctype html><html lang="es"><head>${head}</head><body style="display:block;padding:20px">
${dialog}<h3>Mis aportaciones</h3><div id="my-contributions-list"></div><div id="my-contribution-detail" class="my-contribution-detail-panel"></div>
<script src="/mobile/familysearch.js"></script><script>
const auth={currentUser:{uid:'owner',emailVerified:true,displayName:'Ana Pérez'}};
let myContributions=[],currentDetailTomb=null,familySearchPreparation=null;
const isSuperuserActive=()=>false,safeImageUrl=v=>v,showToast=message=>{throw Error(message)};
${functions}
(async()=>{
 const canvas=document.createElement('canvas');canvas.width=800;canvas.height=500;const ctx=canvas.getContext('2d');ctx.fillStyle='#ddd5c6';ctx.fillRect(0,0,800,500);ctx.fillStyle='#6c635b';ctx.fillRect(100,50,600,400);ctx.fillStyle='white';ctx.font='32px serif';ctx.fillText('ELENA URIBE SÁNCHEZ',180,180);ctx.fillText('1963 – 2006',290,250);
 const photo=canvas.toDataURL('image/jpeg');const realFetch=window.fetch.bind(window);const photoBlob=await(await realFetch(photo)).blob();
 const tomb={id:'tomb-one',type:'tomb',contributorId:'owner',nombre_finado:'Elena Uribe Sánchez',fecha_nacimiento:'18 de agosto de 1963',fecha_defuncion:'18 de julio de 2006',nombre_panteon:'Panteón Municipal',municipio_panteon:'Ajacuba',estado_panteon:'Hidalgo',pais_panteon:'México',contributor_name:'Ana Pérez',imageUrl:'https://example.invalid/fixture.jpg?token=private'};
 myContributions=[tomb];
 let failDownload=false;const requested=[],downloads=[],copies=[];
 window.fetch=async(url,args)=>{requested.push(String(url));if(String(url)!==tomb.imageUrl)throw Error('Unexpected request');if(failDownload)throw Error('offline');return new Response(photoBlob,{status:200,headers:{'Content-Type':'image/jpeg'}});};
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copies.push(text);}}});
 const originalClick=HTMLAnchorElement.prototype.click;
 HTMLAnchorElement.prototype.click=function(){if(this.download){downloads.push({name:this.download,url:this.href});return;}originalClick.call(this);};
 showMyContributionDetail(tomb.id);document.querySelector('.my-contribution-image').src=photo;
 const button=document.querySelector('[onclick^="prepareForFamilySearch"]');if(!button)throw Error('Missing action in own contribution');button.click();
 const modal=document.getElementById('familysearch-preparation-dialog');if(!modal.open)throw Error('Dialog did not open');document.getElementById('familysearch-photo').src=photo;
 await new Promise(resolve=>setTimeout(resolve,20));
 const box=modal.getBoundingClientRect();if(box.left<0||box.right>innerWidth||box.height>innerHeight||modal.scrollWidth>modal.clientWidth+2)throw Error('Dialog overflow');
 const title=document.getElementById('familysearch-memory-title'),description=document.getElementById('familysearch-memory-description');
 if(!description.value.includes('Fotografía aportada por: Ana Pérez')||description.value.includes('private'))throw Error('Metadata missing or private URL exposed');
 title.value='Lápida de Elena — título revisado';document.getElementById('familysearch-copy-title').click();await Promise.resolve();
 if(copies[0]!==title.value)throw Error('Copy ignored reviewed text');
 document.getElementById('familysearch-download-text').click();
 if(!downloads[0]?.name.endsWith('.txt'))throw Error('No text download');
 const text=await(await realFetch(downloads[0].url)).text();if(!text.includes(title.value))throw Error('Text export ignored edits');
 document.getElementById('familysearch-download-photo').click();await new Promise(resolve=>setTimeout(resolve,30));
 if(!downloads[1]?.name.endsWith('.jpg'))throw Error('No photo download');
 const saved=await(await realFetch(downloads[1].url)).blob();if(saved.size!==photoBlob.size)throw Error('Photo bytes changed');
 const link=document.getElementById('familysearch-open-gallery');if(link.href!=='https://www.familysearch.org/es/memories/gallery'||link.target!=='_blank'||!link.rel.includes('noopener'))throw Error('Incorrect external navigation');
 failDownload=true;document.getElementById('familysearch-download-photo').click();await new Promise(resolve=>setTimeout(resolve,20));if(!document.getElementById('familysearch-status').textContent.includes('Abrir foto original'))throw Error('Missing download fallback');
 if(requested.some(url=>url.includes('familysearch.org')))throw Error('Unexpected automatic FamilySearch upload');
 familySearchPreparation.close();
 myContributions=[{...tomb,contributorId:'someone-else'}];showMyContributionDetail(tomb.id);if(document.querySelector('[onclick^="prepareForFamilySearch"]'))throw Error('Export offered for someone else');
 myContributions=[tomb];showMyContributionDetail(tomb.id);document.querySelector('.my-contribution-image').src=photo;prepareForFamilySearch(tomb.id);document.getElementById('familysearch-photo').src=photo;
 document.body.dataset.familysearchCheck='passed';
})().catch(error=>{document.body.dataset.familysearchCheck='failed';document.body.dataset.familysearchError=error.message;});
</script></body></html>`;
const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/check') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fixture); return; }
        const file = path.resolve('www', '.' + url.pathname);
        if (!file.startsWith(path.resolve('www') + path.sep)) throw Error('Path');
        res.setHeader('Content-Type', ({'.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2'})[path.extname(file)] || 'application/octet-stream');
        res.end(await fs.readFile(file));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const out = path.resolve('.browser-check'); await fs.mkdir(out, {recursive: true});
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${path.join(out, 'familysearch-profile')}`, 'about:blank'], {windowsHide: true});
let ws;
try {
    const endpoint = await new Promise((resolve, reject) => {
        let stderr = ''; const timeout = setTimeout(() => reject(Error('Chrome timeout')), 15000);
        chrome.on('error', reject); chrome.stderr.on('data', c => { stderr += c; const m = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (m) { clearTimeout(timeout); resolve(m[1]); } });
    });
    const targets = await (await fetch(`http://127.0.0.1:${new URL(endpoint).port}/json/list`)).json();
    ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, {once: true}); ws.addEventListener('error', reject, {once: true}); });
    let id = 0; const pending = new Map();
    ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); } });
    const call = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, {resolve, reject}); ws.send(JSON.stringify({id: key, method, params})); });
    const evaluate = async expression => { const r = await call('Runtime.evaluate', {expression, returnByValue: true}); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
    await call('Page.enable');
    for (const [name, width, height] of [['mobile', 412, 915], ['desktop', 1280, 1000]]) {
        await call('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: name === 'mobile'});
        await call('Page.navigate', {url: `http://127.0.0.1:${server.address().port}/check?mode=${name}`});
        let result;
        for (let i = 0; i < 200; i++) { result = await evaluate('({status:document.body?.dataset.familysearchCheck,error:document.body?.dataset.familysearchError})'); if (result.status) break; await new Promise(r => setTimeout(r, 50)); }
        if (result.status !== 'passed') throw Error(`${name}: ${result.error || 'UI not ready'}`);
        const screenshot = await call('Page.captureScreenshot', {format: 'png'});
        await fs.writeFile(path.join(out, `familysearch-${name}.png`), Buffer.from(screenshot.data, 'base64'));
        console.log(`${name}: own contribution action, editable data, clipboard, original-photo download, text export and fallback verified`);
    }
} finally { ws?.close(); chrome.kill(); server.close(); }
