import { mkdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'www');
const cache = path.join(root, '.android-cache');
await mkdir(path.join(output, 'vendor'), { recursive: true });
await mkdir(cache, { recursive: true });
const pending = new Map();
function bundle(url) {
    if (pending.has(url)) return pending.get(url);
    const promise = (async () => {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') throw new Error('Recurso inseguro: ' + url);
        const filename = createHash('sha256').update(url).digest('hex').slice(0,20) + path.extname(parsed.pathname);
        const cached = path.join(cache, filename);
        try { await access(cached); } catch {
            console.log('Descargando ' + url);
            const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
            if (!response.ok) throw new Error(response.status + ': ' + url);
            await writeFile(cached, Buffer.from(await response.arrayBuffer()));
        }
        let bytes = await readFile(cached);
        if (filename.endsWith('.css')) {
            let css = bytes.toString('utf8');
            for (const match of [...css.matchAll(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g)]) {
                if (/^(data:|#)/.test(match[2])) continue;
                const resource = new URL(match[2], url);
                const hash = resource.hash;
                resource.hash = '';
                const local = await bundle(resource.href);
                css = css.replace(match[0], 'url("' + local + hash + '")');
            }
            bytes = Buffer.from(css);
        }
        await writeFile(path.join(output, 'vendor', filename), bytes);
        return filename;
    })();
    pending.set(url, promise);
    return promise;
}
let html = await readFile(path.join(root, 'index.html'), 'utf8');
html = html.replaceAll('npm/choices.js/', 'npm/choices.js@11.1.0/');
for (const match of [...html.matchAll(/(?:src|href)="(https:\/\/[^"]+)"/g)]) {
    const local = await bundle(match[1]);
    html = html.replaceAll(match[1], 'vendor/' + local);
}
await writeFile(path.join(output, 'index.html'), html);
for (const filename of ['mobile/app.css', 'mobile/app.js', 'privacy.html', 'delete-account.html', 'version.json', 'superuser-config.json', 'data/cemeteries-inegi-2026.json']) {
    await mkdir(path.dirname(path.join(output, filename)), { recursive: true });
    await copyFile(path.join(root, filename), path.join(output, filename));
}
console.log('Android preparado en www/. Firebase requiere conexión.');
