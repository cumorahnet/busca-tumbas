import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {chromium, webkit} from 'playwright';
const original = await fs.readFile('index.html', 'utf8');
const source = (await fs.readFile('www/index.html', 'utf8')).replace(/<script\b[^>]*>[^]*?<\/script>/gi, '');
const names = ['requireMember', 'continueBrowsing', 'showModeSelection', 'loadRecentTombs', 'selectAddTombMode', 'renderTombDetail', 'prepareForFamilySearch', 'requestTombChanges', 'escapeHtml', 'inlineJsValue', 'tombOwnerId'];
const functions = names.map(name => {
    const match = original.match(new RegExp('(?:async )?function ' + name + '\\([^]*?\\n}'));
    assert.ok(match, name);
    return match[0];
}).join('\n');
const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
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
                window.loadTombCommunityMedia = () => {};
                document.getElementById('splash-screen').style.display = 'none';
            });
            await page.addScriptTag({content: functions});
            await page.evaluate(() => {continueBrowsing(); showModeSelection();});
            await page.getByRole('button', {name: /María Hernández/}).waitFor();
            assert.equal(await page.locator('.home-actions button').count(), 2);
            assert.equal(await page.locator('.primary-navigation').isVisible(), false);
            assert.equal(await page.locator('#auth-screen').isVisible(), false);
            assert.equal(await page.locator('#bottom-navigation button').count(), 3);
            await page.screenshot({path: `.browser-check/public-home-${engine}.png`, fullPage: true});
            await page.getByRole('button', {name: /^Aportar/}).click();
            assert.equal(await page.locator('#auth-screen').isVisible(), true);
            await page.getByRole('button', {name: 'Seguir explorando sin cuenta'}).click();
            assert.equal(await page.locator('#auth-screen').isVisible(), false);
            await page.evaluate(() => {
                window.currentDetailTomb = {id: 'example', nombre_finado: 'María', imageUrl: 'assets/brand/logo.png'};
                renderTombDetail();
                document.getElementById('record-detail-modal').style.display = 'flex';
            });
            assert.equal(await page.locator('#tomb-extra-photo-file').count(), 0);
            assert.equal(await page.getByRole('button', {name: 'Modificar o aportar a esta tumba'}).isVisible(), true);
            await page.getByRole('button', {name: 'Preparar para FamilySearch'}).click();
            assert.equal(await page.locator('#auth-screen').isVisible(), true);
            assert.match(await page.locator('#auth-action-reason').textContent(), /descargar/);
            console.log(engine + ': two home actions, recent records, guest detail, contribution/download gates and cancellation verified');
        } finally { await browser.close(); }
    }
} finally { await new Promise(resolve => server.close(resolve)); }
