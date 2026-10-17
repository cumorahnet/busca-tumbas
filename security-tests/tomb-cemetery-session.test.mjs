import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

const html = fs.readFileSync('index.html', 'utf8');
function setup() {
    const nodes = new Map();
    const get = id => {
        if (!nodes.has(id)) nodes.set(id, {
            value: '', checked: false, disabled: false, hidden: false, style: {},
            innerHTML: '', textContent: '', options: [], scrollIntoView() {},
            get selectedOptions() { return this.options.filter(option => option.value === this.value); },
            replaceChildren(...options) { this.options = options; this.value = options[0]?.value || ''; },
            add(option) { this.options.push(option); }
        });
        return nodes.get(id);
    };
    const notices = [];
    const records = new Map();
    const ctx = {
        document: {getElementById: get, querySelector: () => get('save-button')},
        Option: function(textContent, value) { return {textContent, value}; },
        activeTombCemetery: null, selectedInegiCemetery: null, inegiCemeteryResults: [],
        pendingTombPhotos: [], tombPhotoBatchCount: 0, tombPhotoBatchIndex: 0,
        MAX_IMAGE_FILE_SIZE: 15 * 1024 * 1024,
        tombCountrySequence: 0, cemeterySearchSequence: 0, stateChoices: null, municipalityChoices: null,
        birthYearWasEstimated: false, pendingCanvas: null, pendingTombRecordId: null,
        currentGeolocation: null, imageSourceType: null, platformAdminUid: null,
        tombCemeteryCatalogProviders: new Map([['mexico', {source: 'inegi', label: 'INEGI', load: async () => []}]]),
        navigator: {onLine: true}, auth: {currentUser: {uid: 'user', email: 'user@example.com'}},
        showToast: message => notices.push(message), confirm: () => true,
        setInlineZoomEnabled() {}, setImageEnhancementEnabled() {}, setRotationControlsVisible() {},
        refreshPreviewContributor() {}, calculateEstimatedBirthYear() {},
        updateScannedPeopleSaveLabel() {}, advanceScannedPerson: () => false,
        duplicateDisputeNotice: result => `En disputa: ${result.similarity} %. No se publicó.`,
        formatDateToSpanish: value => value || '', formatCoordinates: () => 'N/A',
        parseSpanishDateToISO: () => null, isValidDisplayedDate: () => true,
        composeDeceasedName: value => [value.nombres, value.apellido_paterno, value.apellido_materno].filter(Boolean).join(' '),
        createSearchableLocationSelect: () => ({destroy() {}, removeActiveItems() {}}),
        setSavingState() {}, withTimeout: async promise => promise, uploadBlobWithTimeout: async () => {},
        createImageFingerprint: () => 'fingerprint', fingerprintDistance: () => Infinity,
        sha256Hex: async value => createHash('sha256').update(String(value)).digest('hex'),
        getFirebaseErrorMessage: error => error.message, console: {error() {}, warn() {}},
        storage: {ref: () => ({getDownloadURL: async () => 'https://example.com/photo.jpg', delete: async () => {}})},
        firebase: {firestore: {FieldValue: {serverTimestamp: () => 'timestamp'},
            GeoPoint: function(latitude, longitude) { this.latitude = latitude; this.longitude = longitude; }}},
        db: {collection: name => ({where() { return this; }, get: async () => {
                const docs = name === 'cemeteries' ? [] : [...records].map(([id, data]) => ({id, data: () => data}));
                return {docs, forEach: callback => docs.forEach(callback)};
            }, doc: id => ({id})}),
            runTransaction: async callback => {
                if (ctx.failSave) throw new Error('Save failed');
                return callback({get: async ref => ({exists: records.has(ref.id)}), set: (ref, data) => records.set(ref.id, data)});
            }}
    };
    ctx.functionsApi = {httpsCallable: name => async ({recordId, data}) => {
        assert.equal(name, 'crearAportacionTumba');
        if (ctx.failSave) throw new Error('Save failed');
        if (ctx.disputeSave) return {data: {disputed: true, similarity: 75, disputeId: 'dispute'}};
        if (records.has(recordId)) throw new Error('Duplicate');
        records.set(recordId, {...data, userId: 'user', contributorId: 'user', timestamp: 'timestamp'});
        return {data: {saved: true, recordId}};
    }};
    vm.createContext(ctx);
    for (const name of ['normalizeSearchText', 'formatProperName', 'escapeHtml', 'getTombCatalogProvider',
        'isManualTombLocation', 'clearSelectedTombCatalogEntry', 'changeTombCountry', 'toggleManualTombLocation',
        'getTombCemeteryDraft', 'renderActiveTombCemetery', 'confirmTombCemetery', 'ensureActiveTombCemetery',
        'changeTombCemetery', 'loadInegiStates', 'clearFormFields', 'clearDisplayedData', 'retryImageCapture',
        'populateExtractedDataForm', 'saveCurrentFormDataToHistory', 'buildTombIdentity', 'buildPersonIdentity',
        'selectAddTombMode', 'openScannerModal', 'handleImageUpload', 'searchNearbyCemeteries', 'selectInegiCemetery',
        'renderTombPhotoBatch', 'resetTombPhotoBatch', 'handleTombImageSelection', 'advanceTombPhotoBatch']) {
        const match = html.match(new RegExp('(?:async )?function ' + name + '\\([^]*?\\n}'));
        assert.ok(match, name);
        vm.runInContext(match[0], ctx);
    }
    get('display-pais').value = 'México';
    get('display-estado').options = [{value: '14', textContent: 'Jalisco'}];
    get('display-estado').value = '14';
    get('display-municipio').options = [{value: '039', textContent: 'Guadalajara'}];
    get('display-municipio').value = '039';
    get('display-nombre-panteon').value = 'Panteón de Belén';
    get('display-colonia').value = 'Centro';
    ctx.selectedInegiCemetery = {id: 'inegi-123', source: 'inegi', latitude: 20.68, longitude: -103.35};
    const photo = (person, image) => {
        ctx.pendingCanvas = {toBlob: callback => callback(image)};
        get('display-nombres').value = person;
    };
    return {ctx, get, records, notices, photo};
}

test('disputed uploads retain the photo for review, do not claim publication, and advance the capture flow', async () => {
    const s = setup();
    let deleted = false;
    s.ctx.storage.ref = () => ({getDownloadURL: async () => 'https://example.com/disputed.jpg', delete: async () => {deleted = true;}});
    s.ctx.confirmTombCemetery();
    s.ctx.disputeSave = true;
    s.photo('Ana', 'photo');
    await s.ctx.saveCurrentFormDataToHistory();
    assert.equal(s.records.size, 0);
    assert.equal(deleted, false);
    assert.ok(s.notices.some(notice => notice.includes('En disputa: 75')));
    assert.equal(s.get('display-nombres').value, '');
});

test('capture requires a confirmed place and incomplete places cannot be confirmed', async () => {
    const s = setup();
    await s.ctx.openScannerModal(); // No media API is called before confirmation.
    assert.equal(s.ctx.ensureActiveTombCemetery(), false);
    s.get('display-nombre-panteon').value = '';
    s.ctx.confirmTombCemetery();
    assert.equal(s.ctx.activeTombCemetery, null);
    s.get('display-nombre-panteon').value = 'Nuevo panteón';
    s.ctx.confirmTombCemetery();
    assert.equal(s.get('open-camera-btn').disabled, false);
    assert.equal(s.get('tomb-cemetery-editor').hidden, true);
});

test('two successive saves retain all place fields and catalog coordinates', async () => {
    const s = setup();
    s.ctx.confirmTombCemetery();
    for (const [person, image] of [['Ana', 'photo-one'], ['Luis', 'photo-two']]) {
        s.photo(person, image);
        s.ctx.populateExtractedDataForm({nombres: person, nombre_panteon: 'OCR incorrecto'}, null);
        assert.equal(s.get('display-nombre-panteon').value, 'Panteón de Belén');
        await s.ctx.saveCurrentFormDataToHistory();
        assert.equal(s.get('display-nombres').value, '');
        assert.equal(s.ctx.pendingCanvas, null);
        assert.equal(s.ctx.activeTombCemetery.name, 'Panteón de Belén');
    }
    assert.equal(s.records.size, 2, s.notices.join('\n'));
    for (const record of s.records.values()) {
        assert.equal(record.pais_panteon, 'México');
        assert.equal(record.estado_panteon, 'Jalisco');
        assert.equal(record.municipio_panteon, 'Guadalajara');
        assert.equal(record.colonia_panteon, 'Centro');
        assert.equal(record.cemetery_id, 'inegi-123');
        assert.equal(record.inegi_denue_id, 'inegi-123');
        assert.equal(record.panteon_geolocation.latitude, 20.68);
    }
    s.ctx.retryImageCapture();
    s.ctx.selectAddTombMode();
    assert.equal(s.ctx.activeTombCemetery.name, 'Panteón de Belén');
});

test('other countries use manual data and cannot retain an INEGI reference', async () => {
    const s = setup();
    s.get('display-pais').value = 'Perú';
    await s.ctx.changeTombCountry();
    assert.equal(s.get('tomb-catalog-location-fields').hidden, true);
    assert.equal(s.ctx.selectedInegiCemetery, null);
    s.get('display-estado-manual').value = 'Lima';
    s.get('display-municipio-manual').value = 'Lima';
    s.get('display-nombre-panteon').value = 'Presbítero Maestro';
    s.ctx.confirmTombCemetery();
    s.photo('Persona', 'photo-peru');
    await s.ctx.saveCurrentFormDataToHistory();
    assert.equal(s.records.size, 1, s.notices.join('\n'));
    const record = [...s.records.values()][0];
    assert.equal(record.pais_panteon, 'Perú');
    assert.equal(record.estado_panteon, 'Lima');
    assert.equal(record.inegi_denue_id, null);
    assert.equal(record.cemetery_source, 'manual');
    assert.equal(record.panteon_geolocation, null);
});

test('a new place saved on a tomb becomes selectable without a forged catalog reference', async () => {
    const s = setup();
    s.ctx.selectedInegiCemetery = null;
    s.get('display-nombre-panteon').value = 'Panteón Nuevo';
    s.ctx.confirmTombCemetery();
    s.photo('Ana', 'new-place-photo');
    await s.ctx.saveCurrentFormDataToHistory();
    s.records.set('foreign-place', {nombre_panteon: 'Otro País', pais_panteon: 'Perú', estado_panteon: 'Jalisco', municipio_panteon: 'Guadalajara'});
    s.records.set('rejected-place', {nombre_panteon: 'Retirado', status: 'rejected', estado_panteon: 'Jalisco', municipio_panteon: 'Guadalajara'});
    s.ctx.changeTombCemetery();
    await s.ctx.searchNearbyCemeteries();
    assert.equal(s.ctx.inegiCemeteryResults.length, 1, s.notices.join('\n'));
    assert.equal(s.ctx.inegiCemeteryResults[0].nombre, 'Panteón Nuevo');
    assert.equal(s.ctx.selectedInegiCemetery.source, 'manual');
    assert.equal(s.ctx.selectedInegiCemetery.id, null);
    assert.ok(s.get('inegi-cemetery-results').options.some(option => option.value === 'manual'));
});

test('failed saves retain the photo and selected place; changing place discards only after confirmation', async () => {
    const s = setup();
    s.ctx.confirmTombCemetery();
    s.photo('Ana', 'photo');
    s.ctx.failSave = true;
    await s.ctx.saveCurrentFormDataToHistory();
    assert.equal(s.records.size, 0);
    assert.ok(s.ctx.pendingCanvas);
    s.ctx.confirm = () => false;
    s.ctx.changeTombCemetery();
    assert.equal(s.ctx.activeTombCemetery.name, 'Panteón de Belén');
    assert.ok(s.ctx.pendingCanvas);
    s.ctx.confirm = () => true;
    s.ctx.changeTombCemetery();
    assert.equal(s.ctx.activeTombCemetery, null);
    assert.equal(s.ctx.pendingCanvas, null);
    assert.equal(s.get('upload-file-btn').disabled, true);
});

test('a delayed Mexican catalog cannot overwrite a newly selected country', async () => {
    const s = setup();
    let complete;
    s.ctx.tombCemeteryCatalogProviders.get('mexico').load = () => new Promise(resolve => { complete = resolve; });
    const oldLoad = s.ctx.changeTombCountry();
    s.get('display-pais').value = 'Chile';
    await s.ctx.changeTombCountry();
    complete([{stateCode: '14', state: 'Jalisco'}]);
    await oldLoad;
    assert.equal(s.ctx.stateChoices, null);
    assert.equal(s.get('tomb-catalog-location-fields').hidden, true);
    assert.equal(s.get('display-estado').options.length, 1);
});

test('location identities preserve Mexican legacy keys and distinguish countries', () => {
    const {ctx} = setup();
    const data = {nombre_finado: 'Ana', nombre_panteon: 'San José', estado_panteon: 'Central', municipio_panteon: 'Capital'};
    assert.equal(ctx.buildTombIdentity(data), ctx.buildTombIdentity({...data, pais_panteon: 'México'}));
    assert.notEqual(ctx.buildTombIdentity({...data, pais_panteon: 'Chile'}), ctx.buildTombIdentity({...data, pais_panteon: 'Perú'}));
});

test('a selected group of photos is saved in order with one immutable place', async () => {
    const s = setup();
    s.ctx.confirmTombCemetery();
    const loaded = [];
    s.ctx.handleImageUpload = async event => {
        const file = event.target.files[0];
        loaded.push(file.name);
        s.photo(file.name, file.name);
    };
    const files = ['Ana', 'Luis', 'Eva'].map(name => ({name, type: 'image/jpeg', size: 100}));
    await s.ctx.handleTombImageSelection({target: {files, value: ''}});
    assert.equal(s.ctx.tombPhotoBatchIndex, 1);
    assert.equal(s.ctx.pendingTombPhotos.length, 2);
    for (let index = 0; index < files.length; index++) await s.ctx.saveCurrentFormDataToHistory();
    assert.deepEqual(loaded, ['Ana', 'Luis', 'Eva']);
    assert.equal(s.records.size, 3, s.notices.join('\n'));
    for (const record of s.records.values()) assert.equal(record.cemetery_id, 'inegi-123');
    assert.equal(s.ctx.pendingTombPhotos.length, 0);
    assert.equal(s.get('tomb-photo-batch-status').hidden, true);
    assert.equal(s.ctx.activeTombCemetery.name, 'Panteón de Belén');
});

test('a failed save does not advance or discard the queued photos', async () => {
    const s = setup();
    s.ctx.confirmTombCemetery();
    s.ctx.handleImageUpload = async event => s.photo(event.target.files[0].name, 'image');
    await s.ctx.handleTombImageSelection({target: {files: ['Ana', 'Luis'].map(name => ({name, type: 'image/jpeg', size: 100}))}});
    s.ctx.failSave = true;
    await s.ctx.saveCurrentFormDataToHistory();
    assert.equal(s.ctx.tombPhotoBatchIndex, 1);
    assert.equal(s.ctx.pendingTombPhotos[0].name, 'Luis');
    assert.equal(s.get('display-nombres').value, 'Ana');
});
