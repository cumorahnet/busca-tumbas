/* Safari keeps its layout viewport behind the keyboard; fit overlays to the visible area. */
(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const style = document.documentElement.style;
    function update() {
        const active = document.activeElement;
        const editing = /^(INPUT|TEXTAREA|SELECT)$/.test(active?.tagName || '') || active?.isContentEditable;
        const keyboard = editing && viewport.scale <= 1.05 && window.innerHeight - viewport.height > 120;
        if (!keyboard) {
            for (const key of ['--app-visible-height','--app-visible-top','--app-hidden-bottom']) style.removeProperty(key);
            return;
        }
        const top = Math.max(0, viewport.offsetTop);
        style.setProperty('--app-visible-height', viewport.height + 'px');
        style.setProperty('--app-visible-top', top + 'px');
        style.setProperty('--app-hidden-bottom', Math.max(0, window.innerHeight - viewport.height - top) + 'px');
    }
    for (const name of ['resize','scroll']) viewport.addEventListener(name, update, {passive: true});
    for (const name of ['focusin','focusout']) document.addEventListener(name, update);
    window.addEventListener('resize', update, {passive: true});
    update();
})();
