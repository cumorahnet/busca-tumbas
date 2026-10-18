import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const source=await fs.readFile('www/index.html','utf8');
const head=source.match(/<head>([^]*?)<\/head>/)[1].replace(/<script\b[^>]*>[^]*?<\/script>/gi,'');
const auth=source.slice(source.indexOf('<div id="auth-screen">'),source.indexOf('<!-- VISOR DE IMAGEN -->'));
const splash=source.slice(source.indexOf('<div id="splash-screen">'),source.indexOf('<!-- AUTH SCREEN -->'));
const header=source.match(/<header class="app-header[^]*?<\/header>/)[0];
const out=path.resolve('.browser-check');await fs.mkdir(out,{recursive:true});
for(const [name,width,height,content,style] of [
 ['brand-auth-mobile',500,915,auth,'#auth-screen{display:flex!important}'],
 ['brand-header-mobile',500,915,header,'body{display:block!important;padding:16px}'],
 ['brand-splash',500,915,splash,'#splash-screen{display:flex!important}']
]) {
 const file=path.join(out,name+'.html');
 await fs.writeFile(file,`<!doctype html><html lang="es"><head><base href="${pathToFileURL(path.resolve('www')).href}/">${head}<style>${style}</style></head><body>${content}<script>window.addEventListener('load',()=>{document.body.dataset.brandCheck=[...document.images].every(i=>i.complete&&i.naturalWidth>0)?'passed':'failed'});</script></body></html>`);
 const args=['--headless=new','--disable-gpu','--no-first-run',`--user-data-dir=${path.join(out,'brand-profile')}`,`--window-size=${width},${height}`,'--virtual-time-budget=3000',`--screenshot=${path.join(out,name+'.png')}`,'--dump-dom',pathToFileURL(file).href];
 const result=await new Promise((resolve,reject)=>{const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',args,{windowsHide:true});let stdout='';child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',()=>{});child.on('error',reject);child.on('close',code=>resolve({code,stdout}));});
 if(result.code!==0||!result.stdout.includes('data-brand-check="passed"'))throw Error('Branding check failed: '+name);
 console.log(name+': logo loaded; screenshot saved');
}

