import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync('index.html', 'utf8');
function setup() {
    const nodes = new Map();
    const get = id => {
        if (!nodes.has(id)) nodes.set(id, {style: {}, disabled: false});
        return nodes.get(id);
    };
    const canvas = {toDataURL: () => 'data:image/jpeg;base64,photo', getContext: () => ({drawImage() {}})};
    const ctx = {navigator: {onLine: true}, document: {getElementById: get, createElement: () => canvas},
        ensureActiveTombCemetery: () => true, activeTombCemetery: {},
        MAX_IMAGE_FILE_SIZE: 15e6, MAX_IMAGE_DIMENSION: 1600,
        captureOrientado: () => canvas, getGeolocation: async () => null,
        setInlineZoomEnabled() {}, resetImageEnhancements() {}, clearFormFields() {},
        setRotationControlsVisible() {}, setRotationControlsDisabled() {}, closeScanner() {},
        revealScanWorkflow() {}, showToast() {}, console: {error() {}},
        getFirebaseErrorMessage: e => e.message, processImageWithGemini: async () => {},
        FileReader: class {readAsDataURL() {this.onload({target: {result: 'image'}});}},
        Image: class {width = 100; height = 100; set src(value) {this.onload();}}
    };
    vm.createContext(ctx);
    for (const name of ['captureIA', 'handleImageUpload', 'acceptImageAndScan']) {
        vm.runInContext(html.match(new RegExp('async function '+name+'\\([^]*?\\n}'))[0], ctx);
    }
    get('cam-preview-ia').srcObject = {};
    get('cam-preview-ia').videoWidth = 100;
    return {ctx, get, canvas};
}
test('camera and uploaded photograph automatically request extraction', async () => {
    for (const method of ['camera', 'file']) {
        const {ctx} = setup();
        let scans = 0;
        ctx.processImageWithGemini = async photo => {assert.equal(photo, 'photo'); scans++;};
        if (method === 'camera') await ctx.captureIA();
        else await ctx.handleImageUpload({target: {files: [{type: 'image/jpeg', size: 100}]}});
        assert.equal(scans, 1);
    }
});
test('without internet the photograph stays available and automatic extraction resumes on retry', async () => {
    const {ctx, canvas} = setup();
    const notices = [];
    let scans = 0;
    ctx.pendingCanvas = canvas;
    ctx.navigator.onLine = false;
    ctx.showToast = message => notices.push(message);
    ctx.processImageWithGemini = async () => { scans++; };
    await ctx.acceptImageAndScan();
    assert.equal(scans, 0);
    assert.equal(ctx.pendingCanvas, canvas);
    assert.ok(notices.some(message => message.includes('internet')));
    ctx.navigator.onLine = true;
    await ctx.acceptImageAndScan();
    assert.equal(scans, 1);
});

test('an extraction in progress cannot run twice and controls recover after failure', async () => {
    const {ctx, get, canvas} = setup();
    ctx.pendingCanvas = canvas;
    let reject, scans = 0;
    ctx.processImageWithGemini = () => {scans++; return new Promise((_, fail) => {reject = fail;});};
    const pending = ctx.acceptImageAndScan();
    await ctx.acceptImageAndScan();
    assert.equal(scans, 1);
    assert.equal(get('retry-image-btn').disabled, true);
    reject(new Error('unavailable'));
    await pending;
    assert.equal(get('accept-scan-btn').disabled, false);
    assert.equal(get('retry-image-btn').disabled, false);
    assert.match(get('accept-scan-btn').innerHTML, /VOLVER A ESCANEAR/);
});
test('permission errors preserve the server explanation', () => {
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(html.match(/function getFirebaseErrorMessage\([^]*?\n}/)[0], ctx);
    assert.equal(ctx.getFirebaseErrorMessage({code: 'functions/permission-denied', message: 'Correo o contraseña de superusuario incorrectos.'}), 'Correo o contraseña de superusuario incorrectos.');
    assert.match(ctx.getFirebaseErrorMessage({code: 'functions/permission-denied', message: 'PERMISSION_DENIED'}), /autorización/);
});
