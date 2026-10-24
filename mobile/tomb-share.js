((root, factory) => {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.BuscaTumbasSocialShare = api;
})(typeof window === 'object' ? window : globalThis, root => {
    'use strict';
    function buildDraft(tomb) {
        const name = tomb.nombre_finado || [tomb.nombres,tomb.apellido_paterno,tomb.apellido_materno].filter(Boolean).join(' ') || 'Nombre sin registrar';
        const location = [tomb.colonia_panteon,tomb.municipio_panteon,tomb.estado_panteon,tomb.pais_panteon].filter(Boolean).join(', ');
        const fields = [[tomb.fecha_nacimiento_estimada ? 'Nacimiento estimado' : 'Nacimiento',tomb.fecha_nacimiento],['Defunción',tomb.fecha_defuncion],['Lugar de sepultura',tomb.nombre_panteon],['Localidad',location]];
        return {title:name, text:[name,...fields.filter(([,v])=>v).map(([k,v])=>k+': '+v),'Compartido desde Busca Tumbas: https://buscatumbas.lat/'].join('\n'),filename:'lapida-'+String(tomb.id).replace(/[^a-z0-9_-]/gi,'').slice(0,128)};
    }
    function createController({document,navigator,fetchPhoto,getCurrentUser,URL:urls=root.URL,File:FileType=root.File}) {
        const node = id => document.getElementById('tomb-share-'+id);
        const dialog = node('dialog');
        let state = null;
        const valid = current => state === current && current && getCurrentUser()?.uid === current.uid && getCurrentUser()?.emailVerified === true;
        function close() {
            if (state) {state.abort.abort();if(state.url)urls.revokeObjectURL(state.url);}
            state=null;node('photo').removeAttribute('src');node('description').value='';if(dialog.open)dialog.close();
        }
        async function open(tomb) {
            close();
            const user=getCurrentUser();if(!user?.emailVerified)throw Error('Inicia sesión para compartir la fotografía.');
            const current={uid:user.uid,draft:buildDraft(tomb),abort:new AbortController(),busy:false};state=current;
            node('description').value=current.draft.text;node('send').disabled=true;node('download').disabled=true;node('send').hidden=true;
            node('status').textContent='Preparando la fotografía…';dialog.showModal();
            const timeout=setTimeout(()=>current.abort.abort(),30000);
            try {
                const response=await fetchPhoto({recordId:tomb.id,signal:current.abort.signal});
                if(!response.ok)throw Error('photo');
                const blob=await response.blob();if(!valid(current))return;
                const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[blob.type.split(';')[0].trim().toLowerCase()];
                if(!ext||!blob.size||blob.size>8*1024*1024)throw Error('photo');
                current.filename=current.draft.filename+'.'+ext;
                current.url=urls.createObjectURL(blob);node('photo').src=current.url;node('photo').alt='Fotografía de '+current.draft.title;
                if(typeof FileType==='function')current.file=new FileType([blob],current.filename,{type:blob.type});
                const canShare=!!(current.file&&navigator.share&&navigator.canShare?.({files:[current.file]}));
                node('send').hidden=!canShare;node('send').disabled=false;node('download').disabled=false;
                node('status').textContent=canShare?'Foto lista. Elige Compartir foto y descripción. Algunas redes solo reciben la imagen; puedes copiar el texto para añadirlo.':'Este navegador no permite adjuntar fotos a otras apps. Descarga la foto y copia la descripción para publicarlas en tu red social.';
            } catch(error) {
                if(valid(current))node('status').textContent='No se pudo preparar la fotografía. Cierra este aviso y vuelve a intentarlo. Puedes copiar la descripción.';
            } finally {clearTimeout(timeout);}
        }
        node('send').addEventListener('click',async()=>{
            const current=state;if(!valid(current)){close();return;}if(!current.file||current.busy)return;
            current.busy=true;node('send').disabled=true;
            try {await navigator.share({files:[current.file],title:current.draft.title,text:node('description').value});}
            catch(error){if(valid(current)&&error.name!=='AbortError')node('status').textContent='No se pudo abrir el menú de compartir. Puedes descargar la foto y copiar la descripción.';}
            finally{if(valid(current)){current.busy=false;node('send').disabled=false;}}
        });
        node('copy').addEventListener('click',async()=>{
            const current=state;if(!valid(current)){close();return;}
            try {await navigator.clipboard.writeText(node('description').value);if(valid(current))node('status').textContent='Descripción copiada. Pégala junto a la foto en tu publicación.';}
            catch{if(valid(current)){node('description').focus();node('description').select();node('status').textContent='Selecciona y copia la descripción.';}}
        });
        node('download').addEventListener('click',()=>{
            const current=state;if(!valid(current)){close();return;}if(!current.url)return;
            const link=document.createElement('a');link.href=current.url;link.download=current.filename;dialog.append(link);link.click();link.remove();
            node('status').textContent='Descarga enviada al navegador. Revisa tus descargas y adjunta la foto a tu publicación.';
        });
        node('dismiss').addEventListener('click',close);dialog.addEventListener('cancel',close);
        return {open,close};
    }
    return {buildDraft,createController};
});
