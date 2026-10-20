/* Manual preparation only. No FamilySearch API calls or credentials. */
((root, factory) => {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.BuscaTumbasFamilySearch = api;
})(typeof window === 'object' ? window : globalThis, () => {
    'use strict';
    const galleryUrl = 'https://www.familysearch.org/es/memories/gallery';
    const clean = value => typeof value === 'string' ? value.trim() : '';
    function photoUrl(value) {
        try {
            const url = new URL(value);
            return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
        } catch { return ''; }
    }
    function buildDraft(tomb, user) {
        if (!user?.uid || user.emailVerified !== true || !tomb ||
            tomb.type === 'cemetery') {
            throw new Error('Inicia sesión con una cuenta verificada para preparar fotografías de lápidas.');
        }
        const imageUrl = photoUrl(tomb.imageUrl);
        if (!imageUrl) throw new Error('Esta aportación no tiene una fotografía disponible.');
        const name = clean(tomb.nombre_finado) ||
            [tomb.nombres, tomb.apellido_paterno, tomb.apellido_materno].map(clean).filter(Boolean).join(' ');
        const title = name ? `Lápida de ${name}` : 'Fotografía de lápida';
        const location = [tomb.colonia_panteon, tomb.municipio_panteon, tomb.estado_panteon, tomb.pais_panteon]
            .map(clean).filter(Boolean).join(', ');
        const fields = [
            [tomb.fecha_nacimiento_estimada ? 'Nacimiento estimado' : 'Nacimiento', clean(tomb.fecha_nacimiento)],
            ['Defunción', clean(tomb.fecha_defuncion)],
            ['Lugar de sepultura', clean(tomb.nombre_panteon)],
            ['Localidad', location],
            ['Fotografía aportada por', clean(tomb.contributor_name) || ((tomb.contributorId || tomb.userId) === user.uid ? clean(user.displayName) : '') || 'Colaborador de Busca Tumbas']
        ];
        const description = [name ? `Fotografía de la lápida de ${name}.` : 'Fotografía de una lápida.', '',
            ...fields.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`), '',
            'Preparado desde Busca Tumbas: https://buscatumbas-2e7cc.web.app/'].join('\n');
        const filename = (name || 'lapida').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 100) || 'lapida';
        return {title, description, imageUrl, filename: `lapida-${filename.toLowerCase()}`};
    }
    function createController({document, navigator, fetch, URL: urls, getCurrentUser,
        setTimeout: later = globalThis.setTimeout, AbortController: Abort = globalThis.AbortController}) {
        const node = id => document.getElementById(`familysearch-${id}`);
        const dialog = node('preparation-dialog');
        let state = null;
        function valid(current = state) {
            const user = getCurrentUser();
            return current && state === current && user?.uid === current.uid && user.emailVerified === true;
        }
        function reset() {
            state?.abort?.abort();
            state = null;
            node('photo').removeAttribute('src');
            node('original-photo').removeAttribute('href');
            node('memory-title').value = '';
            node('memory-description').value = '';
            node('status').textContent = '';
            node('download-photo').disabled = false;
        }
        function close() { if (dialog.open) dialog.close(); reset(); }
        function requireState() {
            if (!valid()) { close(); throw new Error('Vuelve a iniciar sesión y abre la fotografía.'); }
            return state;
        }
        function save(blob, filename) {
            const url = urls.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.append(link);
            link.click();
            link.remove();
            later(() => urls.revokeObjectURL(url), 1000);
        }
        async function downloadPhoto() {
            let current;
            try {
                current = requireState();
                if (current.downloading) return;
                current.downloading = true;
                current.abort = new Abort();
                node('download-photo').disabled = true;
                node('status').textContent = 'Preparando la descarga…';
                const timeout = later(() => current.abort?.abort(), 30000);
                let response;
                try {
                    response = await fetch(current.draft.imageUrl,
                        {credentials: 'omit', signal: current.abort.signal});
                    if (!response.ok) throw new Error('Foto no disponible');
                    const blob = await response.blob();
                    if (!valid(current)) return;
                    const extension = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}[blob.type];
                    if (!extension || blob.size === 0 || blob.size > 8 * 1024 * 1024) throw new Error('Archivo no válido');
                    save(blob, `${current.draft.filename}.${extension}`);
                    node('status').textContent = 'Descarga iniciada. Busca la fotografía en Descargas de tu dispositivo.';
                } finally { globalThis.clearTimeout(timeout); }
            } catch {
                if (valid(current)) node('status').textContent = 'No se pudo descargar la foto. Toca Abrir foto original y utiliza Guardar imagen en el navegador.';
            } finally {
                if (valid(current)) {
                    current.downloading = false;
                    current.abort = null;
                    node('download-photo').disabled = false;
                }
            }
        }
        async function copy(field) {
            let current;
            try {
                current = requireState();
                const input = node(field);
                if (!input.value.trim()) { node('status').textContent = 'Escribe el texto antes de copiarlo.'; input.focus(); return; }
                await navigator.clipboard.writeText(input.value);
                if (valid(current)) node('status').textContent = field === 'memory-title' ? 'Título copiado.' : 'Descripción copiada.';
            } catch {
                if (!valid(current)) return;
                const input = node(field);
                input.focus(); input.select();
                node('status').textContent = 'El navegador no permitió copiar. El texto está seleccionado: usa Copiar o descarga los datos en texto.';
            }
        }
        function downloadText() {
            try {
                const current = requireState();
                const text = `${node('memory-title').value}\n\n${node('memory-description').value}\n`;
                save(new Blob([text], {type: 'text/plain;charset=utf-8'}), `${current.draft.filename}.txt`);
                node('status').textContent = 'Descarga de los datos iniciada.';
            } catch { /* Closed when the user's session is no longer valid. */ }
        }
        function open(tomb) {
            const user = getCurrentUser();
            const draft = buildDraft(tomb, user);
            close();
            state = {uid: user.uid, draft, abort: null, downloading: false};
            node('photo').src = draft.imageUrl;
            node('photo').alt = draft.title;
            node('original-photo').href = draft.imageUrl;
            node('memory-title').value = draft.title;
            node('memory-description').value = draft.description;
            node('open-gallery').href = galleryUrl;
            dialog.showModal();
        }
        node('dismiss').addEventListener('click', close);
        dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
        node('download-photo').addEventListener('click', downloadPhoto);
        node('copy-title').addEventListener('click', () => copy('memory-title'));
        node('copy-description').addEventListener('click', () => copy('memory-description'));
        node('download-text').addEventListener('click', downloadText);
        node('open-gallery').addEventListener('click', event => {
            if (!valid()) { event.preventDefault(); close(); }
        });
        return {open, close};
    }
    return {buildDraft, photoUrl, galleryUrl, createController};
});
