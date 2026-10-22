import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const source = await fs.readFile('index.html', 'utf8');
const functions = ['escapeHtml','refreshAccountIdentity','showAccount','saveAccount','updateMessagesCount'].map(name =>
    source.match(new RegExp('(?:async )?function ' + name + '\\([^]*?\\n}'))[0]).join('\n');
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    await page.route('**/www/index.html',async route => {
        const response = await route.fetch();
        await route.fulfill({response,body:(await response.text()).replace(/<script\b[^>]*>[^]*?<\/script>/gi,'')});
    });
    await page.goto('http://127.0.0.1:5500/www/index.html',{waitUntil:'networkidle'});
    await page.evaluate(() => {
        document.getElementById('splash-screen').style.display='none';
        document.getElementById('main-app').style.display='flex';
        document.getElementById('app-header-version').textContent='v2.30.0';
        window.auth={currentUser:{uid:'test',emailVerified:true,email:'test@example.com',displayName:'Nombre anterior',updateProfile:async()=>{},getIdToken:async()=>{}}};
        window.accountProfile=null;window.accountUserId=null;
        window.accountFieldLabels={displayName:'Nombre',phone:'Teléfono',municipality:'Municipio',state:'Estado',country:'País'};
        window.requireMember=()=>true;window.getFirebaseErrorMessage=e=>e.message;
        window.profile={displayName:'Nombre anterior',phone:'5512345678',termsAcceptedAt:'date',municipality:'Ajacuba',state:'Hidalgo',country:'México',email:'test@example.com'};
        window.entries=[];window.saved=0;
        window.functionsApi={httpsCallable:name=>async data=>{
            if(name==='obtenerMiCuenta') return {data:{profile,history:entries,complete:true}};
            saved++;entries=[{actorName:'Nombre anterior',createdAt:Date.now(),changes:[{field:'displayName',before:profile.displayName,after:data.displayName}]}];
            profile={...profile,...data};return {data:{saved:true,profile}};
        }};
        window.myDuplicateDisputes=[{id:'own',status:'approved'}];
        window.adminDuplicateDisputes=[{id:'own'},{id:'other'}];
        window.correctionInboxItems=[{id:'thread'}];window.isSuperuserActive=()=>true;
    });
    await page.addScriptTag({content:functions});
    await page.evaluate(async()=>{await refreshAccountIdentity();updateMessagesCount();window.scrollTo(0,900);});
    assert.equal(await page.locator('#messages-total-count').innerText(),'3');
    assert.equal(await page.locator('#app-header-version').isVisible(),true);
    assert.equal(await page.locator('.app-header').evaluate(el=>el.getBoundingClientRect().top),0);
    await page.locator('#header-account-user').click();
    await page.locator('#account-form [name="displayName"]').fill('Nombre actualizado');
    await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
    await page.getByText('Cambios guardados en el historial.',{exact:true}).waitFor();
    assert.equal(await page.locator('#header-account-user').innerText(),'Nombre actualizado');
    await page.getByText('Historial de la cuenta',{exact:true}).click();
    assert.equal(await page.getByText('Nombre: Nombre anterior → Nombre actualizado',{exact:true}).isVisible(),true);
    await page.getByRole('button',{name:'Cerrar',exact:true}).click();
    await page.locator('#bottom-navigation').getByRole('button',{name:'Cuenta',exact:true}).click();
    assert.equal(await page.locator('#account-form [name="displayName"]').inputValue(),'Nombre actualizado');
    assert.equal(await page.evaluate(()=>saved),1);
    await page.screenshot({path:'.browser-check/account-mobile.png'});
    console.log('Cuenta compartida por encabezado/pie, guardado, historial, versión visible y contador unificado verificados en móvil.');
} finally {await browser.close();}
