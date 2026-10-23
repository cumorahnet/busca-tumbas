import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright';

const html = (await fs.readFile('www/index.html','utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const script = await fs.readFile('assets/admin-console.js','utf8');
const server = http.createServer(async (req,res) => {
    try {
        const url = new URL(req.url,'http://localhost');
        if (url.pathname === '/') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
        const file = path.resolve('www','.' + url.pathname);
        if (!file.startsWith(path.resolve('www') + path.sep)) {res.writeHead(403);res.end();return;}
        res.setHeader('Content-Type',file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'application/javascript' : 'image/png');
        res.end(await fs.readFile(file));
    } catch {res.writeHead(404);res.end();}
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
await fs.mkdir('.browser-check',{recursive:true});
try {
    for (const width of [1440,390]) {
        const page = await browser.newPage({viewport:{width,height:1000}});
        const errors=[];page.on('pageerror',error => errors.push(error.message));
        await page.goto('http://127.0.0.1:' + server.address().port,{waitUntil:'networkidle'});
        await page.evaluate(() => {
            window.calls=[];window.isSuperuserActive=() => true;
            window.escapeHtml=value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
            window.inlineJsValue=value => escapeHtml(JSON.stringify(value));
            window.safeImageUrl=value => value;
            window.getFirebaseErrorMessage=(error,message) => error.message || message;
            window.showToast=() => {};
            window.auth={currentUser:{uid:'admin'}};
            window.adminContributionRecords=Array.from({length:23},(_,i) => ({id:'tomb'+i,type:'tomb',person:i === 0 ? 'José <img src=x onerror=alert(1)>' : 'Persona '+i,cemetery:'Panteón Central',cemeteryId:'cem1',state:'Jalisco',municipality:'Guadalajara',status:'published',contributor:'Ana Pérez',birth:'1920',death:'2000'}));
            adminContributionRecords.push({id:'cem1',type:'cemetery',cemetery:'Panteón Central',state:'Jalisco',municipality:'Guadalajara',locality:'Centro',contributor:'Ana Pérez',status:'approved'});
            window.functionsApi={httpsCallable:name => async data => {
                calls.push({name,data});
                if (name === 'listarUsuariosAdmin') return {data:{users:[{uid:'member',name:'Ana Pérez',email:'ana@example.com',disabled:false},{uid:'admin',name:'Administradora',administrator:true}],after:data.after ? null : 'next'}};
                if (name === 'gestionarUsuarioAdmin') return {data:{user:{uid:'member',name:'Ana Pérez',email:'ana@example.com',verified:true},profile:{phone:'1234567',country:'México'}}};
                return {data:{entries:[{action:'updated',actorName:'Ana',createdAt:'2026-10-23T12:00:00Z',changes:[{field:'name',before:'Anterior',after:'Nuevo'}]}],after:null}};
            }};
            window.openAdminCatalogDetail=async (type,id) => {calls.push({name:'view',type,id});document.getElementById('record-detail-content').innerHTML='Detalle';document.getElementById('record-detail-modal').style.display='flex';};
            window.closeRecordDetail=() => document.getElementById('record-detail-modal').style.display='none';
            window.showUserHistory=(uid) => calls.push({name:'user-history',uid});
            window.currentDetailTomb=null;window.currentCemeteryContribution=null;
            window.openTombDetail=async id => {window.currentDetailTomb={id};calls.push({name:'open-tomb',id});};
            window.enableTombDetailEditing=() => calls.push({name:'edit-tomb'});
            window.openMyCemeteryContribution=async id => {window.currentCemeteryContribution={id};calls.push({name:'open-cemetery',id});};
            window.enableMyCemeteryEditing=() => calls.push({name:'edit-cemetery'});
            document.getElementById('splash-screen').style.display='none';
            document.querySelectorAll('.card-custom').forEach(el => el.style.display='none');
            document.getElementById('admin-section').style.display='block';
            for (let parent=document.getElementById('admin-section').parentElement;parent;parent=parent.parentElement) {
                parent.hidden=false; parent.style.display='block';
            }
            document.getElementById('admin-content').innerHTML='<details class="mb-3">Old contributors</details><p>Revisiones pendientes</p><details id="admin-full-catalog">Old catalog</details>';
        });
        await page.addScriptTag({content:script});
        await page.evaluate(() => mountAdminConsole());
        assert.equal(await page.locator('.admin-table tbody tr').count(),20);
        await page.getByRole('button',{name:'Siguiente',exact:true}).click();
        assert.equal(await page.locator('.admin-table tbody tr').count(),3);
        await page.locator('#admin-search').fill('jose');
        await page.getByRole('button',{name:'Buscar',exact:true}).click();
        assert.equal(await page.locator('.admin-table tbody tr').count(),1);
        assert.equal(await page.locator('.admin-table img').count(),0,'Names cannot inject HTML');
        await page.getByRole('button',{name:'Editar',exact:true}).click();
        assert.equal(await page.evaluate(() => calls.at(-1).name),'edit-tomb');
        await page.getByRole('button',{name:'Historial',exact:true}).click();
        await page.locator('.admin-history-entry').waitFor();
        await page.getByRole('button',{name:'Cerrar',exact:true}).click();
        await page.getByRole('button',{name:'Panteones',exact:true}).click();
        assert.match(await page.locator('.admin-table').innerText(),/23 tumbas vinculadas/);
        await page.getByRole('button',{name:'Editar',exact:true}).click();
        assert.equal(await page.evaluate(() => calls.at(-1).name),'edit-cemetery');
        await page.getByRole('button',{name:'Usuarios',exact:true}).click();
        await page.getByText('ana@example.com',{exact:true}).waitFor();
        assert.equal(await page.locator('.admin-table tbody tr').nth(1).getByRole('button',{name:'Eliminar',exact:true}).isDisabled(),true);
        await page.getByRole('button',{name:'Editar',exact:true}).first().click();
        await page.locator('input[name="name"]').fill('Ana López');
        await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
        await page.waitForFunction(() => calls.some(call => call.name === 'gestionarUsuarioAdmin' && call.data.action === 'edit'));
        page.once('dialog',dialog => dialog.dismiss());
        await page.getByRole('button',{name:'Eliminar',exact:true}).first().click();
        assert.equal(await page.evaluate(() => calls.some(call => call.name === 'gestionarUsuarioAdmin' && call.data.action === 'delete')),false);
        await page.getByRole('button',{name:'Pendientes',exact:true}).click();
        assert.equal(await page.locator('#admin-pending-host').isVisible(),true);
        assert.equal(await page.locator('#admin-list-workspace').isVisible(),false);
        await page.getByRole('button',{name:'Tumbas / lápidas',exact:true}).click();
        assert.equal(await page.locator('#admin-search').inputValue(),'jose','Filters persist per section');
        const overflow=await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        assert.equal(overflow,false,`No page overflow at ${width}px`);
        await page.screenshot({path:`.browser-check/admin-console-${width}.png`,fullPage:true});
        assert.deepEqual(errors,[]);
        await page.close();
    }
    console.log('Admin console verified at desktop and mobile sizes.');
} finally {await browser.close();await new Promise(resolve => server.close(resolve));}
