/* Temporary browser installation while the Play Store release is prepared. */
(() => {
    'use strict';
    const native = window.Capacitor?.isNativePlatform?.() === true;
    const enabled = document.documentElement.dataset.temporaryInstall !== 'off';
    const actions = [...document.querySelectorAll('[data-pwa-install-action]')];
    const dialog = document.getElementById('pwa-install-dialog');
    if (native || !enabled || !dialog) { actions.forEach(button => button.hidden = true); return; }
    const seenKey = 'buscatumbas_pwa_install_seen_v1';
    const standalone = window.matchMedia('(display-mode: standalone)');
    const ios = /iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const mobile = ios || /Android|Mobile/i.test(navigator.userAgent);
    const embedded = /FBAN|FBAV|Instagram|; wv\)/i.test(navigator.userAgent);
    const primary = document.getElementById('pwa-install-confirm');
    const instructions = document.getElementById('pwa-install-instructions');
    const status = document.getElementById('pwa-install-status');
    let deferredPrompt = null;
    let busy = false;
    let installedEvent = false;
    let installing = false;
    let firstVisitPending = true;
    try { firstVisitPending = localStorage.getItem(seenKey) !== 'seen'; } catch { /* Session-only fallback. */ }
    const installed = () => installedEvent || standalone.matches || navigator.standalone === true;
    const remember = () => {
        firstVisitPending = false;
        try { localStorage.setItem(seenKey, 'seen'); } catch { /* Storage may be unavailable. */ }
    };
    function render() {
        // Keep a way back to installation even after uninstalling or dismissing
        // the offer: the browser may delay or withhold beforeinstallprompt.
        const available = !installed() && !installing;
        const label = ios ? 'Agregar a pantalla de inicio' : 'Instalar app';
        actions.forEach(button => {
            button.hidden = !available;
            button.setAttribute('aria-hidden', String(!available));
            button.setAttribute('aria-label', label);
            const text = button.querySelector('[data-pwa-install-label]');
            if (text) text.textContent = label;
        });
        primary.hidden = ios || !deferredPrompt || installed() || installing;
        primary.disabled = busy;
        instructions.textContent = ios
            ? 'En Safari, abre Compartir y elige Agregar a pantalla de inicio. Si aparece Abrir como app web, actívalo y toca Agregar. Si estás dentro de otra aplicación, abre primero esta página en Safari.'
            : embedded
                ? 'Abre esta página en Chrome o en el navegador de tu teléfono. Después utiliza su menú para elegir Instalar aplicación o Agregar a pantalla de inicio.'
                : deferredPrompt
                    ? 'Toca Instalar app y confirma en el aviso de tu navegador. Tendrás el icono de Busca Tumbas en tu teléfono.'
                    : 'En el menú de tu navegador, busca Instalar aplicación o Agregar a pantalla de inicio. Si todavía no aparece la opción, puedes seguir usando la web y volver a tocar Instalar app más tarde.';
        if (installed() && dialog.open) dialog.close();
    }
    function openOffer() {
        if (installed() || installing) return;
        render();
        status.textContent = '';
        if (!dialog.open) dialog.showModal();
        remember();
    }
    function firstVisit() {
        if (mobile && firstVisitPending && !installed() && !installing) openOffer();
    }
    async function installFromClick() {
        if (busy || installed() || installing) return;
        if (ios || !deferredPrompt) { openOffer(); return; }
        const prompt = deferredPrompt;
        busy = true;
        render();
        try {
            await prompt.prompt();
            const choice = await prompt.userChoice;
            installing = choice.outcome === 'accepted' && !installedEvent;
            if (dialog.open) dialog.close();
        } catch {
            status.textContent = 'El navegador no pudo abrir la instalación. Usa las instrucciones de su menú o vuelve a intentarlo más tarde.';
            if (!dialog.open) dialog.showModal();
        } finally {
            if (deferredPrompt === prompt) deferredPrompt = null;
            busy = false;
            render();
        }
    }
    actions.forEach(button => button.addEventListener('click', () => deferredPrompt && !ios ? installFromClick() : openOffer()));
    primary.addEventListener('click', installFromClick);
    document.getElementById('pwa-install-dismiss').addEventListener('click', () => { remember(); dialog.close(); });
    dialog.addEventListener('cancel', remember);
    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        if (installed()) return;
        deferredPrompt = event;
        installing = false;
        render();
    });
    window.addEventListener('appinstalled', () => {
        installedEvent = true;
        installing = false;
        deferredPrompt = null;
        remember();
        render();
    });
    standalone.addEventListener?.('change', render);
    function resumeBrowserTab() {
        if (busy || standalone.matches || navigator.standalone === true) return;
        // Chrome can restore this page after an interrupted installation or an
        // uninstall. An earlier appinstalled event is not proof it is still installed.
        installedEvent = false;
        installing = false;
        render();
    }
    window.addEventListener('pageshow', event => {
        if (event.persisted) resumeBrowserTab();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') resumeBrowserTab();
    });
    window.addEventListener('buscatumbas:ready', firstVisit);
    window.addEventListener('load', () => window.setTimeout(firstVisit, 3500), {once: true});
    render();
    if (!installed() && 'serviceWorker' in navigator && window.isSecureContext) {
        navigator.serviceWorker.register('sw.js', {scope: './', updateViaCache: 'none'})
            .catch(error => console.warn('No se pudo preparar la instalación web.', error));
    }
})();
