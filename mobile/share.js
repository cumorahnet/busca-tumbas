/* Share only the public entry point, never the current URL or account data. */
(() => {
    'use strict';
    const url = 'https://buscatumbas.lat/';
    const dialog = document.getElementById('app-share-dialog');
    if (!dialog) return;
    const input = document.getElementById('app-share-url');
    const status = document.getElementById('app-share-status');
    const copy = document.getElementById('app-share-copy');
    let sharing = false;
    function offerCopy() {
        input.value = url;
        status.textContent = '';
        if (!dialog.open) dialog.showModal();
        input.focus();
        input.select();
    }
    async function share() {
        if (sharing) return;
        if (typeof navigator.share !== 'function') { offerCopy(); return; }
        sharing = true;
        try {
            await navigator.share({title: 'Busca Tumbas', text: 'Descubre y comparte historias en Busca Tumbas. Visita la p\u00e1gina y consulta el cat\u00e1logo sin crear una cuenta.', url});
        } catch (error) {
            if (error.name !== 'AbortError') offerCopy();
        } finally { sharing = false; }
    }
    document.querySelectorAll('[data-app-share]').forEach(button => {
        button.hidden = false;
        button.addEventListener('click', share);
    });
    copy.addEventListener('click', async () => {
        copy.disabled = true;
        try {
            await navigator.clipboard.writeText(url);
            status.textContent = 'Liga copiada. Ya puedes pegarla en tus redes sociales o mensajes.';
        } catch {
            input.focus();
            input.select();
            status.textContent = 'Selecciona y copia la liga para pegarla en tus redes sociales o mensajes.';
        } finally { copy.disabled = false; }
    });
    document.getElementById('app-share-dismiss').addEventListener('click', () => dialog.close());
})();
