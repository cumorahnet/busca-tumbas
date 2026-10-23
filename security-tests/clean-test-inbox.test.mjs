import test from 'node:test';
import assert from 'node:assert/strict';
import {deletionWrites} from '../scripts/clean-test-inbox.mjs';

const projectId='buscatumbas-2e7cc';
const doc=relative => ({name:`projects/${projectId}/databases/(default)/documents/${relative}`,updateTime:'2026-10-23T12:00:00Z',fields:{}});
test('cleanup permits only messages, disputes, reviews, and review reporters with revision preconditions',() => {
    const documents=['correction_requests/a','_duplicateDisputes/b','_errorReviews/c','_errorReviews/c/reporters/u'].map(doc);
    const writes=deletionWrites({projectId,documents},projectId);
    assert.equal(writes.length,4);
    for (let i=0;i<writes.length;i++) assert.deepEqual(writes[i],{delete:documents[i].name,currentDocument:{updateTime:documents[i].updateTime}});
});
test('cleanup refuses catalog data, accounts, audit history, other projects, duplicates and unversioned documents',() => {
    for (const relative of ['tumbas/a','cemeteries/a','_accountProfiles/a','_userAudit/a/events/b','_databaseAudit/a','correction_requests/a/other/b']) {
        assert.throws(() => deletionWrites({projectId,documents:[doc(relative)]},projectId));
    }
    assert.throws(() => deletionWrites({projectId:'other',documents:[]},projectId));
    assert.throws(() => deletionWrites({projectId,documents:[{...doc('correction_requests/a'),updateTime:null}]},projectId));
    assert.throws(() => deletionWrites({projectId,documents:[doc('correction_requests/a'),doc('correction_requests/a')]},projectId));
});
