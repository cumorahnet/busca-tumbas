"use strict";

const {safe} = require("./user-audit");
const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

module.exports = ({db, auth, FieldValue, HttpsError, requireAdmin}) => {
  const fail = (code, message) => { throw new HttpsError(code, message); };
  const identity = value => {
    if (typeof value !== "string" || !/^[^/]{1,128}$/.test(value)) fail("invalid-argument", "Identificador no válido.");
    return value;
  };
  const userView = user => ({uid:user.uid, name:user.displayName || user.email || user.uid,
    email:user.email || "", disabled:user.disabled === true, verified:user.emailVerified === true,
    administrator:user.customClaims?.platform_admin === true, createdAt:user.metadata?.creationTime || null});
  async function users(request) {
    requireAdmin(request);
    const query = request.data?.query || "";
    const status = request.data?.status || "all";
    const token = request.data?.after;
    if (typeof query !== "string" || query.length > 254 || !["all", "active", "disabled"].includes(status) ||
        token != null && (typeof token !== "string" || token.length > 2048)) fail("invalid-argument", "Búsqueda no válida.");
    let pageToken = token || undefined;
    let matches = [];
    // Bounded scan. The returned cursor always starts after the complete scanned page.
    for (let scanned = 0; scanned < 10; scanned++) {
      const page = await auth.listUsers(50, pageToken);
      matches = page.users.map(userView).filter(user =>
        (!query.trim() || normalize(`${user.name} ${user.email} ${user.uid}`).includes(normalize(query.trim()))) &&
        (status === "all" || user.disabled === (status === "disabled")));
      pageToken = page.pageToken;
      if (matches.length || !pageToken) break;
    }
    return {users:matches, after:pageToken || null};
  }
  async function manageUser(request) {
    requireAdmin(request);
    const uid = identity(request.data?.uid);
    const action = request.data?.action;
    if (!["view", "edit", "suspend", "restore", "delete"].includes(action)) fail("invalid-argument", "Acción no válida.");
    const user = await auth.getUser(uid);
    if (action === "view") {
      const profile = await db.collection("_accountProfiles").doc(uid).get();
      return {user:userView(user), profile:safe(profile.data() || {})};
    }
    if (uid === request.auth.uid || user.customClaims?.platform_admin === true) {
      fail("failed-precondition", "Las cuentas administrativas se protegen de estos cambios desde el panel.");
    }
    const next = {};
    const profileChanges = {};
    if (action === "edit") {
      const name = request.data?.name;
      if (typeof name !== "string" || !name.trim() || name.length > 200) fail("invalid-argument", "Nombre no válido.");
      next.displayName = name.trim();
      for (const [key, max] of Object.entries({phone:40,country:100,state:150,municipality:150})) {
        const value = request.data[key];
        if (typeof value !== "string" || value.length > max) fail("invalid-argument", "Datos de perfil no válidos.");
        profileChanges[key] = value.trim();
      }
    } else next.disabled = action !== "restore";
    const entry = db.collection("_userAudit").doc(uid).collection("events").doc();
    const beforeProfile = action === "edit" ? (await db.collection("_accountProfiles").doc(uid).get()).data() || {} : {};
    const history = {action:`admin_user_${action}`, actorId:request.auth.uid,
      actorName:request.auth.token.name || "Administrador", target:`users/${uid}`,
      createdAt:FieldValue.serverTimestamp(), status:"started", changes:[{field:action === "edit" ? "displayName" : "disabled",
        before:action === "edit" ? user.displayName || "" : user.disabled, after:action === "edit" ? next.displayName : next.disabled},
      ...Object.entries(profileChanges).filter(([field,value]) => value !== (beforeProfile[field] || ""))
        .map(([field,value]) => ({field,before:beforeProfile[field] || "",after:value}))]};
    await entry.set(history);
    try {
      if (action === "delete") {
        // Auth deletion preserves contributions, their author IDs, profiles, and audit trails.
        await auth.updateUser(uid, {disabled:true});
        await auth.revokeRefreshTokens(uid);
        await auth.deleteUser(uid);
      } else {
        await auth.updateUser(uid, next);
        if (action === "suspend") await auth.revokeRefreshTokens(uid);
        if (action === "edit") await db.collection("_accountProfiles").doc(uid).set({...profileChanges,displayName:next.displayName,
          updatedAt:FieldValue.serverTimestamp(), auditActorId:request.auth.uid}, {merge:true});
      }
      await entry.update({status:"completed", completedAt:FieldValue.serverTimestamp()});
    } catch (error) {
      await entry.update({status:"failed", errorCode:error.code || "internal"});
      throw error;
    }
    return {ok:true};
  }
  async function history(request) {
    requireAdmin(request);
    const id = identity(request.data?.recordId);
    const type = request.data?.recordType;
    if (!["tomb", "cemetery"].includes(type)) fail("invalid-argument", "Tipo no válido.");
    const target = `${type === "tomb" ? "tumbas" : "cemeteries"}/${id}`;
    let query = db.collection("_databaseAudit").where("target", "==", target).orderBy("createdAt", "desc");
    if (request.data?.after) {
      const cursor = await db.collection("_databaseAudit").doc(identity(request.data.after)).get();
      if (!cursor.exists || cursor.data().target !== target) fail("invalid-argument", "Página no válida.");
      query = query.startAfter(cursor);
    }
    const page = await query.limit(30).get();
    return {entries:page.docs.map(doc => ({id:doc.id,...safe(doc.data())})), after:page.size === 30 ? page.docs.at(-1).id : null};
  }
  return {users, manageUser, history};
};
