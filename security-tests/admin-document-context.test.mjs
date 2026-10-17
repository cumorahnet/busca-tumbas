import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('index.html', 'utf8');
const context = vm.createContext({adminDuplicateDisputes: []});
for (const name of ['escapeHtml', 'inlineJsValue', 'duplicateDisputeReason', 'adminDocumentContextHtml']) {
    vm.runInContext(source.match(new RegExp('function ' + name + '\\([^]*?\\n}'))[0], context);
}
const record = {id:'record1', type:'tomb', status:'published'};
test('ordinary catalog documents do not imply an unresolved error', () => {
    const html = context.adminDocumentContextHtml(record, []);
    assert.match(html, /Sin revisión pendiente identificada/);
    assert.doesNotMatch(html, /Requiere decisión|Revisar reportes y resolver/);
});
test('reported document shows the actual report and a resolution entry point', () => {
    const html = context.adminDocumentContextHtml(record, [{id:'tomb_record1', recordType:'tomb', recordId:'record1', count:3,
        notes:[{requesterName:'Ana',description:'Fecha incorrecta <script>alert(1)</script>'}]}]);
    assert.match(html, /Fecha incorrecta &lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /admin-error-tomb_record1/);
    assert.match(html, /Revisar reportes y resolver/);
});
test('duplicate review is attached only to the matching document and type', () => {
    const disputes = [{id:'case1',status:'pending',recordType:'tomb',similarity:75,matches:[{recordId:'record1'}]}];
    assert.match(context.adminDocumentContextHtml(record, [], disputes), /Comparar y decidir duplicado/);
    assert.doesNotMatch(context.adminDocumentContextHtml({...record,id:'other'}, [], disputes), /Comparar y decidir duplicado/);
    assert.doesNotMatch(context.adminDocumentContextHtml({...record,type:'cemetery'}, [], disputes), /Comparar y decidir duplicado/);
});
test('pending place opens approval review instead of only editing', () => {
    const html = context.adminDocumentContextHtml({...record,type:'cemetery',status:'pending'}, []);
    assert.match(html, /openCommunityCemeteryReview/);
    assert.match(html, /Revisar para aprobar o rechazar/);
});
