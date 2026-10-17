import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {randomUUID, randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const requireFunctions = createRequire(path.join(root, 'functions/package.json'));

async function main() {
    if (!['--run', '--cleanup-tests'].includes(process.argv[2]) || process.argv.length !== 3) throw new Error('EXPECTED_RUN_OR_CLEANUP_TESTS');
    process.env.DEBUG = '';
    const projectId = JSON.parse(await readFile(path.join(root, '.firebaserc'), 'utf8')).projects.default;
    const html = await readFile(path.join(root, 'index.html'), 'utf8');
    const apiKey = html.match(/apiKey:\s*"([^"]+)"/)?.[1];
    const bucket = html.match(/storageBucket:\s*"([^"]+)"/)?.[1];
    if (!apiKey || !bucket || !bucket.startsWith(projectId + '.')) throw new Error('INVALID_PROJECT_CONFIG');
    const cliAuth = require('firebase-tools/lib/auth');
    const account = cliAuth.getProjectDefaultAccount(root);
    if (!account?.tokens?.refresh_token) throw new Error('FIREBASE_LOGIN_REQUIRED');
    const credential = {async getAccessToken() {
        const token = await cliAuth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase']);
        return {access_token: token.access_token, expires_in: Math.max(1, Math.floor((token.expires_at - Date.now()) / 1000))};
    }};
    const {initializeApp, deleteApp} = requireFunctions('firebase-admin/app');
    const {getAuth} = requireFunctions('firebase-admin/auth');
    const app = initializeApp({projectId, storageBucket: bucket, credential}, 'verify-storage-upload');
    const moderationRequest = async (uid, method, body) => {
        const {access_token: token} = await credential.getAccessToken();
        const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/_moderation/${uid}`, {
            method, headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
            ...(body ? {body: JSON.stringify(body)} : {})
        });
        if (!response.ok && !(method === 'DELETE' && response.status === 404)) throw new Error(`MODERATION_REQUEST_${response.status}`);
        await response.arrayBuffer();
    };
    const cleanup = async uid => {
        const results = await Promise.allSettled([
            ...['cemetery_images', 'tumbas_images'].map(async folder => {
                const {access_token: token} = await credential.getAccessToken();
                const name = `${folder}/${uid}/check.jpg`;
                const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(name)}`, {
                    method: 'DELETE', headers: {Authorization: `Bearer ${token}`}
                });
                if (![200, 204, 404].includes(response.status)) throw new Error(`CLEANUP_STORAGE_${response.status}`);
                await response.arrayBuffer();
            }),
            moderationRequest(uid, 'DELETE'),
            getAuth(app).deleteUser(uid).catch(error => { if (error.code !== 'auth/user-not-found') throw error; })
        ]);
        if (results.some(result => result.status === 'rejected')) throw new Error(`TEST_CLEANUP_FAILED_${uid}`);
    };
    if (process.argv[2] === '--cleanup-tests') {
        try {
            let nextPageToken;
            do {
                const page = await getAuth(app).listUsers(1000, nextPageToken);
                for (const user of page.users) {
                    if (/^storage-check-[0-9a-f-]{36}$/.test(user.uid) && user.email === `${user.uid}@example.invalid` &&
                        Date.parse(user.metadata.creationTime) > Date.now() - 3600000) {
                        await cleanup(user.uid);
                        console.log(`Cuenta temporal y datos eliminados: ${user.uid}`);
                    }
                }
                nextPageToken = page.pageToken;
            } while (nextPageToken);
        } finally { await deleteApp(app); }
        return;
    }
    const uid = `storage-check-${randomUUID()}`;
    const email = `${uid}@example.invalid`;
    const password = randomBytes(24).toString('base64url');
    const paths = [`cemetery_images/${uid}/check.jpg`, `tumbas_images/${uid}/check.jpg`];
    try {
        await getAuth(app).createUser({uid, email, password, emailVerified: true});
        const session = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({email, password, returnSecureToken: true})
        });
        if (!session.ok) throw new Error(`AUTH_SIGN_IN_FAILED_${session.status}`);
        const {idToken} = await session.json();
        const upload = async (name, expected, contentType = 'image/jpeg', authenticated = true) => {
            const response = await fetch(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(name)}`, {
                method: 'POST', headers: {'Content-Type': contentType, ...(authenticated ? {Authorization: `Firebase ${idToken}`} : {})},
                body: new Uint8Array([255, 216, 255, 217])
            });
            if (response.status !== expected) throw new Error(`STORAGE_EXPECTED_${expected}_GOT_${response.status}`);
            await response.arrayBuffer();
        };
        for (const name of paths) await upload(name, 200);
        console.log('OK: subida JPEG autorizada para fotografías de lugares y lápidas.');
        await upload(paths[0], 403, 'image/jpeg', false);
        await upload(`cemetery_images/foreign-${uid}/check.jpg`, 403);
        await upload(paths[0], 403, 'image/png');
        console.log('OK: se bloquean subidas anónimas, rutas ajenas y formatos no permitidos.');
        await moderationRequest(uid, 'PATCH', {fields: {suspendedUntil: {timestampValue: new Date(Date.now() + 60000).toISOString()}}});
        await upload(paths[0], 403);
        await moderationRequest(uid, 'DELETE');
        await upload(paths[0], 200);
        console.log('OK: Storage consulta la suspensión en Firestore y permite subir tras levantarla.');
    } finally {
        try { await cleanup(uid); } finally { await deleteApp(app); }
        console.log('Cuenta temporal, fotografías y documento de prueba eliminados.');
    }
}

main().catch(error => {
    console.error(error.message || 'STORAGE_VERIFICATION_FAILED');
    process.exitCode = 1;
});
