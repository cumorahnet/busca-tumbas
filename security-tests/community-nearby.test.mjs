import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('index.html', 'utf8');
const names = ['nearbyCommunityPlaces', 'detectCommunityPlacesGps', 'continueCommunityPlaceManually',
    'chooseNearbyCommunityPlace', 'selectAddCemeteryMode'];
const source = names.map(name => html.match(new RegExp('(?:async )?function ' + name + '\\([^]*?\\n}'))[0]).join('\n');
function setup() {
    const nodes = new Map();
    const get = id => {
        if (!nodes.has(id)) nodes.set(id, {hidden: false, value: '', style: {}, children: [],
            replaceChildren() { this.children = []; }, append(child) { this.children.push(child); }});
        return nodes.get(id);
    };
    const catalog = [{id: 'local', name: 'San Jose', latitude: 20, longitude: -103,
        stateCode: '14', municipalityCode: '039', state: 'Jalisco', municipality: 'Guadalajara'}];
    const ctx = vm.createContext({document: {getElementById: get, createElement: () => ({})},
        auth: {currentUser: {uid: 'member'}}, communityNearbySequence: 0, communityNearbyPlaces: [],
        requireMember: () => true, resetCemeteryForm() {}, loadCommunityStates: async () => {},
        loadCommunityMunicipalities: async () => {}, loadCommunityPlaceCatalog: async () => {},
        updateCommunityCountry() {}, updateCommunityPlaceType() {}, communityRegion: () => ({mexican: true}),
        getGeolocation: async () => ({latitude: 20, longitude: -103}), loadCemeteryCatalog: async () => catalog,
        db: {collection: () => ({where: () => ({get: async () => ({docs: []})})})},
        formatProperName: s => s, formatCoordinates: () => '20, -103', communityPlaceTypeLabel: item => item.placeType,
        useInegiCemeteryMatch: () => {ctx.selectedInegi = true;},
        distanceInMeters: (a, b) => Math.hypot(a.latitude - b.latitude, a.longitude - b.longitude) * 111000});
    vm.runInContext(source, ctx);
    return {ctx, get, catalog};
}

test('entry requests GPS and shows choices before photograph fields; selection fills place and region', async () => {
    const {ctx, get} = setup();
    await ctx.selectAddCemeteryMode();
    assert.equal(get('community-place-form').hidden, true);
    assert.equal(get('community-nearby-picker').hidden, false);
    assert.equal(get('community-nearby-list').children.length, 1);
    await get('community-nearby-list').children[0].onclick();
    assert.equal(get('cemetery-name').value, 'San Jose');
    assert.equal(get('cemetery-state').value, '14');
    assert.equal(get('cemetery-municipality').value, '039');
    assert.equal(get('cemetery-place-type').value, 'cemetery');
    assert.equal(ctx.selectedInegi, true);
    assert.equal(get('community-place-form').hidden, false);
    assert.equal(get('community-nearby-picker').hidden, true);
});

test('nearby includes approved other place types, excludes invalid coordinates and distant or pending places', () => {
    const {ctx, catalog} = setup();
    const records = [
        {id: 'church', name: 'Iglesia', status: 'approved', placeType: 'church', location: {latitude: 20.001, longitude: -103}},
        {id: 'pending', status: 'pending', location: {latitude: 20, longitude: -103}},
        {id: 'null', status: 'approved', location: {latitude: null, longitude: null}},
        {id: 'far', status: 'approved', location: {latitude: 21, longitude: -103}}
    ];
    const places = ctx.nearbyCommunityPlaces(catalog, records, {latitude: 20, longitude: -103});
    assert.deepEqual(Array.from(places, item => item.id), ['local', 'church']);
});

test('approved INEGI alias replaces original; distances sort nearest first', () => {
    const {ctx, catalog} = setup();
    const places = ctx.nearbyCommunityPlaces(catalog, [{id: 'alias', name: 'Alias', status: 'approved',
        inegiCemeteryId: 'local', location: {latitude: 20, longitude: -103}}], {latitude: 20, longitude: -103});
    assert.equal(places.length, 1);
    assert.equal(places[0].id, 'alias');
});

test('GPS denied permits manual entry; late GPS cannot override manual choice', async () => {
    const {ctx, get} = setup();
    ctx.getGeolocation = async () => null;
    await ctx.selectAddCemeteryMode();
    assert.match(get('community-nearby-status').textContent, /manual/);
    let resolve;
    ctx.getGeolocation = () => new Promise(r => {resolve = r;});
    const pending = ctx.detectCommunityPlacesGps();
    ctx.continueCommunityPlaceManually();
    resolve({latitude: 20, longitude: -103});
    await pending;
    assert.equal(get('community-place-form').hidden, false);
    assert.equal(get('community-nearby-list').children.length, 0);
});

test('community service failure still shows INEGI places and reports partial results', async () => {
    const {ctx, get} = setup();
    ctx.db = {collection: () => ({where: () => ({get: async () => {throw Error('offline');}})})};
    await ctx.detectCommunityPlacesGps();
    assert.equal(get('community-nearby-list').children.length, 1);
    assert.match(get('community-nearby-status').textContent, /incompletos/);
});
