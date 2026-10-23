import {createRequire} from 'node:module';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const queues = ['correction_requests', '_duplicateDisputes', '_errorReviews'];

export function deletionWrites(snapshot, projectId) {
    if (snapshot.projectId !== projectId || !Array.isArray(snapshot.documents)) throw Error('INVALID_BACKUP');
    const prefix = `projects/${projectId}/databases/(default)/documents/`;
    const seen = new Set();
    return snapshot.documents.map(doc => {
        const relative = doc.name?.startsWith(prefix) ? doc.name.slice(prefix.length) : '';
        const parts = relative.split('/');
        const allowed = queues.includes(parts[0]) && parts.length === 2 ||
            parts[0] === '_errorReviews' && parts.length === 4 && parts[2] === 'reporters';
        if (!allowed || parts.some(part => !part || part === '.' || part === '..') || !doc.updateTime || seen.has(doc.name)) throw Error('UNSAFE_DELETE_PLAN');
        seen.add(doc.name);
        return {delete:doc.name,currentDocument:{updateTime:doc.updateTime}};
    });
}

async function main() {
    const [mode,backupPath] = process.argv.slice(2);
    if (!['--inspect','--apply'].includes(mode) || (mode === '--apply' && !backupPath)) throw Error('USE_INSPECT_OR_APPLY_BACKUP');
    process.env.DEBUG = '';
    const require = createRequire(import.meta.url);
    const cli = require('firebase-tools/lib/auth');
    const operator = cli.getProjectDefaultAccount(root);
    if (!operator?.tokens?.refresh_token) throw Error('FIREBASE_LOGIN_REQUIRED');
    const projectId = JSON.parse(await readFile(path.join(root,'.firebaserc'),'utf8')).projects.default;
    if (projectId !== 'buscatumbas-2e7cc') throw Error('UNEXPECTED_PROJECT');
    const credential = await cli.getAccessToken(operator.tokens.refresh_token,
        ['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
    const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    async function api(suffix,body) {
        const response = await fetch(base + suffix,{method:body ? 'POST' : 'GET',
            headers:{Authorization:`Bearer ${credential.access_token}`,'Content-Type':'application/json'},
            ...(body ? {body:JSON.stringify(body)} : {})});
        if (!response.ok) throw Error(`FIRESTORE_${response.status}: ${await response.text()}`);
        return response.json();
    }
    async function list(collection) {
        const docs=[];let token='';
        do {
            const page=await api(`/${collection}?pageSize=1000${token ? '&pageToken=' + encodeURIComponent(token) : ''}`);
            docs.push(...(page.documents || []));token=page.nextPageToken || '';
        } while(token);
        return docs;
    }
    if (mode === '--inspect') {
        const snapshot={projectId,createdAt:new Date().toISOString(),documents:[],counts:{}};
        for (const collection of queues) {
            const docs=await list(collection);
            snapshot.counts[collection]=docs.length;
            snapshot.documents.push(...docs);
        }
        // A collection-group query also includes reporters below already absent review documents.
        const reporters=await api(':runQuery',{structuredQuery:{from:[{collectionId:'reporters',allDescendants:true}]}});
        const children=reporters.map(row => row.document).filter(doc => doc?.name.startsWith(base.replace('https://firestore.googleapis.com/v1/','') + '/_errorReviews/'));
        snapshot.documents.unshift(...children);
        snapshot.counts.reporters=children.length;
        for (const collection of ['tumbas','cemeteries']) snapshot.counts[`preserved_${collection}`]=(await list(collection)).length;
        deletionWrites(snapshot,projectId);
        await mkdir(path.join(root,'.record-audit'),{recursive:true});
        const output=path.join(root,'.record-audit',`test-inbox-before-${snapshot.createdAt.replace(/[:.]/g,'-')}.json`);
        await writeFile(output,JSON.stringify(snapshot,null,2),{flag:'wx'});
        console.log(JSON.stringify({backup:output,counts:snapshot.counts,plannedDeletes:snapshot.documents.length},null,2));
    } else {
        const resolved=path.resolve(root,backupPath);
        if (!resolved.startsWith(path.join(root,'.record-audit') + path.sep) || !path.basename(resolved).startsWith('test-inbox-before-')) throw Error('INVALID_BACKUP_PATH');
        const snapshot=JSON.parse(await readFile(resolved,'utf8'));
        const writes=deletionWrites(snapshot,projectId);
        let deleted=0;
        for (let offset=0;offset<writes.length;offset+=200) {
            await api(':commit',{writes:writes.slice(offset,offset+200)});
            deleted+=Math.min(200,writes.length-offset);
        }
        const remaining={};
        for (const collection of queues) remaining[collection]=(await list(collection)).length;
        const receipt={projectId,completedAt:new Date().toISOString(),backup:resolved,deleted,remaining};
        await writeFile(resolved.replace('before-','receipt-'),JSON.stringify(receipt,null,2),{flag:'wx'});
        console.log(JSON.stringify(receipt,null,2));
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {console.error(error.message);process.exitCode=1;});
}
