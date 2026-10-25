"use strict";
const technical = new Set(["updatedAt", "createdAt", "timestamp", "last_updated", "last_updated_by", "auditActorId", "auditEntryId", "reviewedAt", "reviewedBy", "resolvedAt", "resolvedBy", "sourceEventId", "readBy", "lastReadAt", "notifiedAt", "adminUnread", "userId", "uid", "contributorId", "contributorName", "contributorEmail", "contributor_name", "contributor_email", "owner", "requesterId", "requesterName", "tombOwnerId", "participants", "record_key", "person_key", "image_hash", "image_fingerprint", "updatedBy"]);
const collections = new Set(["tumbas", "cemeteries", "cementerios", "correction_requests", "_duplicateDisputes", "_accountProfiles", "_entitlements", "_moderation"]);
const mirrored = new Set(["crearAportacionTumba", "crearAportacionPanteon", "actualizarAportacionTumba", "actualizarAportacionPanteon", "eliminarMiAportacion", "eliminarRegistroAdmin", "contactarColaboradorTumba", "aportarFotoOUbicacionTumba", "enviarNotaError"]);
const operations = {crearAportacionTumba:"registrar una tumba", crearAportacionPanteon:"registrar un lugar", actualizarAportacionTumba:"actualizar una tumba", actualizarAportacionPanteon:"actualizar un lugar", eliminarMiAportacion:"eliminar una aportación", eliminarRegistroAdmin:"eliminar un registro", contactarColaboradorTumba:"enviar un mensaje a un colaborador", aportarFotoOUbicacionTumba:"aportar una foto o ubicación a una tumba", enviarNotaError:"enviar una sugerencia o reportar un problema", resolverNotasErrorAdmin:"resolver un reporte", auditarDuplicadosAdmin:"revisar posibles duplicados", gestionarAporteAdmin:"revisar una aportación", activarPlusAdmin:"actualizar los beneficios de una cuenta", vaciarBaseAdmin:"eliminar registros", gestionarUsuarioAdmin:"gestionar una cuenta", aclararDisputaDuplicado:"enviar una aclaración sobre un posible duplicado", resolverDisputaDuplicado:"resolver un posible duplicado"};
const meaningfulChanges = entry => (entry.changes || []).filter(change => !technical.has(change.field) && !/_lower$/.test(change.field) && !["normalizedName", "normalizedInegiName"].includes(change.field));
function isActivity(entry) {
  if (entry.source === "operation") return !!operations[entry.action] && !(entry.status === "completed" && mirrored.has(entry.action));
  if (entry.action === "account_updated") return meaningfulChanges(entry).length > 0;
  return collections.has(String(entry.target || "").split("/")[0]) && meaningfulChanges(entry).length > 0;
}
function describeActivity(entry, context = {}) {
  if (entry.source === "operation") {
    const operation = operations[entry.action] || "realizar una acción";
    return entry.status === "failed" ? `No se pudo ${operation}` : entry.status === "started" ? `Se solicitó ${operation}` : `Se completó la acción de ${operation}`;
  }
  const values = {...context};
  for (const change of entry.changes || []) values[change.field] = change.after ?? change.before;
  const collection = String(entry.target || "").split("/")[0];
  const name = values.nombre_finado || [values.nombres,values.apellido_paterno,values.apellido_materno].filter(Boolean).join(" ") || values.name;
  const suffix = name ? ` ${String(name).slice(0,200)}` : "";
  const changes = meaningfulChanges(entry);
  const changed = new Set(changes.map(change => change.field));
  if (collection === "tumbas") {
    const subject = name ? `la tumba de${suffix}` : "una tumba";
    if (String(entry.target).split("/")[2] === "photos") return `${entry.action === "deleted" ? "Se retiró" : "Se agregó"} una fotografía a ${subject}`;
    if (entry.action === "created") return `Se aportó ${subject}`;
    if (entry.action === "deleted") return `Se eliminó ${subject}`;
    if (changed.has("geolocation") && changes.every(change => ["geolocation","geolocationContributorId"].includes(change.field))) return `Se completó la ubicación GPS de ${subject}`;
    return `Se actualizaron los datos de ${subject}`;
  }
  if (["cemeteries","cementerios"].includes(collection)) {
    const type = {cemetery:"el panteón",church:"la iglesia",hospital:"el hospital",convent:"el convento",other:"el lugar"}[values.placeType || "cemetery"] || "el lugar";
    const subject = type + (values.name ? ` ${String(values.name).slice(0,200)}` : " sin nombre registrado");
    if (entry.action === "created") return `Se aportó ${subject}`;
    if (entry.action === "deleted") return `Se eliminó ${subject}`;
    if (changed.has("status") && values.status === "approved") return `Se aprobó la aportación de ${subject}`;
    if (changed.has("status") && values.status === "rejected") return `Se rechazó la aportación de ${subject}`;
    if (changed.has("location") && changes.every(change => change.field === "location")) return `Se actualizó la ubicación GPS de ${subject}`;
    return `Se actualizaron los datos de ${subject}`;
  }
  if (collection === "correction_requests") {
    const subject = values.tombName ? ` sobre ${String(values.tombName).slice(0,200)}` : "";
    if (entry.action === "created") {
      const detail = typeof values.description === "string" && values.description.trim() ? `: «${values.description.trim().slice(0,160)}»` : "";
      return values.kind === "contact" ? `Se envió un mensaje${subject}${detail}` : `Se sugirió una corrección${subject}${detail}`;
    }
    if (changed.has("status")) return `Se actualizó el estado de la solicitud${subject}`;
    return `Se agregó una respuesta a la conversación${subject}`;
  }
  if (collection === "_duplicateDisputes") {
    const candidate = values.candidate || {};
    const title = candidate.nombre_finado || candidate.name;
    const subject = title ? `: ${String(title).slice(0,200)}` : "";
    return entry.action === "created" ? `Se propuso una aportación para revisión por posible duplicado${subject}` : changed.has("messages") ? `Se envió una aclaración sobre un posible duplicado${subject}` : `Se actualizó la revisión de un posible duplicado${subject}`;
  }
  if (collection === "_moderation") return "Se actualizó el estado de tu cuenta";
  if (collection === "_entitlements") return "Se actualizaron los beneficios de tu cuenta";
  if (collection === "_accountProfiles" || entry.action === "account_updated") return "Se actualizaron los datos de tu cuenta";
  return "Se registró una actividad en tu cuenta";
}
module.exports = {meaningfulChanges, isActivity, describeActivity};
