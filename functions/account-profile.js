"use strict";

const fields = {displayName: 200, phone: 40, municipality: 150, state: 150, country: 100};

module.exports = ({db, FieldValue, HttpsError, requireVerified, requireAdmin, getUser, setClaims}) => ({
  async get(request) {
    const caller = requireVerified(request);
    const uid = request.data?.uid || caller;
    if (typeof uid !== "string" || !/^[^/]{1,128}$/.test(uid)) throw new HttpsError("invalid-argument", "Usuario no válido.");
    if (uid !== caller) requireAdmin(request);
    const ref = db.collection("_accountProfiles").doc(uid);
    const [profile, user, history] = await Promise.all([
      ref.get(), getUser(uid), ref.collection("history").orderBy("createdAt", "desc").limit(100).get(),
    ]);
    const complete = Object.keys(fields).every(key => typeof profile.data()?.[key] === "string" && !!profile.data()[key].trim()) && !!profile.data()?.termsAcceptedAt;
    return {uid, complete, profile: {displayName: user.displayName || "", ...profile.data(), email: user.email || ""},
      history: history.docs.map(doc => ({id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toMillis?.() || null}))};
  },
  async update(request) {
    const uid = requireVerified(request);
    const data = request.data;
    if (!data || typeof data !== "object" || Array.isArray(data) ||
        Object.keys(data).some(key => !Object.hasOwn(fields, key) && key !== "termsAccepted")) {
      throw new HttpsError("invalid-argument", "Datos de cuenta no válidos.");
    }
    for (const [key, max] of Object.entries(fields)) {
      if (typeof data[key] !== "string" || data[key].trim().length > max ||
          !data[key].trim()) {
        throw new HttpsError("invalid-argument", "Revisa los datos de la cuenta.");
      }
    }
    if (data.termsAccepted !== true || !/^[\p{L}][\p{L}\s.'-]{4,}$/u.test(data.displayName.trim()) ||
        data.displayName.trim().split(/\s+/).length < 2 || !/^[+\d\s().-]{7,40}$/.test(data.phone.trim()) || data.phone.replace(/\D/g, "").length < 7) {
      throw new HttpsError("invalid-argument", "Completa tu nombre y apellidos, teléfono y aceptación de los términos.");
    }
    const user = await getUser(uid);
    const ref = db.collection("_accountProfiles").doc(uid);
    const entry = ref.collection("history").doc();
    const result = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      const before = snapshot.exists === false ? {} : {displayName: user.displayName || "", ...snapshot.data()};
      const next = Object.fromEntries(Object.keys(fields).map(key => [key, data[key].trim()]));
      const changes = Object.keys(fields).filter(key => (before[key] || "") !== next[key])
          .map(field => ({field, before: before[field] || "", after: next[field]}));
      if (!before.termsAcceptedAt) changes.push({field:"termsAccepted",before:false,after:true});
      if (!changes.length) return {saved: false, profile: next};
      transaction.set(ref, {...next, auditEntryId:entry.id, termsAcceptedAt:before.termsAcceptedAt || FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()});
      const history = {action:"account_updated", source:"account", actorId:uid,
        actorName:before.displayName || user.email || "Usuario", target:`_accountProfiles/${uid}`,
        createdAt:FieldValue.serverTimestamp(), changes};
      transaction.set(entry, history);
      transaction.set(db.collection("_userAudit").doc(uid).collection("events").doc(entry.id),history);
      return {saved: true, profile: next};
    });
    await setClaims(uid, {profile_complete:true});
    return {...result, complete:true};
  },
});
