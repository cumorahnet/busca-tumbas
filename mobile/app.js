(() => {
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
