import {spawnSync} from 'node:child_process';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {findExistingDuplicates} = require('../functions/duplicate-audit');
if (!process.argv.includes('--snapshot')) {
    const result = spawnSync(process.execPath, ['scripts/deduplicate-records.mjs'], {stdio:'inherit',windowsHide:true});
    if (result.status !== 0) throw new Error('No se pudo leer la base actual');
}
const file = (await readdir('.record-audit')).filter(name => name.startsWith('dedup-before-')).sort().at(-1);
if (!file) throw new Error('No hay captura de la base');
const snapshot = JSON.parse(await readFile(`.record-audit/${file}`, 'utf8'));
const report = {source:file, checkedAt:new Date().toISOString(),
    tombs:findExistingDuplicates(snapshot.tumbas),cemeteries:findExistingDuplicates(snapshot.cemeteries,true)};
const output = `.record-audit/duplicate-report-${report.checkedAt.replace(/[:.]/g,'-')}.json`;
await writeFile(output, JSON.stringify(report,null,2));
for (const [type,result] of [['tumbas',report.tombs],['lugares',report.cemeteries]]) {
    console.log(`${type}: ${result.records} registros, ${result.comparisons} pares evaluados, ${result.matches.length} posibles duplicados`);
    for (const match of result.matches) console.log(`${match.first.name} ↔ ${match.second.name}: ${match.similarity.toFixed(2)} % global; ${match.nameSimilarity.toFixed(2)} % nombre; misma imagen: ${match.sameImageHash}`);
}
console.log(`Informe: ${output}. Ningún registro modificado.`);
