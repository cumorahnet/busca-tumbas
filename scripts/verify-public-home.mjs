import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {chromium, webkit} from 'playwright';
const original = await fs.readFile('index.html', 'utf8');
const source = (await fs.readFile('www/index.html', 'utf8')).replace(/<script\b[^>]*>[^]*?<\/script>/gi, '');
const names = ['requireMember', 'continueBrowsing', 'showModeSelection', 'isPublicTomb', 'tombSummaryHtml', 'loadRecentTombs', 'displaySearchResults', 'scrollToSearchResultsStart', 'selectAddTombMode', 'renderTombDetail', 'recordDetailPhotoHtml', 'prepareForFamilySearch', 'openTombAction', 'renderTombActionCard', 'backRecordDetail', 'recordDetailMainMenu', 'enableTombDetailEditing', 'detailDataHtml', 'historyEntryHtml', 'toggleTombHistory', 'loadTombHistory', 'openHistoryContact', 'sendHistoryContact', 'formatCoordinates', 'formatTimestamp', 'formatProperName', 'escapeHtml', 'inlineJsValue', 'tombOwnerId'];
const functions = names.map(name => {
    const match = original.match(new RegExp('(?:async )?function ' + name + '\\([^]*?\\n}'));
    assert.ok(match, name);
    return match[0];
}).join('\n');
const memberDialogFunctions = ['continueMemberAccess', 'cancelMemberAccess'].map(name => original.match(new RegExp('function ' + name + '\\([^]*?\\n}'))[0]).join('\n');
const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if(url.pathname === '/api/tomb-photo') {
            assert.equal(req.headers.authorization,'Bearer test-token');
            assert.equal(url.searchParams.get('recordId'),'example');
            res.setHeader('Content-Type','image/png');
            res.end(await fs.readFile('assets/brand/logo.png'));return;
        }
        if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(source); return; }
        const file = path.resolve('www', '.' + url.pathname);
        if (!file.startsWith(path.resolve('www') + path.sep)) { res.writeHead(403); res.end(); return; }
        const type = {'.css': 'text/css', '.png': 'image/png', '.js': 'application/javascript'}[path.extname(file)];
        if (type) res.setHeader('Content-Type', type);
        res.end(await fs.readFile(file));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
await fs.mkdir('.browser-check', {recursive: true});
try {
    for (const [engine, browserType] of Object.entries({chromium, webkit})) {
        const browser = await browserType.launch(engine === 'chromium' ? {executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'} : {});
        try {
            const page = await browser.newPage({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
            await page.goto('http://127.0.0.1:' + server.address().port, {waitUntil: 'networkidle'});
            for (const id of ['admin-panel-btn', 'superuser-badge', 'suspension-badge', 'verified-account-badge', 'logout-btn', 'benefits-card', 'benefits-title', 'benefits-progress', 'request-plus-btn', 'correction-notification-count', 'my-disputes-menu-count', 'my-disputes-submenu-count']) {
                assert.equal(await page.locator('#' + id).count(), 1, id + ' must remain in the static page');
            }
            await page.evaluate(() => {
                window.auth = {currentUser: null};
                window.familySearchPreparation = null;
                window.tombHistoryEntries=[];window.tombHistoryCursor=null;window.tombHistoryBusy=false;
                window.functionsApi={httpsCallable:name=>async()=>({data:name==='obtenerHistorialTumba'?{entries:[{id:'entry1',action:'edited',actorName:'Editora',changedAt:'2026-10-21T20:00:00Z',changes:[{field:'apellido_paterno',before:'Hernandes',after:'Hernández'}],canContact:true}],initial:{id:'original',action:'original',actorName:'Aportador',changedAt:null,changes:[],canContact:true},after:null,more:false}:{}})};
                window.pendingMemberAction = null;
                window.resetTombPhotoBatch = window.clearFormFields = window.setAuthMode = () => {};
                window.closeRecordDetail = () => { document.getElementById('record-detail-modal').style.display = 'none'; };
                window.loadBenefitStatus = () => { throw Error('Guests must not request account benefits'); };
                window.safeImageUrl = value => value;
                window.catalogCollection = () => ({orderBy() {return this;}, limit() {return this;}, async get() {return {docs: [{id: 'example', data: () => ({nombre_finado: 'María Hernández', fecha_nacimiento: '1920-02-03', fecha_defuncion: '2000-03-04', edad_defuncion: 80, nombre_panteon: 'Panteón de la comunidad', municipio_panteon: 'Guadalajara', estado_panteon: 'Jalisco', imageUrl: 'assets/brand/logo.png'})}]};}});
                window.isSuperuserActive = () => false;
                window.recordDetailPhotoHtml = url => `<img src="${url}" alt="Fotografía">`;
                window.detailDataHtml = () => '<p>Datos de la lápida</p>';
                window.adminRecordActionsHtml = () => '';
                window.tombHasLocation = () => false;
                window.loadTombCommunityMedia = window.loadTombHistory = () => {};
                document.getElementById('splash-screen').style.display = 'none';
            });
            await page.addScriptTag({content: functions});
            await page.addScriptTag({content: memberDialogFunctions});
            await page.evaluate(() => { document.getElementById('auth-screen').style.display = 'flex'; });
            assert.equal(await page.locator('#auth-continue-browsing').isVisible(), true);
            assert.equal(await page.locator('#auth-screen [data-pwa-install-action]').count(), 0);
            assert.equal(await page.locator('#mode-selection-card [data-pwa-install-action]').count(), 1);
            await page.screenshot({path: `.browser-check/welcome-guest-${engine}.png`, fullPage: true});
            await page.getByRole('button', {name: 'Seguir navegando sin cuenta'}).click();
            await page.getByRole('button', {name: /María Hernández/}).waitFor();
            assert.equal(await page.locator('.home-actions button').count(), 2);
            assert.equal(await page.locator('.primary-navigation').isVisible(), false);
            assert.equal(await page.locator('#auth-screen').isVisible(), false);
            assert.deepEqual(await page.locator('#bottom-navigation button').allTextContents(), ['Inicio', 'Mensajes 0', 'Cuenta', 'Compartir']);
            await page.screenshot({path: `.browser-check/public-home-${engine}.png`, fullPage: true});
            await page.evaluate(async () => {
                const snapshot = await catalogCollection('tumbas').get();
                displaySearchResults(snapshot.docs.map(doc => ({id:doc.id,...doc.data()})));
                document.getElementById('mode-selection-card').style.display = 'none';
                document.getElementById('search-tomb-section').style.display = 'block';
                window.openTombDetail = id => { window.openedSearchRecord = id; };
            });
            assert.equal(await page.locator('#tomb-search-result-list .recent-tomb').count(), 1);
            assert.equal(await page.locator('#tomb-search-result-detail').count(), 0);
            assert.equal(await page.locator('#record-detail-modal').isVisible(), false);
            assert.match(await page.locator('#tomb-search-result-list').textContent(), /1920.*2000.*80 años/);
            await page.locator('#tomb-search-result-list .recent-tomb').click();
            assert.equal(await page.evaluate(() => window.openedSearchRecord), 'example');
            await page.screenshot({path: `.browser-check/search-summary-${engine}.png`, fullPage: true});
            await page.evaluate(() => showModeSelection());
            await page.getByRole('button', {name: /^Aportar/}).click();
            assert.equal(await page.locator('#member-access-dialog').isVisible(), true);
            await page.locator('#member-access-dialog').getByRole('button', {name:'Continuar', exact:true}).click();
            assert.equal(await page.locator('#auth-screen').isVisible(), true);
            await page.getByRole('button', {name: 'Seguir navegando sin cuenta'}).click();
            assert.equal(await page.locator('#auth-screen').isVisible(), false);
            await page.evaluate(() => {
                window.currentDetailTomb = {id: 'example', userId: 'owner', nombre_finado: 'María', nombres:'María', apellido_paterno:'Hernández', fecha_nacimiento:'1920', fecha_defuncion:'2000', edad_defuncion:80, nombre_panteon:'Panteón de la comunidad', pais_panteon:'México', estado_panteon:'Jalisco', municipio_panteon:'Guadalajara', colonia_panteon:'Centro', imageUrl: 'assets/brand/logo.png'};
                renderTombDetail();
                document.getElementById('record-detail-modal').style.display = 'flex';
            });
            assert.equal(await page.locator('#tomb-extra-photo-file').count(), 0);
            assert.equal(await page.locator('.tomb-detail-actions button').count(), 5);
            for(const label of ['Nacimiento','Defunción','Edad al fallecer','País','Estado','Municipio','Colonia / poblado','Ubicación de la tumba','Ubicación del panteón','Fecha de aportación']) assert.ok((await page.locator('#record-detail-content').textContent()).includes(label),label);
            await page.getByRole('button', {name: 'Preparar para FamilySearch'}).click();
            await page.locator('#member-access-dialog').getByRole('button', {name:'Continuar', exact:true}).click();
            assert.equal(await page.locator('#auth-screen').isVisible(), true);
            assert.match(await page.locator('#auth-action-reason').textContent(), /descargar/);
            await page.getByRole('button', {name: 'Seguir navegando sin cuenta'}).click();
            await page.evaluate(() => {
                auth.currentUser={uid:'owner',emailVerified:true,getIdToken:async()=> 'test-token'};
                window.loadBenefitStatus=()=>{};
                renderTombDetail();document.getElementById('record-detail-modal').style.display='flex';
            });
            await page.getByRole('button',{name:'Añadir fotografía',exact:true}).click();
            assert.equal(await page.locator('#tomb-extra-photo-file').isVisible(),true);
            assert.equal(await page.locator('[data-tomb-edit]').count(),0);
            await page.getByRole('button',{name:'Volver',exact:true}).click();
            assert.equal(await page.locator('.tomb-detail-actions button').count(),6);
            await page.addScriptTag({url:'http://127.0.0.1:'+server.address().port+'/mobile/familysearch.js'});
            await page.route('https://example.test/**',async route=>route.fulfill({contentType:'image/png',body:await fs.readFile('assets/brand/logo.png')}));
            await page.evaluate(()=>{
                currentDetailTomb.imageUrl='https://example.test/original.png';
                Object.defineProperty(navigator,'canShare',{value:undefined,configurable:true});
            });
            await page.getByRole('button',{name:'Preparar para FamilySearch',exact:true}).click();
            const downloadPromise=page.waitForEvent('download');
            await page.locator('#familysearch-download-photo').click();
            const download=await downloadPromise;
            assert.deepEqual(await fs.readFile(await download.path()),await fs.readFile('assets/brand/logo.png'));
            await page.locator('#familysearch-dismiss').click();
            await page.getByRole('button',{name:'Editar datos',exact:true}).click();
            assert.equal(await page.locator('[data-tomb-edit]').count(),10);
            await page.getByRole('button',{name:'Volver',exact:true}).click();
            await page.getByRole('button',{name:'Añadir ubicación',exact:true}).click();
            assert.equal(await page.locator('#tomb-add-location').isVisible(),true);
            await page.getByRole('button',{name:'Volver',exact:true}).click();
            await page.locator('.tomb-detail-actions').scrollIntoViewIfNeeded();
            await page.screenshot({path:`.browser-check/record-full-${engine}.png`,fullPage:true});
            await page.evaluate(()=>{auth.currentUser={uid:'viewer',emailVerified:true};});
            await page.getByRole('button',{name:'Editar datos',exact:true}).click();
            assert.equal(await page.locator('#correction-description').isVisible(),true);
            assert.equal(await page.locator('[data-tomb-edit]').count(),0);
            await page.getByRole('button',{name:'Volver',exact:true}).click();
            assert.equal(await page.getByRole('button',{name:'Historial',exact:true}).count(),0);
            await page.evaluate(()=>{auth.currentUser={uid:'owner',emailVerified:true};renderTombDetail();});
            await page.getByRole('button',{name:'Historial',exact:true}).click();
            await page.locator('#tomb-history-list').getByText('Editora',{exact:false}).waitFor();
            await page.locator('#tomb-history-list').getByRole('button',{name:'Contactar al colaborador'}).first().click();
            assert.equal(await page.locator('#history-contact-message').isVisible(),true);
            assert.equal(await page.locator('#history-contact-purpose').inputValue(),'thanks');
            await page.getByRole('button',{name:'Volver',exact:true}).click();
            await page.getByRole('button',{name:'Menú principal',exact:true}).click();
            assert.equal(await page.locator('#record-detail-modal').isVisible(),false);
            console.log(engine + ': two home actions, recent records, guest detail, contribution/download gates and cancellation verified');
        } finally { await browser.close(); }
    }
} finally { await new Promise(resolve => server.close(resolve)); }
