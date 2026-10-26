/* Administrative workspace. All mutations are authorized again by the server. */
const adminWorkspace = {tab:'tomb', filters:{}, page:0, userPages:[], userIndex:0, generation:0};
const adminTabs = {user:'Usuarios', tomb:'Tumbas / lápidas', cemetery:'Panteones', pending:'Pendientes'};
const adminNormalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
function adminAccountCreationDate(value) {
    const date = value ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? date.toLocaleString('es-MX') : 'Sin fecha';
}

function mountAdminConsole() {
    if (!isSuperuserActive()) return;
    const content = document.getElementById('admin-content');
    content.querySelector('details.mb-3')?.remove();
    content.querySelector('#admin-full-catalog')?.remove();
    const pending = document.createElement('section');
    pending.id = 'admin-pending-workspace';
    pending.setAttribute('aria-label', 'Revisiones pendientes');
    const disputes = document.getElementById('admin-duplicate-disputes');
    pending.append(disputes);
    while (content.firstChild) pending.append(content.firstChild);
    content.innerHTML = `<div class="admin-workspace">
        <nav class="admin-menu" aria-label="Administración">${Object.entries(adminTabs).map(([key,label]) =>
            `<button type="button" data-admin-tab="${key}" onclick="selectAdminTab('${key}')">${label}</button>`).join('')}</nav>
        <div class="admin-main"><div id="admin-list-workspace"></div><div id="admin-pending-host"></div></div></div>`;
    document.getElementById('admin-pending-host').append(pending);
    adminWorkspace.userPages = [];
    adminWorkspace.userIndex = 0;
    selectAdminTab(adminWorkspace.tab);
}

function selectAdminTab(tab) {
    if (!isSuperuserActive() || !Object.hasOwn(adminTabs, tab)) return;
    adminWorkspace.tab = tab;
    adminWorkspace.generation++;
    adminWorkspace.page = 0;
    document.querySelectorAll('[data-admin-tab]').forEach(button => {
        if (button.dataset.adminTab === tab) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    });
    document.getElementById('admin-pending-host').hidden = tab !== 'pending';
    const host = document.getElementById('admin-list-workspace');
    host.hidden = tab === 'pending';
    if (tab === 'pending') return;
    const filters = adminWorkspace.filters[tab] ||= {query:'',state:'',municipality:'',status:'all'};
    host.innerHTML = `<h5 class="fw-bold mb-3">${adminTabs[tab]}</h5>
        <form class="admin-toolbar" onsubmit="event.preventDefault(); searchAdminWorkspace()">
            <label for="admin-search">Buscar<input class="form-control" id="admin-search" type="search" maxlength="254" value="${escapeHtml(filters.query)}" placeholder="${tab === 'user' ? 'Nombre, correo o ID' : tab === 'tomb' ? 'Difunto, ID, panteón o colaborador' : 'Nombre, ID o localidad'}"></label>
            ${tab !== 'user' ? `<label for="admin-state">Estado<input class="form-control" id="admin-state" value="${escapeHtml(filters.state)}"></label>
            <label for="admin-municipality">Municipio<input class="form-control" id="admin-municipality" value="${escapeHtml(filters.municipality)}"></label>` : ''}
            <label for="admin-status">Situación<select class="form-select" id="admin-status">${(tab === 'user' ? [['all','Todas'],['active','Activas'],['disabled','Suspendidas']] :
                [['all','Todas'],['published','Publicadas / aprobadas'],['pending','Pendientes'],['rejected','Retiradas']]).map(([value,label]) => `<option value="${value}" ${filters.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
            <button class="btn btn-primary" type="submit">Buscar</button><button class="btn btn-outline-secondary" type="button" onclick="clearAdminWorkspaceSearch()">Limpiar</button>
        </form><div id="admin-workspace-results" aria-live="polite"></div>`;
    if (tab === 'user') loadAdminUsers();
    else renderAdminWorkspaceRecords();
}

function searchAdminWorkspace() {
    const tab = adminWorkspace.tab;
    adminWorkspace.filters[tab] = {query:document.getElementById('admin-search').value.trim(),
        state:document.getElementById('admin-state')?.value.trim() || '',
        municipality:document.getElementById('admin-municipality')?.value.trim() || '', status:document.getElementById('admin-status').value};
    adminWorkspace.page = 0;
    adminWorkspace.userPages = [];
    adminWorkspace.userIndex = 0;
    if (tab === 'user') loadAdminUsers(); else renderAdminWorkspaceRecords();
}

function clearAdminWorkspaceSearch() {
    delete adminWorkspace.filters[adminWorkspace.tab];
    adminWorkspace.userPages = [];
    adminWorkspace.userIndex = 0;
    selectAdminTab(adminWorkspace.tab);
}

function adminRecordButtons(type, id) {
    const args = `${inlineJsValue(type)}, ${inlineJsValue(id)}`;
    return `<div class="admin-row-actions"><button class="btn btn-sm btn-outline-primary" onclick="viewAdminRecord(${args})">Ver</button>
        <button class="btn btn-sm btn-outline-primary" onclick="showAdminRecordHistory(${args})">Historial</button>
        <button class="btn btn-sm btn-outline-primary" onclick="editAdminRecord(${args})">Editar</button>
        <button class="btn btn-sm btn-outline-danger" onclick="removeAdminWorkspaceRecord(${args})">Eliminar</button></div>`;
}

function renderAdminWorkspaceRecords() {
    const tab = adminWorkspace.tab;
    const filters = adminWorkspace.filters[tab];
    const records = adminContributionRecords.filter(record => record.type === tab &&
        (!filters.query || adminNormalize([record.id,record.person,record.cemetery,record.contributor,record.locality].join(' ')).includes(adminNormalize(filters.query))) &&
        (!filters.state || adminNormalize(record.state).includes(adminNormalize(filters.state))) &&
        (!filters.municipality || adminNormalize(record.municipality).includes(adminNormalize(filters.municipality))) &&
        (filters.status === 'all' || (filters.status === 'published' ? ['published','approved'].includes(record.status) : record.status === filters.status)));
    const totalPages = Math.max(1, Math.ceil(records.length / 20));
    adminWorkspace.page = Math.min(adminWorkspace.page, totalPages - 1);
    const rows = records.slice(adminWorkspace.page * 20, (adminWorkspace.page + 1) * 20);
    document.getElementById('admin-workspace-results').innerHTML = `<p class="small text-muted">${records.length} resultados</p>
        <div class="table-responsive"><table class="table align-middle admin-table"><thead><tr><th>${tab === 'tomb' ? 'Difunto' : 'Panteón'}</th><th>${tab === 'tomb' ? 'Fechas / panteón' : 'Ubicación'}</th><th>Colaborador</th><th>Situación</th><th>Acciones</th></tr></thead><tbody>
        ${rows.map(record => `<tr><td>${record.photoUrl ? `<img class="admin-thumb" src="${escapeHtml(safeImageUrl(record.photoUrl))}" alt="" loading="lazy">` : ''}<strong>${escapeHtml(tab === 'tomb' ? record.person : record.cemetery)}</strong><div class="small text-muted">ID: ${escapeHtml(record.id)}</div></td>
            <td data-label="${tab === 'tomb' ? 'Fechas / panteón' : 'Ubicación'}">${tab === 'tomb' ? `<div>${escapeHtml(record.birth || 'Sin fecha')} — ${escapeHtml(record.death || 'Sin fecha')}</div>${escapeHtml(record.cemetery)}` : `${escapeHtml([record.locality,record.municipality,record.state].filter(Boolean).join(', '))}<div class="small text-muted">${adminContributionRecords.filter(item => item.type === 'tomb' && item.cemeteryId === record.id).length} tumbas vinculadas</div>`}</td>
            <td data-label="Colaborador">${escapeHtml(record.contributor)}</td><td data-label="Situación">${escapeHtml(adminStatusLabel(record.status))}</td><td>${adminRecordButtons(tab, record.id)}</td></tr>`).join('') || '<tr><td colspan="5">No hay resultados con estos filtros.</td></tr>'}
        </tbody></table></div><div class="admin-pagination"><button class="btn btn-outline-secondary btn-sm" onclick="changeAdminRecordsPage(-1)" ${adminWorkspace.page === 0 ? 'disabled' : ''}>Anterior</button>
        <span>Página ${adminWorkspace.page + 1} de ${totalPages}</span><button class="btn btn-outline-secondary btn-sm" onclick="changeAdminRecordsPage(1)" ${adminWorkspace.page + 1 >= totalPages ? 'disabled' : ''}>Siguiente</button></div>`;
}
function adminStatusLabel(status) { return ({published:'Publicada',approved:'Aprobada',pending:'Pendiente',rejected:'Retirada',hidden:'Oculta'})[status] || status || 'Sin dato'; }
function changeAdminRecordsPage(step) { adminWorkspace.page += step; renderAdminWorkspaceRecords(); }

async function loadAdminUsers(after = null) {
    if (!isSuperuserActive()) return;
    after ||= adminWorkspace.userIndex > 0 ? adminWorkspace.userPages[adminWorkspace.userIndex - 1]?.after || null : null;
    const generation = ++adminWorkspace.generation;
    const host = document.getElementById('admin-workspace-results');
    host.innerHTML = '<p>Cargando usuarios…</p>';
    try {
        let page = adminWorkspace.userPages[adminWorkspace.userIndex];
        if (!page) {
            const filters = adminWorkspace.filters.user;
            page = (await functionsApi.httpsCallable('listarUsuariosAdmin')({query:filters.query,status:filters.status,after})).data;
        }
        if (generation !== adminWorkspace.generation || adminWorkspace.tab !== 'user') return;
        adminWorkspace.userPages[adminWorkspace.userIndex] = page;
        host.innerHTML = `<p class="small text-muted">${page.users.length} cuentas en esta página</p><div class="table-responsive"><table class="table align-middle admin-table"><thead><tr><th>Usuario</th><th>Correo</th><th>Fecha de creación</th><th>Aportes</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
            ${page.users.map(user => `<tr><td><strong>${escapeHtml(user.name)}</strong><div class="small text-muted">ID: ${escapeHtml(user.uid)}</div></td><td data-label="Correo">${escapeHtml(user.email)}</td>
                <td data-label="Fecha de creación">${escapeHtml(adminAccountCreationDate(user.createdAt))}</td>
                <td data-label="Aportes">${adminContributionRecords.filter(record => record.contributorUid === user.uid).length}</td><td data-label="Estado">${user.administrator ? 'Administrador · ' : ''}${user.disabled ? 'Suspendida' : 'Activa'}</td><td><div class="admin-row-actions">
                <button class="btn btn-sm btn-outline-primary" onclick="viewAdminUser(${inlineJsValue(user.uid)})">Ver</button>
                <button class="btn btn-sm btn-outline-primary" onclick="showUserHistory(${inlineJsValue(user.uid)}, ${inlineJsValue(user.name)})">Historial</button>
                <button class="btn btn-sm btn-outline-primary" onclick="viewAdminUser(${inlineJsValue(user.uid)}, true)" ${user.administrator ? 'disabled' : ''}>Editar</button>
                <button class="btn btn-sm btn-outline-secondary" onclick="changeAdminUser(${inlineJsValue(user.uid)}, '${user.disabled ? 'restore' : 'suspend'}')" ${user.administrator ? 'disabled' : ''}>${user.disabled ? 'Reactivar' : 'Suspender'}</button>
                <button class="btn btn-sm btn-outline-danger" onclick="changeAdminUser(${inlineJsValue(user.uid)}, 'delete')" ${user.administrator ? 'disabled' : ''}>Eliminar</button>
                </div></td></tr>`).join('') || '<tr><td colspan="6">No hay coincidencias en este tramo de cuentas. Puedes continuar la búsqueda con Siguiente si hay más.</td></tr>'}
            </tbody></table></div><div class="admin-pagination"><button class="btn btn-outline-secondary btn-sm" onclick="changeAdminUsersPage(-1)" ${adminWorkspace.userIndex === 0 ? 'disabled' : ''}>Anterior</button><span>Página ${adminWorkspace.userIndex + 1}</span>
            <button class="btn btn-outline-secondary btn-sm" onclick="changeAdminUsersPage(1)" ${page.after ? '' : 'disabled'}>Siguiente</button></div>`;
    } catch (error) {
        if (generation === adminWorkspace.generation) host.innerHTML = `<p role="alert">${escapeHtml(getFirebaseErrorMessage(error, 'No se pudieron cargar los usuarios.'))}</p><button class="btn btn-outline-primary" onclick="loadAdminUsers()">Reintentar</button>`;
    }
}
function changeAdminUsersPage(step) {
    const after = step > 0 ? adminWorkspace.userPages[adminWorkspace.userIndex]?.after : null;
    adminWorkspace.userIndex = Math.max(0, adminWorkspace.userIndex + step);
    loadAdminUsers(after);
}

function openAdminDialog(title) {
    let dialog = document.getElementById('admin-workspace-dialog');
    if (!dialog) { dialog = document.createElement('dialog'); dialog.id = 'admin-workspace-dialog'; dialog.className = 'admin-dialog'; document.body.append(dialog); }
    dialog.innerHTML = `<div class="admin-dialog-header"><h5 id="admin-dialog-title" class="fw-bold mb-0">${escapeHtml(title)}</h5><button class="btn btn-outline-secondary btn-sm" onclick="document.getElementById('admin-workspace-dialog').close()">Cerrar</button></div><div id="admin-dialog-content">Cargando…</div>`;
    dialog.setAttribute('aria-labelledby', 'admin-dialog-title');
    if (!dialog.open) dialog.showModal();
    return document.getElementById('admin-dialog-content');
}

async function viewAdminUser(uid, edit = false) {
    if (!isSuperuserActive()) return;
    const host = openAdminDialog(edit ? 'Editar usuario' : 'Datos del usuario');
    try {
        const {user, profile} = (await functionsApi.httpsCallable('gestionarUsuarioAdmin')({uid,action:'view'})).data;
        const fields = [['name','Nombre',profile.displayName || user.name],['phone','Teléfono',profile.phone],['country','País',profile.country],['state','Estado',profile.state],['municipality','Municipio',profile.municipality]];
        host.innerHTML = edit ? `<form onsubmit="event.preventDefault(); saveAdminUser(${inlineJsValue(uid)}, this)">${fields.map(([key,label,value]) => `<label class="d-block mb-2">${label}<input class="form-control" name="${key}" maxlength="${key === 'name' ? 200 : key === 'phone' ? 40 : 150}" value="${escapeHtml(value || '')}" ${key === 'name' ? 'required' : ''}></label>`).join('')}<button class="btn btn-primary" type="submit">Guardar cambios</button><p class="small mt-2" role="status"></p></form>` :
            `<dl class="admin-profile">${[...fields.map(([,label,value]) => [label,value]),['Correo',user.email],['Identificador',user.uid],['Estado',user.disabled ? 'Suspendida' : 'Activa'],['Correo verificado',user.verified ? 'Sí' : 'No']].map(([label,value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value || 'Sin dato')}</dd></div>`).join('')}</dl>`;
    } catch (error) { host.textContent = getFirebaseErrorMessage(error, 'No se pudo cargar la cuenta.'); }
}
async function saveAdminUser(uid, form) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
        const values = Object.fromEntries(new FormData(form));
        await functionsApi.httpsCallable('gestionarUsuarioAdmin')({uid,action:'edit',...values});
        document.getElementById('admin-workspace-dialog').close();
        showToast('Usuario actualizado.', '#10b981');
        adminWorkspace.userPages = []; adminWorkspace.userIndex = 0; loadAdminUsers();
    } catch (error) { form.querySelector('[role="status"]').textContent = getFirebaseErrorMessage(error, 'No se guardaron los cambios.'); }
    finally { button.disabled = false; }
}
async function changeAdminUser(uid, action) {
    if (!isSuperuserActive()) return;
    const message = action === 'delete' ? '¿Eliminar esta cuenta de acceso? Sus aportaciones e historial se conservarán. La cuenta no podrá recuperarse.' : action === 'suspend' ? '¿Suspender el acceso de esta cuenta?' : '¿Reactivar el acceso de esta cuenta?';
    if (!confirm(message)) return;
    try {
        await functionsApi.httpsCallable('gestionarUsuarioAdmin')({uid,action});
        showToast('Acción completada.', '#10b981');
        adminWorkspace.userPages = []; adminWorkspace.userIndex = 0; loadAdminUsers();
    } catch (error) { showToast(getFirebaseErrorMessage(error, 'No se pudo modificar la cuenta.'), '#ef4444'); }
}

async function viewAdminRecord(type, id) {
    if (!isSuperuserActive()) return;
    await openAdminCatalogDetail(type, id);
    document.getElementById('record-detail-content').insertAdjacentHTML('beforeend', `<div class="mt-3">${adminRecordButtons(type,id)}</div>`);
}
async function editAdminRecord(type, id) {
    if (!isSuperuserActive()) return;
    if (type === 'tomb') { await openTombDetail(id); if (currentDetailTomb?.id === id) enableTombDetailEditing(); }
    else { await openMyCemeteryContribution(id); if (currentCemeteryContribution?.id === id) enableMyCemeteryEditing(); }
}
async function removeAdminWorkspaceRecord(type, id) {
    if (!isSuperuserActive()) return;
    const record = adminContributionRecords.find(item => item.id === id && item.type === type);
    if (!confirm(`¿Eliminar ${type === 'tomb' ? 'la lápida' : 'el panteón'} «${type === 'tomb' ? record?.person || id : record?.cemetery || id}» y su fotografía? Esta acción no se puede deshacer.${type === 'cemetery' ? ' Si tiene tumbas vinculadas, primero debes reasignarlas.' : ''}`)) return;
    try {
        await eliminarMiAportacionFunction({recordType:type, recordId:id});
        closeRecordDetail();
        await loadAdminStats();
        showToast('Registro eliminado. Se conserva el historial de la operación.', '#10b981');
    } catch (error) { showToast(getFirebaseErrorMessage(error, 'No se pudo eliminar el registro.'), '#ef4444'); }
}

async function showAdminRecordHistory(type, id, after = null) {
    if (!isSuperuserActive()) return;
    const host = after ? document.getElementById('admin-dialog-content') : openAdminDialog('Historial del registro');
    if (!after) host.innerHTML = '<div id="admin-record-history-entries"></div><div id="admin-record-history-more">Cargando…</div>';
    const more = host.querySelector('#admin-record-history-more');
    const entries = host.querySelector('#admin-record-history-entries');
    if (!more || !entries) return;
    more.innerHTML = 'Cargando…';
    try {
        const result = (await functionsApi.httpsCallable('obtenerHistorialRegistroAdmin')({recordType:type,recordId:id,after})).data;
        const print = value => value == null ? 'Sin dato' : typeof value === 'object' ? JSON.stringify(value) : String(value);
        entries.insertAdjacentHTML('beforeend', result.entries.map(entry => `<article class="admin-history-entry"><strong>${escapeHtml(({created:'Registro creado',updated:'Registro actualizado',deleted:'Registro eliminado'})[entry.action] || entry.action)}</strong><div class="small text-muted">${escapeHtml(entry.createdAt ? new Date(entry.createdAt).toLocaleString('es-MX') : 'Sin fecha')} · ${escapeHtml(entry.actorName || 'Sistema')}${entry.actorId ? ` · ${escapeHtml(entry.actorId)}` : ''}</div>
            ${(entry.changes || []).map(change => `<details><summary>${escapeHtml(change.field)}</summary><p class="small mb-1">Anterior: ${escapeHtml(print(change.before))}</p><p class="small">Nuevo: ${escapeHtml(print(change.after))}</p></details>`).join('')}</article>`).join('') || (!after ? '<p>No hay cambios registrados para este registro.</p>' : ''));
        more.innerHTML = result.after ? `<button class="btn btn-outline-primary mt-2" onclick="showAdminRecordHistory(${inlineJsValue(type)}, ${inlineJsValue(id)}, ${inlineJsValue(result.after)})">Ver cambios anteriores</button>` : '';
    } catch (error) { more.innerHTML = `<p role="alert">${escapeHtml(getFirebaseErrorMessage(error, 'No se pudo cargar el historial.'))}</p><button class="btn btn-outline-primary" onclick="showAdminRecordHistory(${inlineJsValue(type)}, ${inlineJsValue(id)}, ${inlineJsValue(after)})">Reintentar</button>`; }
}
