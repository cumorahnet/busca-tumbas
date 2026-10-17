"use strict";
const hasLocation = point => point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
module.exports = function tombMedia({db, bucket, FieldValue, HttpsError, requireUser}) {
  return async request => {
    const uid = requireUser(request);
    const input = request.data || {};
    const {recordId, photoId, geolocation, capture} = input;
    const validId = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
    if (!validId(recordId) || Object.keys(input).some(key => !["recordId", "photoId", "geolocation", "capture"].includes(key)) ||
        !photoId && !geolocation || photoId && !validId(photoId)) {
      throw new HttpsError("invalid-argument", "Aporta una fotografía o una ubicación, sin cambiar otros datos.");
    }
    if (capture && (!photoId || capture.source !== "camera" || !Number.isFinite(capture.capturedAt) || capture.capturedAt <= 0 ||
        capture.capturedAt > Date.now() + 300000 || Object.keys(capture).some(key => !["source", "capturedAt", "accuracy"].includes(key)) ||
        capture.accuracy != null && (!Number.isFinite(capture.accuracy) || capture.accuracy < 0))) {
      throw new HttpsError("invalid-argument", "Datos de captura no válidos.");
    }
    if (geolocation && (!hasLocation(geolocation) || Math.abs(geolocation.latitude) > 90 || Math.abs(geolocation.longitude) > 180 ||
        Object.keys(geolocation).some(key => !["latitude", "longitude"].includes(key)))) {
      throw new HttpsError("invalid-argument", "Ubicación no válida.");
    }
    const storagePath = photoId ? `tomb_extra_images/${recordId}/${uid}/${photoId}/image.jpg` : null;
    if (photoId) {
      const [metadata] = await bucket.file(storagePath).getMetadata().catch(() => {throw new HttpsError("failed-precondition", "Primero sube la fotografía.");});
      if (metadata.contentType !== "image/jpeg" || Number(metadata.size) <= 0 || Number(metadata.size) >= 8 * 1024 * 1024) {
        throw new HttpsError("invalid-argument", "Fotografía JPEG de menos de 8 MB requerida.");
      }
    }
    const reference = db.collection("tumbas").doc(recordId);
    return db.runTransaction(async transaction => {
      const record = await transaction.get(reference);
      const moderation = await transaction.get(db.collection("_moderation").doc(uid));
      if (!record.exists || record.data().status === "rejected") throw new HttpsError("not-found", "La tumba no está disponible.");
      if (moderation.data()?.suspendedUntil?.toMillis?.() > Date.now()) throw new HttpsError("permission-denied", "Tus aportaciones están suspendidas.");
      if (photoId) {
        const photo = reference.collection("photos").doc(photoId);
        const existing = await transaction.get(photo);
        if (existing.exists) {
          if (existing.data().contributorId !== uid) throw new HttpsError("already-exists", "Fotografía ya registrada.");
          return {added:true};
        }
        transaction.create(photo, {storagePath, contributorId:uid,
          ...(geolocation ? {geolocation} : {}), ...(capture ? {capture} : {}),
          contributorName:String(request.auth.token.name || "Colaborador").slice(0,200), createdAt:FieldValue.serverTimestamp()});
        if (geolocation && !hasLocation(record.data().geolocation)) {
          transaction.update(reference, {geolocation, geolocationContributorId:uid, geolocationAddedAt:FieldValue.serverTimestamp()});
        }
      } else {
        if (hasLocation(record.data().geolocation)) throw new HttpsError("already-exists", "La tumba ya tiene ubicación. No se reemplazó.");
        transaction.update(reference, {geolocation, geolocationContributorId:uid, geolocationAddedAt:FieldValue.serverTimestamp()});
      }
      return {added:true};
    });
  };
};
