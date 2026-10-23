import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
const source=await fs.readFile('www/index.html','utf8');
const head=source.match(/<head>([^]*?)<\/head>/)[1].replace(/<script\b[^>]*>[^]*?<\/script>/gi,'');
const dialog=source.match(/<dialog id="pwa-install-dialog"[^]*?<\/dialog>/)[0];
const home=source.slice(source.indexOf('<!-- Mode Selection Card -->'),source.indexOf('<div class="card-custom" id="add-cemetery-section">'));
const fixture=`<!doctype html><html lang="es" data-temporary-install="on"><head>${head}<style>#mode-selection-card{display:flex!important}</style></head><body>${dialog}${home}<script src="/mobile/install.js?v=1"></script><script>
(async()=>{
 await navigator.serviceWorker.ready;
 if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
 localStorage.removeItem('buscatumbas_pwa_install_seen_v1');
 window.dispatchEvent(new Event('buscatumbas:ready'));
 const dialog=document.getElementById('pwa-install-dialog');
 if(!dialog.open)throw Error('No initial offer');
 if(document.getElementById('pwa-install-confirm').hidden!==true)throw Error('Native prompt without an event');
 if(!document.getElementById('pwa-install-instructions').textContent)throw Error('No manual instructions');
 if(![...document.images].every(i=>i.complete&&i.naturalWidth>0))await Promise.all([...document.images].map(i=>i.decode()));
 const box=dialog.getBoundingClientRect();if(box.left<0||box.right>innerWidth||box.height>innerHeight)throw Error('Dialog overflow');
 document.getElementById('pwa-install-dismiss').click();
 window.dispatchEvent(new Event('buscatumbas:ready'));
 if(dialog.open)throw Error('Dismissed offer reopened automatically');
 const action=document.querySelector('[data-pwa-install-action]');
 const buttonBox=action.getBoundingClientRect();
 if(action.hidden||getComputedStyle(action).visibility==='hidden'||buttonBox.width===0||buttonBox.height===0)throw Error('Mobile install action is not visible after dismissal');
 action.click();
 if(!dialog.open)throw Error('Mobile install action does not reopen instructions');
 document.body.dataset.installCheck='passed';
})().catch(e=>{document.body.dataset.installCheck='failed';document.body.dataset.installError=e.message;});
</script></body></html>`;
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/install-check'){res.setHeader('Content-Type','text/html');res.end(fixture);return;}
  const file=url.pathname==='/sw.js'?path.resolve('sw.js'):path.resolve('www','.'+url.pathname);
  if(!file.startsWith(path.resolve('www')+path.sep)&&file!==path.resolve('sw.js'))throw Error('Path');
  const data=await fs.readFile(file);const ext=path.extname(file);
  res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'})[ext]||'application/octet-stream');res.end(data);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;const out=path.resolve('.browser-check');await fs.mkdir(out,{recursive:true});
try{
 for(const [name,agent] of [['install-android','Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'],['install-ios','Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1']]){
  const args=['--headless=new','--disable-gpu','--no-first-run',`--user-agent=${agent}`,`--user-data-dir=${path.join(out,name+'-profile')}`,'--window-size=500,1000','--virtual-time-budget=15000',`--screenshot=${path.join(out,name+'.png')}`,'--dump-dom',`http://127.0.0.1:${port}/install-check`];
  const result=await new Promise((resolve,reject)=>{const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',args,{windowsHide:true});let stdout='';child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',()=>{});child.on('error',reject);child.on('close',code=>resolve({code,stdout}));});
  if(result.code!==0||!result.stdout.includes('data-install-check="passed"'))throw Error(name+': '+(result.stdout.match(/data-install-error="([^"]*)"/)?.[1]||'Worker or dialog not ready'));
  console.log(name+': initial dialog, instructions, logo and active controlling service worker verified');
 }
}finally{server.close();}
