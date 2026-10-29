/* The installed app and PWA check the published version without cached metadata. */
(() => {
    const origin = 'https://buscatumbas.lat';
    const legacy = ['buscatumbas-2e7cc.web.app', 'buscatumbas-2e7cc.firebaseapp.com'];
    if (legacy.includes(window.location.hostname)) {
        window.location.replace(origin + window.location.pathname + window.location.search + window.location.hash);
        return;
    }
    if (window.location.origin !== origin) return;
    let checking = false;
    let notice;
    async function checkPublishedVersion() {
        if (checking || navigator.onLine === false || document.visibilityState === 'hidden') return;
        checking = true;
        try {
            const response = await fetch(origin + '/version.json', {cache: 'no-store', signal: AbortSignal.timeout(10000)});
            if (!response.ok) return;
            const version = await response.json();
            if (!Number.isInteger(version.mayor) || !Number.isInteger(version.menor)) return;
            const current = typeof APP_VERSION === 'string' ? APP_VERSION.match(/^v?(\d+)\.(\d+)\./) : null;
            if (!current || version.mayor < Number(current[1]) ||
                (version.mayor === Number(current[1]) && version.menor <= Number(current[2]))) return;
            if (notice) return;
            notice = document.createElement('div');
            notice.className = 'alert alert-info m-2';
            notice.setAttribute('role', 'status');
            notice.style.cssText = 'position:fixed;bottom:80px;left:8px;right:8px;z-index:12000';
            const text = document.createElement('span');
            text.textContent = 'Hay una nueva versión disponible. Guarda tu aportación antes de actualizar. ';
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn-primary btn-sm';
            button.textContent = 'Actualizar';
            button.onclick = () => {
                if (!window.confirm('¿Cargar la versión publicada? Los cambios sin guardar se perderán.')) return;
                const url = new URL(window.location.href);
                url.searchParams.set('app_version', version.mayor + '.' + version.menor);
                window.location.replace(url.href);
            };
            notice.append(text, button);
            document.body.append(notice);
        } catch (error) {
            console.warn('No se pudo comprobar la versión publicada.', error);
        } finally {
            checking = false;
        }
    }
    window.addEventListener('pageshow', checkPublishedVersion);
    window.addEventListener('online', checkPublishedVersion);
    document.addEventListener('visibilitychange', checkPublishedVersion);
    checkPublishedVersion();
})();
