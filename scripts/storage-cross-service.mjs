import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const role = 'roles/firebaserules.firestoreServiceAgent';

export async function ensureStorageFirestorePermission(manager, projectNumber, apply = false) {
    if (!/^\d+$/.test(String(projectNumber))) throw new Error('INVALID_PROJECT_NUMBER');
    const serviceAccount = `service-${projectNumber}@gcp-sa-firebasestorage.iam.gserviceaccount.com`;
    const present = await manager.serviceAccountHasRoles(projectNumber, serviceAccount, [role], true);
    if (!present && apply) {
        await manager.addServiceAccountToRoles(projectNumber, serviceAccount, [role], true);
        if (!await manager.serviceAccountHasRoles(projectNumber, serviceAccount, [role], true)) {
            throw new Error('STORAGE_PERMISSION_VERIFICATION_FAILED');
        }
    }
    return {serviceAccount, role, present: present || apply, changed: !present && apply};
}

async function main() {
    const mode = process.argv[2] || '--check';
    if (!['--check', '--apply'].includes(mode) || process.argv.length > 3) throw new Error('EXPECTED_CHECK_OR_APPLY');
    process.env.DEBUG = '';
    const project = JSON.parse(await readFile(path.join(root, '.firebaserc'), 'utf8')).projects.default;
    const cliAuth = require('firebase-tools/lib/auth');
    const account = cliAuth.getProjectDefaultAccount(root);
    if (!account?.tokens) throw new Error('FIREBASE_LOGIN_REQUIRED');
    const options = {project, nonInteractive: true, user: account.user, tokens: account.tokens};
    await require('firebase-tools/lib/requireAuth').requireAuth(options);
    const projectNumber = await require('firebase-tools/lib/getProjectNumber').getProjectNumber(options);
    const result = await ensureStorageFirestorePermission(require('firebase-tools/lib/gcp/resourceManager'), projectNumber, mode === '--apply');
    console.log(JSON.stringify({project, ...result}, null, 2));
    if (!result.present) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error(error.message || 'STORAGE_PERMISSION_CHECK_FAILED');
        process.exitCode = 1;
    });
}
