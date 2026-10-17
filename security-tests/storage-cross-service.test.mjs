import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureStorageFirestorePermission} from '../scripts/storage-cross-service.mjs';

test('read-only checks do not change IAM and apply grants only the required role to the Storage agent', async () => {
    const calls = [];
    let present = false;
    const manager = {
        serviceAccountHasRoles: async (...args) => {calls.push(['check', ...args]); return present;},
        addServiceAccountToRoles: async (...args) => {calls.push(['grant', ...args]); present = true;}
    };
    assert.equal((await ensureStorageFirestorePermission(manager, '123')).present, false);
    assert.equal(calls.filter(call => call[0] === 'grant').length, 0);
    assert.equal((await ensureStorageFirestorePermission(manager, '123', true)).changed, true);
    assert.deepEqual(calls.find(call => call[0] === 'grant'), ['grant', '123',
        'service-123@gcp-sa-firebasestorage.iam.gserviceaccount.com', ['roles/firebaserules.firestoreServiceAgent'], true]);
    assert.equal((await ensureStorageFirestorePermission(manager, '123', true)).changed, false);
    assert.equal(calls.filter(call => call[0] === 'grant').length, 1);
});

test('invalid project numbers and an unverifiable grant fail', async () => {
    await assert.rejects(ensureStorageFirestorePermission({}, 'not-a-number', true), /INVALID_PROJECT_NUMBER/);
    const manager = {serviceAccountHasRoles: async () => false, addServiceAccountToRoles: async () => {}};
    await assert.rejects(ensureStorageFirestorePermission(manager, '123', true), /STORAGE_PERMISSION_VERIFICATION_FAILED/);
});
