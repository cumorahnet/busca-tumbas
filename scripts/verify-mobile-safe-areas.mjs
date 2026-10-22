import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {webkit,chromium} from 'playwright';
const source=(await fs.readFile('www/index.html','utf8')).replace(/<script\b[^>]*>[^]*?<\/script>/gi,'');
const server=http.createServer(async(req,res)=>{
    try {
        const url=new URL(req.url,'http://localhost');
        if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(source);return;}
        const file=path.resolve('www','.'+decodeURIComponent(url.pathname));
        if(!file.startsWith(path.resolve('www')+path.sep)){res.writeHead(403);res.end();return;}
        const type={'.js':'application/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2'}[path.extname(file)];
        if(type)res.setHeader('Content-Type',type);
        res.end(await fs.readFile(file));
    }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
await fs.mkdir('.browser-check',{recursive:true});
const scenarios=[
    {name:'android-buttons',width:412,height:915,top:24,bottom:48,left:0,right:0},
    {name:'iphone-portrait',width:390,height:844,top:59,bottom:34,left:0,right:0},
    {name:'iphone-landscape',width:844,height:390,top:0,bottom:21,left:59,right:59},
    {name:'iphone-keyboard',width:390,height:430,top:59,bottom:0,left:0,right:0},
    {name:'small-phone',width:320,height:568,top:20,bottom:24,left:0,right:0}
];
try{
 for(const engine of ['chromium','webkit']){
    const browser=engine==='webkit'?await webkit.launch():await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    try{
      for(const scenario of scenarios){
        const page=await browser.newPage({viewport:{width:scenario.width,height:scenario.height},isMobile:true,hasTouch:true});
        await page.goto(origin,{waitUntil:'networkidle'});
        const result=await page.evaluate(s=>{
            const node=id=>document.getElementById(id);
            const root=document.documentElement;
            for(const side of ['top','right','bottom','left'])root.style.setProperty('--safe-area-inset-'+side,s[side]+'px');
            node('splash-screen').style.display='none';
            node('auth-screen').style.display='none';
            const within=(element,label)=>{
                const b=element.getBoundingClientRect();
                if(b.top<s.top-.6||b.bottom>innerHeight-s.bottom+.6||b.left<s.left-.6||b.right>innerWidth-s.right+.6)throw Error(label+' outside safe rectangle '+JSON.stringify({x:b.x,y:b.y,width:b.width,height:b.height}));
            };
            // Exercise the real home page and footer together, including document scroll.
            node('main-app').style.display='flex';
            node('mode-selection-card').style.display='flex';
            const main=node('main-app');
            const footer=document.querySelector('footer.app-legal-links');
            const first=main.querySelector('.app-header');
            if(first.getBoundingClientRect().top<s.top-.6)throw Error('home header starts under status bar');
            if(footer.getBoundingClientRect().top<main.getBoundingClientRect().bottom-.6)throw Error('footer overlaps home content');
            const last=footer.querySelector('a:last-child');
            window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'});
            within(last,'last legal link');
            window.scrollTo({top:0,behavior:'instant'});
            node('main-app').style.display='none';
            node('ia-modal').style.display='flex';
            within(node('cam-top-bar'),'camera exit');within(node('snap-btn'),'camera shutter');
            node('ia-modal').style.display='none';
            node('toast-msg').textContent='Mensaje de prueba suficientemente largo para comprobar el espacio disponible.';
            node('toast-msg').style.display='block';within(node('toast-msg'),'toast');node('toast-msg').style.display='none';
            for(const id of ['familysearch-preparation-dialog','pwa-install-dialog','app-share-dialog','superuser-dialog']){
                const dialog=node(id);dialog.showModal();within(dialog,id);dialog.close();
            }
            node('record-detail-modal').style.display='flex';node('record-detail-content').innerHTML='<div style="height:1600px">Datos largos</div>';
            within(document.querySelector('.record-detail-dialog'),'record details');node('record-detail-modal').style.display='none';
            node('auth-screen').style.display='flex';
            for(const id of ['auth-name-wrapper','auth-terms-wrapper','register-btn','cancel-register-btn'])node(id).style.display='block';
            node('login-help-links').style.display='none';node('login-btn').style.display='none';
            node('auth-screen').scrollTop=0;
            const card=document.querySelector('#auth-screen .card-custom');
            if(card.getBoundingClientRect().top<s.top-.6)throw Error('registration starts under status bar');
            node('auth-screen').scrollTop=node('auth-screen').scrollHeight;
            within(node('cancel-register-btn'),'last registration action');
            return {safe:true,registrationScroll:node('auth-screen').scrollHeight>node('auth-screen').clientHeight};
        },scenario);
        assert.equal(result.safe,true);
        await page.screenshot({path:'.browser-check/safe-'+engine+'-'+scenario.name+'.png'});
        console.log(engine+' '+scenario.name+': camera, dialogs, registration and feedback inside safe area');
        await page.close();
      }
      if(engine==='webkit'){
        const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
        await page.goto(origin,{waitUntil:'networkidle'});
        await page.addScriptTag({url:origin+'/mobile/familysearch.js'});
        await page.evaluate(()=>{
          document.getElementById('splash-screen').style.display='none';document.getElementById('auth-screen').style.display='none';
          window.sharedCalls=[];window.copyCalls=[];
          Object.defineProperty(navigator,'canShare',{value:({files})=>files[0] instanceof File,configurable:true});
          Object.defineProperty(navigator,'share',{value:async data=>{window.sharedCalls.push({filename:data.files[0].name,size:data.files[0].size,text:data.text})},configurable:true});
          Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>window.copyCalls.push(value)},configurable:true});
          const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKtwAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
          const blob=new Blob([bytes],{type:'image/png'});
          window.fsController=BuscaTumbasFamilySearch.createController({document,navigator,URL,fetch:async()=>new Response(blob),getCurrentUser:()=>({uid:'viewer',emailVerified:true})});
          window.fsController.open({id:'fixture',type:'tomb',contributorId:'other',contributor_name:'Original contributor',nombre_finado:'Test person',imageUrl:'https://example.invalid/photo.png'});
          document.getElementById('familysearch-photo').src=URL.createObjectURL(blob);
        });
        await page.locator('#familysearch-copy-description').click();
        await page.locator('#familysearch-download-photo').click();
        await page.locator('#familysearch-share-photo').waitFor({state:'visible'});
        assert.equal(await page.evaluate(()=>sharedCalls.length),0,'sharing must wait for a fresh user click');
        await page.locator('#familysearch-share-photo').click();
        const share=await page.evaluate(()=>({shares:sharedCalls,copies:copyCalls}));
        assert.equal(share.shares.length,1);assert.ok(share.shares[0].size>0);assert.ok(share.shares[0].text.includes('Busca Tumbas'));assert.ok(share.copies[0].includes('Original contributor'));
        await page.close();console.log('webkit: collaborative copy and original-photo sharing verified with a separate user action');
      }
    }finally{await browser.close();}
 }
}finally{server.close();}
