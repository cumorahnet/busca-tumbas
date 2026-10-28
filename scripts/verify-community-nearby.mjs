import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium, webkit} from 'playwright';

const html = await fs.readFile('index.html', 'utf8');
const section = html.slice(html.indexOf('<div class="card-custom" id="add-cemetery-section"'),
    html.indexOf('<div class="card-custom" id="corrections-section"'));
assert.ok(section.length > 100);
const names = ['nearbyCommunityPlaces', 'detectCommunityPlacesGps', 'continueCommunityPlaceManually',
    'chooseNearbyCommunityPlace', 'selectAddCemeteryMode'];
const source = names.map(name => html.match(new RegExp('(?:async )?function ' + name + '\\([^]*?\\n}'))[0]).join('\n');
await fs.mkdir('.browser-check', {recursive: true});
for (const [engine, type] of Object.entries({chromium, webkit})) {
    const browser = await type.launch(engine === 'chromium'
        ? {executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'} : {});
    try {
        const page = await browser.newPage({viewport: {width: 390, height: 844}});
        await page.setContent('<style>[hidden]{display:none!important}button{padding:12px;max-width:100%}body{font:16px sans-serif}</style>' + section);
        await page.addScriptTag({content: `
            let communityNearbySequence=0, communityNearbyPlaces=[];
            const auth={currentUser:{uid:'test'}}, requireMember=()=>true, resetCemeteryForm=()=>{};
            const loadCommunityStates=async()=>document.getElementById('cemetery-state').add(new Option('Jalisco','14'));
            const loadCommunityMunicipalities=async()=>document.getElementById('cemetery-municipality').add(new Option('Guadalajara','039'));
            const loadCommunityPlaceCatalog=async()=>{}, updateCommunityCountry=()=>{}, updateCommunityPlaceType=()=>{};
            const communityRegion=()=>({mexican:true}), formatProperName=s=>s, formatCoordinates=()=>'';
            const communityPlaceTypeLabel=()=> 'Panteón', useInegiCemeteryMatch=()=>{};
            const getGeolocation=async()=>({latitude:20,longitude:-103});
            const loadCemeteryCatalog=async()=>[{id:'one',name:'San José',stateCode:'14',municipalityCode:'039',latitude:20,longitude:-103}];
            const db={collection:()=>({where:()=>({get:async()=>({docs:[]})})})}, distanceInMeters=()=>0;
            ${source}
        `});
        await page.evaluate(() => {
            for (const id of ['account-section','mode-selection-card','add-tomb-section','search-tomb-section',
                'admin-section','corrections-section','my-contributions-section','my-disputes-section','back-to-mode-selection']) {
                if (document.getElementById(id)) continue;
                const node = document.createElement('div'); node.id = id; document.body.append(node);
            }
            return selectAddCemeteryMode();
        });
        assert.equal(await page.locator('#community-place-form').isVisible(), false);
        await page.locator('#community-nearby-list button').waitFor();
        await page.screenshot({path: `.browser-check/community-nearby-${engine}.png`, fullPage: true});
        await page.locator('#community-nearby-list button').click();
        await page.locator('#community-place-form').waitFor({state: 'visible'});
        assert.equal(await page.locator('#cemetery-name').inputValue(), 'San José');
        assert.equal(await page.locator('#cemetery-state').inputValue(), '14');
        assert.equal(await page.locator('#cemetery-municipality').inputValue(), '039');
        assert.equal(await page.locator('#community-place-form').evaluate(el => !!el.closest('#add-cemetery-section')), true);
        await page.evaluate(() => selectAddCemeteryMode());
        await page.getByRole('button', {name: 'No aparece mi lugar', exact: false}).click();
        assert.equal(await page.locator('#community-place-form').isVisible(), true);
        console.log(engine + ': nearby first, selection fills region, manual fallback verified');
    } finally { await browser.close(); }
}
