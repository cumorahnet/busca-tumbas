(() => {
    const menuGroups = [...document.querySelectorAll('.primary-navigation-group')];
    const contributionsMenu = document.getElementById('my-contributions-submenu');
    const contributionsToggle = document.querySelector('[aria-controls="my-contributions-submenu"]');
    function closeMenus(except = null) {
        menuGroups.forEach(group => { if (group !== except) group.open = false; });
        if (except !== contributionsToggle && contributionsMenu) {
            contributionsMenu.hidden = true;
            contributionsToggle?.setAttribute('aria-expanded', 'false');
        }
    }
    document.addEventListener('click', event => {
        const summary = event.target.closest('.primary-navigation-group > summary');
        const contributionAction = event.target.closest('[aria-controls="my-contributions-submenu"]');
        closeMenus(summary?.parentElement || contributionAction);
    }, true);
    const capacitor = window.Capacitor;
    const native = Boolean(capacitor?.isNativePlatform());
    document.documentElement.classList.toggle('native-app', native);
    if (!native) return;
    const status = document.createElement('div');
    status.id = 'connection-status';
    status.setAttribute('role', 'status');
    status.textContent = 'Sin conexión. Conéctate a internet para buscar, iniciar sesión o guardar.';
    document.body.append(status);
    const updateConnection = () => { status.hidden = navigator.onLine; };
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    updateConnection();
    const app = capacitor.registerPlugin('App');
    const visible = id => {
        const element = document.getElementById(id);
        return element && element.getClientRects().length > 0;
    };
    app.addListener('backButton', async () => {
        if (document.getElementById('familysearch-preparation-dialog')?.open) {
            document.getElementById('familysearch-dismiss').click();
            return;
        }
        if (visible('image-zoom-modal')) return closeImageZoom();
        if (visible('ia-modal')) return closeScanner();
        if (visible('record-detail-modal')) return closeRecordDetail();
        if (visible('back-to-mode-selection')) {
            if ((visible('add-tomb-section') || visible('add-cemetery-section')) &&
                !window.confirm('¿Volver al menú? Los cambios sin guardar se perderán.')) return;
            closeScanner();
            return showModeSelection();
        }
        if (visible('auth-name-wrapper')) return setAuthMode('login');
        await app.minimizeApp();
    }).catch(console.error);
    app.addListener('appStateChange', ({ isActive }) => {
        if (!isActive && visible('ia-modal')) closeScanner();
    }).catch(console.error);
})();
