"use strict";
const {elevated} = require("./superuser-password");
function storagePath(imageUrl, bucketName) {
  const url = new URL(imageUrl);
  if (url.protocol !== "https:" || url.hostname !== "firebasestorage.googleapis.com") throw new Error("Origen no válido");
  const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
  if (!match || decodeURIComponent(match[1]) !== bucketName) throw new Error("Bucket no válido");
  const path = decodeURIComponent(match[2]);
  if (!path.startsWith("tumbas_images/") || path.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Ruta no válida");
  return path;
}
module.exports = ({db, bucket, verifyIdToken}) => async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  if (req.method !== "GET") return res.status(405).send("Método no permitido.");
  let user;
  try {
    const token = String(req.headers.authorization || "").match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new Error("No token");
    user = await verifyIdToken(token, true);
    if (user.email_verified !== true) throw new Error("Not verified");
    if (user.profile_complete !== true && !elevated(user)) throw new Error("Incomplete profile");
  } catch { return res.status(401).send("Inicia sesión con una cuenta verificada y completa para descargar."); }
  const recordId = req.query.recordId;
  if (typeof recordId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(recordId)) return res.status(400).send("Registro no válido.");
  try {
    const snapshot = await db.collection("tumbas").doc(recordId).get();
    if (!snapshot.exists) return res.status(404).send("La tumba no está disponible.");
    const tomb = snapshot.data();
    const owner = tomb.contributorId || tomb.userId;
    if ((["rejected", "deleted", "hidden", "pending"].includes(tomb.status) || ["private", "hidden"].includes(tomb.visibility)) && owner !== user.uid && !elevated(user)) {
      return res.status(404).send("La tumba no está disponible.");
    }
    const file = bucket.file(storagePath(tomb.imageUrl, bucket.name));
    const [metadata] = await file.getMetadata();
    const mime = String(metadata.contentType || "").split(";")[0].trim().toLowerCase();
    const extension = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[mime];
    if (!extension || Number(metadata.size) <= 0 || Number(metadata.size) > 8 * 1024 * 1024) return res.status(422).send("La fotografía no tiene un formato o tamaño válido.");
    const [bytes] = await file.download();
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) return res.status(422).send("Fotografía no válida.");
    res.set("Content-Type", mime);
    res.set("Content-Disposition", `attachment; filename="lapida-${recordId}.${extension}"`);
    res.set("X-Content-Type-Options", "nosniff");
    return res.status(200).send(bytes);
  } catch { return res.status(404).send("No se pudo obtener la fotografía del registro. Vuelve a abrir su ficha e inténtalo de nuevo."); }
};
module.exports.storagePath = storagePath;
