/* Manual preparation only. No FamilySearch API calls or credentials. */
((root, factory) => {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.BuscaTumbasFamilySearch = api;
})(typeof window === 'object' ? window : globalThis, root => {
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
        setTimeout: later = globalThis.setTimeout, AbortController: Abort = globalThis.AbortController,
        nativeDownloads = root.Capacitor?.isNativePlatform() ? root.Capacitor.registerPlugin('PublicDownloads') : null,
        nativeHttp = root.Capacitor?.isNativePlatform() ? root.Capacitor.registerPlugin('CapacitorHttp') : null}) {
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
            node('open-download').hidden = true;
            node('share-photo').hidden = true;
        }
        function close() { if (dialog.open) dialog.close(); reset(); }
        function requireState() {
            if (!valid()) { close(); throw new Error('Vuelve a iniciar sesión y abre la fotografía.'); }
            return state;
        }
        async function save(blob, filename) {
            if (nativeDownloads) {
                const bytes = new Uint8Array(await blob.arrayBuffer());
                let binary = '';
                for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
                const saved = await nativeDownloads.saveFile({filename, mimeType: blob.type.split(';')[0], data: root.btoa(binary)});
                if (saved.bytes !== blob.size || !saved.uri || !saved.path) throw new Error('El guardado no pudo verificarse.');
                return {...saved, native: true};
            }
            if (typeof root.File === 'function' && typeof navigator.canShare === 'function' && typeof navigator.share === 'function') {
                const file = new root.File([blob], filename, {type: blob.type});
                if (navigator.canShare({files: [file]})) return {shareFile: file};
            }
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
                    if (nativeHttp) {
                        const result = await nativeHttp.request({method: 'GET', url: current.draft.imageUrl, responseType: 'arraybuffer', connectTimeout: 15000, readTimeout: 30000});
                        if (typeof result.data !== 'string' || result.data.length > 12 * 1024 * 1024) throw new Error('Invalid native response');
                        const mime = Object.entries(result.headers || {}).find(([key]) => key.toLowerCase() === 'content-type')?.[1]?.split(';')[0]?.trim();
                        const bytes = Uint8Array.from(root.atob(result.data), character => character.charCodeAt(0));
                        response = {ok: result.status >= 200 && result.status < 300, blob: async () => new Blob([bytes], {type: mime || ''})};
                    } else {
                        response = await fetch(current.draft.imageUrl, {credentials: 'omit', signal: current.abort.signal});
                    }
                    if (!response.ok) throw new Error('Foto no disponible');
                    const blob = await response.blob();
                    if (!valid(current)) return;
                    const extension = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}[blob.type];
                    if (!extension || blob.size === 0 || blob.size > 8 * 1024 * 1024) throw new Error('Archivo no válido');
                    const saved = await save(blob, `${current.draft.filename}.${extension}`);
                    if (!valid(current)) return;
                    if (saved?.native) {
                        current.savedPhoto = saved;
                        node('open-download').hidden = false;
                        node('status').textContent = 'Fotografía guardada y verificada en ' + saved.path + '. Puedes abrirla con el botón Abrir foto guardada.';
                    } else if (saved?.shareFile) {
                        current.shareFile = saved.shareFile;
                        node('share-photo').hidden = false;
                        node('status').textContent = 'Foto lista. Toca Guardar o compartir foto y elige Guardar imagen o Guardar en Archivos en el menú del iPhone.';
                    } else {
                        node('status').textContent = 'Descarga enviada al navegador. Revisa su lista de descargas para comprobar que finalizó.';
                    }
                } finally { globalThis.clearTimeout(timeout); }
            } catch (error) {
                if (valid(current)) node('status').textContent = error.code === 'SAVE_CANCELLED' ? 'Guardado cancelado. No se guardó la fotografía.' : nativeDownloads
                    ? 'No se pudo guardar la fotografía. Comprueba el espacio disponible y vuelve a intentarlo.'
                    : 'No se pudo descargar la foto. Toca Abrir foto original y utiliza Guardar imagen en el navegador.';
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
                node('status').textContent = 'El navegador no permitió copiar. El texto está seleccionado: mantén pulsado el texto y elige Copiar.';
            }
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
        node('share-photo').hidden = true;
        node('share-photo').addEventListener('click', async () => {
            let current;
            try {
                current = requireState();
                if (!current.shareFile) return;
                await navigator.share({files: [current.shareFile], title: current.draft.title, text: node('memory-description').value});
                if (valid(current)) node('status').textContent = 'La foto se entregó a la opción que elegiste en el menú de compartir.';
            } catch (error) {
                if (valid(current)) node('status').textContent = error.name === 'AbortError' ? 'Se cerró el menú sin compartir. Puedes volver a intentarlo.' : 'No se pudo compartir. Usa Abrir foto original para guardar la imagen desde Safari.';
            }
        });
        node('open-download').hidden = true;
        node('open-download').addEventListener('click', async () => {
            let current;
            try {
                current = requireState();
                if (current.savedPhoto) await nativeDownloads.openFile({uri: current.savedPhoto.uri});
            } catch { if (valid(current)) node('status').textContent = 'Abre Archivos y busca la foto en Descargas/Busca Tumbas.'; }
        });
        node('copy-title').addEventListener('click', () => copy('memory-title'));
        node('copy-description').addEventListener('click', () => copy('memory-description'));
        node('open-gallery').addEventListener('click', event => {
            if (!valid()) { event.preventDefault(); close(); }
        });
        return {open, close};
    }
    return {buildDraft, photoUrl, galleryUrl, createController};
});
