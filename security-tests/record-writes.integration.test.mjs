import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const {initializeApp, deleteApp} = require('firebase-admin/app');
const {getFirestore, FieldValue, GeoPoint} = require('firebase-admin/firestore');
const {HttpsError} = require('firebase-functions/v2/https');
const factory = require('./record-writes.js');

test('real Firestore transactions serialize concurrent duplicate creates in empty collections',
  {skip: !process.env.FIRESTORE_EMULATOR_HOST, timeout: 60000}, async () => {
    const app = initializeApp({projectId: 'demo-buscatumbas-uniqueness'}, 'duplicate-integration');
    const db = getFirestore(app);
    const api = factory({db, FieldValue, GeoPoint, HttpsError, onCall: (_opts, fn) => fn,
      requireUser: request => request.auth.uid,
      requireAdmin: request => {if (request.auth.uid !== 'admin') throw new HttpsError('permission-denied','Admin only');}});
    const request = (recordId, data) => ({auth: {uid:'integration',token:{}},data:{recordId,data}});
    try {
      await db.recursiveDelete(db.collection('tumbas'));
      await db.recursiveDelete(db.collection('cemeteries'));
      await db.recursiveDelete(db.collection('_uniquenessLocks'));
      await db.recursiveDelete(db.collection('_duplicateDisputes'));
      const person = {nombre_finado:'María Hernández',fecha_defuncion:'27 NOV 1990',imageUrl:'photo'};
      const results = await Promise.allSettled([
        api.crearAportacionTumba(request('one',person)),
        api.crearAportacionTumba(request('two',{...person,nombre_finado:'MARIA HERNANDEZ',fecha_defuncion:'1990-11-27'}))]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(results.find(r=>r.status==='rejected').reason.code,'already-exists');
      assert.equal((await db.collection('tumbas').get()).size,1);
      const place = {name:'Panteón Municipal',stateCode:'15',municipalityCode:'001',locality:'Rancho Nuevo',photoUrl:'photo',placeType:'cemetery'};
      const places = await Promise.allSettled([
        api.crearAportacionPanteon(request('one',place)),
        api.crearAportacionPanteon(request('two',{...place,name:'PANTEON MUNICIPAL',location:{latitude:19,longitude:-99}}))]);
      assert.equal(places.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(places.find(r=>r.status==='rejected').reason.code,'already-exists');
      assert.equal((await db.collection('cemeteries').get()).size,1);
      const proposal = {...person,nombre_finado:'María Hernándes',imageUrl:'new-photo'};
      const disputed = await api.crearAportacionTumba(request('similar',proposal));
      assert.ok(disputed.disputed && disputed.similarity > 50 && disputed.similarity < 100);
      assert.equal((await db.collection('tumbas').get()).size,1);
      const stored = await db.collection('_duplicateDisputes').doc(disputed.disputeId).get();
      assert.equal(stored.data().adminUnread,true);
      assert.equal(stored.data().candidate.imageUrl,'new-photo');
      await api.aclararDisputaDuplicado({auth:{uid:'integration'},data:{caseId:disputed.disputeId,note:'Evidencia de una persona distinta'}});
      await api.resolverDisputaDuplicado({auth:{uid:'admin'},data:{caseId:disputed.disputeId,decision:'distinct',note:'Documentos verificados'}});
      assert.equal((await db.collection('tumbas').get()).size,2);
      assert.equal((await stored.ref.get()).data().status,'approved');
      const disputedPlace = await api.crearAportacionPanteon(request('replacement-place', {...place,name:'Panteón Municipal San José',photoUrl:'better-photo'}));
      assert.ok(disputedPlace.disputed);
      const comparison = await api.obtenerComparacionDisputa({auth:{uid:'admin'},data:{caseId:disputedPlace.disputeId}});
      const {normalize} = require('./duplicates.js');
      assert.equal(normalize(comparison.matches[0].publication.name),normalize(place.name));
      const selected = comparison.matches[0];
      const linked = db.collection('tumbas').doc('linked');
      await linked.set({nombre_finado:'Referencia conservada',cemetery_id:selected.recordId});
      const resolution = {caseId:disputedPlace.disputeId,decision:'replace',note:'La fotografía nueva identifica el nombre correcto',matchedRecordId:selected.recordId,matchedRevision:selected.revision};
      await db.collection('cemeteries').doc(selected.recordId).update({notes:'Modificado mientras se comparaba'});
      await assert.rejects(api.resolverDisputaDuplicado({auth:{uid:'admin'},data:resolution}),{code:'failed-precondition'});
      const refreshed = await api.obtenerComparacionDisputa({auth:{uid:'admin'},data:{caseId:disputedPlace.disputeId}});
      await api.resolverDisputaDuplicado({auth:{uid:'admin'},data:{...resolution,matchedRevision:refreshed.matches[0].revision}});
      assert.equal((await db.collection('cemeteries').get()).size,1);
      assert.equal((await db.collection('cemeteries').doc(selected.recordId).get()).data().photoUrl,'better-photo');
      assert.equal((await linked.get()).data().cemetery_id,selected.recordId);
      assert.equal((await db.collection('_mergedRecords').doc('dispute_'+disputedPlace.disputeId).get()).data().original.photoUrl,'photo');
    } finally { await db.terminate(); await deleteApp(app); }
  });
