import {before, after, test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
let env;
before(async()=>{ env=await initializeTestEnvironment({projectId:'demo-buscatumbas-security',firestore:{rules:readFileSync('firestore.rules','utf8')},storage:{rules:readFileSync('storage.rules','utf8')}}); });
after(async()=>{await env?.cleanup();});
const user=(uid,email=uid+'@example.com',verified=true)=>env.authenticatedContext(uid,{email,email_verified:verified});
const tomb=(uid)=>({userId:uid,contributorId:uid,timestamp:new Date(),imageUrl:'https://example.com/photo.jpg',visibility:'public',status:'published'});

test('suspension blocks contributions and uploads while preserving reading and expires automatically',async()=>{
 const uid='suspended';
 await env.withSecurityRulesDisabled(async context=>{
  await context.firestore().doc('_moderation/'+uid).set({suspendedUntil:new Date(Date.now()+86400000)});
  await context.firestore().doc('tumbas/suspended-owned').set(tomb(uid));
 });
 const client=user(uid);
 await assertSucceeds(client.firestore().doc('tumbas/suspended-owned').get());
 await assertSucceeds(client.firestore().doc('_moderation/'+uid).get());
 await assertFails(user('outsider').firestore().doc('_moderation/'+uid).get());
 await assertFails(client.firestore().doc('_moderation/'+uid).update({suspendedUntil:new Date(0)}));
 await assertFails(client.firestore().doc('tumbas/suspended-new').set(tomb(uid)));
 await assertFails(client.firestore().doc('tumbas/suspended-owned').update({nombre_finado:'Changed'}));
 await assertFails(client.firestore().doc('cemeteries/suspended-new').set({name:'Panteon',normalizedName:'panteon',stateCode:'01',municipalityCode:'001',photoUrl:'photo',source:'community',status:'pending',contributorId:uid,locality:'Local',aliases:[]}));
 await assertFails(client.storage().ref('tumbas_images/'+uid+'/photo.jpg').put(new Uint8Array([255,216,255,217]),{contentType:'image/jpeg'}));
 await env.withSecurityRulesDisabled(context=>context.firestore().doc('_moderation/'+uid).update({suspendedUntil:new Date(0)}));
 await assertFails(client.firestore().doc('tumbas/suspended-new').set(tomb(uid)));
 await assertSucceeds(client.storage().ref('tumbas_images/'+uid+'/photo.jpg').put(new Uint8Array([255,216,255,217]),{contentType:'image/jpeg'}));
});
const message=(uid,text='Original')=>({senderId:uid,senderName:uid,text,createdAt:Date.now()});
const thread=(uid,owner,tombId)=>({tombId,tombName:'Test',tombOwnerId:owner,requesterId:uid,requesterName:uid,description:'Correction',status:'open',participants:[owner,uid],readBy:[uid],messages:[message(uid)]});

test('community places cannot bypass server uniqueness checks with direct writes',async()=>{
 const base={name:'Lugar comunitario',normalizedName:'lugar comunitario',stateCode:'01',municipalityCode:'001',photoUrl:'photo',source:'community',status:'pending',contributorId:'places',locality:'Local',aliases:[]};
 const client=user('places').firestore();
 for(const placeType of ['cemetery','church','hospital','convent']) {
  await assertFails(client.doc('cemeteries/place-'+placeType).set({...base,placeType,otherPlaceType:''}));
 }
 await assertFails(client.doc('cemeteries/place-other').set({...base,placeType:'other',otherPlaceType:'Mausoleo'}));
 for(const [id,changes] of [['unsupported',{placeType:'invalid'}],['empty',{placeType:'other',otherPlaceType:''}],['spaces',{placeType:'other',otherPlaceType:'   '}],['long',{placeType:'other',otherPlaceType:'a'.repeat(101)}],['wrong-inegi',{placeType:'church',inegiCemeteryId:'original'}]]) {
  await assertFails(client.doc('cemeteries/place-'+id).set({...base,...changes}));
 }
 await assertFails(client.doc('cemeteries/place-church').update({placeType:'invalid'}));
});
test('verification required even for admin email, and ownership enforced',async()=>{
 const ref=user('owner').firestore().doc('tumbas/owned');
 await assertFails(ref.set(tomb('owner')));
 await env.withSecurityRulesDisabled(context=>context.firestore().doc('tumbas/owned').set(tomb('owner')));
 await assertFails(user('fake-admin','buscatumbas@cumorahnet.com',false).firestore().doc('tumbas/owned').get());
 await assertFails(env.unauthenticatedContext().firestore().doc('tumbas/owned').get());
 await assertFails(user('other').firestore().doc('tumbas/owned').update({nombre_finado:'Changed'}));
 await assertFails(user('other').firestore().doc('tumbas/forged').set({...tomb('other'),contributorId:'owner'}));
 await assertFails(ref.update({nombre_finado:'Corrected',pais_panteon:'Mexico'}));
 await assertFails(ref.update({pais_panteon:123}));
 await assertFails(user('owner').firestore().doc('_entitlements/owner').set({paidUntil:new Date()}));
});
test('corrections validate target and sender and preserve prior messages',async()=>{
 await env.withSecurityRulesDisabled(context=>context.firestore().doc('tumbas/target').set(tomb('owner')));
 const original=thread('requester','owner','target');
 const ref=user('requester').firestore().doc('correction_requests/thread');
 await assertFails(ref.set(original));
 await env.withSecurityRulesDisabled(context=>context.firestore().doc('correction_requests/thread').set(original));
 await assertFails(user('requester').firestore().doc('_errorReviews/tomb_target').set({count:3,status:'pending'}));
 await assertFails(user('requester').firestore().doc('_errorReviews/tomb_target').get());
 await assertFails(user('requester').firestore().doc('correction_requests/forged').set({...original,tombOwnerId:'victim',participants:['victim','requester']}));
 await assertFails(user('requester').firestore().doc('correction_requests/spoof').set({...original,messages:[message('owner')]}));
 await assertFails(ref.update({messages:[message('requester','Rewrite')]}));
 await assertFails(ref.update({messages:[...original.messages,message('owner','Impersonation')]}));
 await assertSucceeds(ref.update({messages:[...original.messages,message('requester','Reply')],readBy:['requester']}));
 await assertSucceeds(user('owner').firestore().doc('correction_requests/thread').update({readBy:['requester','owner']}));
 await assertFails(ref.update({status:'resolved'}));
 await assertSucceeds(user('owner').firestore().doc('correction_requests/thread').update({status:'resolved'}));
 await assertFails(user('outsider').firestore().doc('correction_requests/thread').get());
});
test('cemetery editing cannot inject fields or grant approval; admin notification works',async()=>{
 const cemetery={name:'Cemetery',normalizedName:'cemetery',stateCode:'01',municipalityCode:'001',photoUrl:'https://example.com/a.jpg',source:'community',status:'pending',contributorId:'owner',locality:'Local',aliases:[]};
 const ref=user('owner').firestore().doc('cemeteries/cemetery');
 await assertFails(ref.set(cemetery));
 await env.withSecurityRulesDisabled(context=>context.firestore().doc('cemeteries/cemetery').set(cemetery));
 await assertFails(ref.update({name:'Updated cemetery'}));
 await assertFails(ref.update({id:'injected'}));
 await assertFails(ref.update({status:'approved'}));
 await assertFails(ref.update({name:123}));
 await assertFails(user('old-admin','buscatumbas@cumorahnet.com').firestore().doc('cemeteries/cemetery').update({status:'approved'}));
 const eligible=env.authenticatedContext('admin',{email:'dedicated@example.com',email_verified:true,platform_admin:true}).firestore();
 await assertFails(eligible.doc('cemeteries/cemetery').update({status:'approved'}));
 const expired=env.authenticatedContext('admin',{email_verified:true,platform_admin:true,superuser_session:true,superuser_until:1}).firestore();
 await assertFails(expired.doc('cemeteries/cemetery').update({status:'approved'}));
 await assertFails(eligible.doc('_superuserCredentials/admin').get());
 await assertFails(eligible.doc('_superuserCredentials/admin').set({hash:'forged',salt:'forged'}));
 const admin=env.authenticatedContext('admin',{email:'dedicated@example.com',email_verified:true,platform_admin:true,superuser_session:true,superuser_until:Date.now()/1000+3600}).firestore();
 await assertFails(admin.doc('cemeteries/cemetery').update({name:'Duplicate identity'}));
 await assertFails(admin.doc('tumbas/owned').update({nombre_finado:'Duplicate identity'}));
 await assertFails(admin.doc('_uniquenessLocks/tumbas').set({updatedAt:new Date()}));
 const batch=admin.batch();
 batch.update(admin.doc('cemeteries/cemetery'),{status:'approved'});
 batch.set(admin.doc('correction_requests/notice'),{...thread('admin','owner','cemetery'),recordType:'cemetery'});
 await assertSucceeds(batch.commit());
});
test('community photos require own immutable upload and server-only gallery metadata',async()=>{
 await env.withSecurityRulesDisabled(context=>context.firestore().doc('tumbas/media-tomb').set(tomb('original-owner')));
 const client=user('photo-visitor');const bytes=new Uint8Array([255,216,255,217]);
 const path='tomb_extra_images/media-tomb/photo-visitor/photo1/image.jpg';
 await assertSucceeds(client.storage().ref(path).put(bytes,{contentType:'image/jpeg'}));
 await assertFails(client.storage().ref(path).put(bytes,{contentType:'image/jpeg'}));
 await assertFails(user('other').storage().ref(path).put(bytes,{contentType:'image/jpeg'}));
 await assertFails(client.storage().ref('tomb_extra_images/missing/photo-visitor/photo1/image.jpg').put(bytes,{contentType:'image/jpeg'}));
 await assertFails(client.firestore().doc('tumbas/media-tomb/photos/photo1').set({storagePath:path}));
 await assertFails(client.firestore().doc('tumbas/media-tomb').update({geolocation:{latitude:1,longitude:2}}));
 await env.withSecurityRulesDisabled(context=>context.firestore().doc('tumbas/media-tomb/photos/photo1').set({storagePath:path,contributorId:'photo-visitor'}));
 await assertSucceeds(user('other').firestore().collection('tumbas/media-tomb/photos').get());
 await assertFails(client.storage().ref(path).delete());
});

test('Storage blocks unverified admins, foreign writes, and non-JPEG uploads',async()=>{
 const bytes=new Uint8Array([255,216,255,217]);
 await assertSucceeds(user('owner').storage().ref('tumbas_images/owner/photo.jpg').put(bytes,{contentType:'image/jpeg'}));
 await assertFails(user('other').storage().ref('tumbas_images/owner/photo.jpg').put(bytes,{contentType:'image/jpeg'}));
 await assertFails(user('fake-admin','buscatumbas@cumorahnet.com',false).storage().ref('tumbas_images/fake-admin/photo.jpg').put(bytes,{contentType:'image/jpeg'}));
 await assertFails(user('owner').storage().ref('tumbas_images/owner/bad.html').put(bytes,{contentType:'text/html'}));
});

test('duplicate disputes are private, durable admin notifications cannot be forged or self-approved',async()=>{
 const path='_duplicateDisputes/'+'a'.repeat(64);
 await env.withSecurityRulesDisabled(context=>context.firestore().doc(path).set({contributorId:'dispute-owner',status:'pending',adminUnread:true,candidate:{nombre_finado:'Private'}}));
 await assertSucceeds(user('dispute-owner').firestore().doc(path).get());
 await assertSucceeds(user('dispute-owner').firestore().collection('_duplicateDisputes').where('contributorId','==','dispute-owner').get());
 await assertFails(user('outsider').firestore().doc(path).get());
 await assertFails(user('outsider').firestore().collection('_duplicateDisputes').where('status','==','pending').get());
 await assertFails(user('dispute-owner').firestore().doc(path).update({status:'approved'}));
 await assertFails(user('dispute-owner').firestore().doc('_duplicateDisputes/'+'b'.repeat(64)).set({contributorId:'dispute-owner',status:'pending'}));
 const admin=env.authenticatedContext('admin',{email_verified:true,platform_admin:true,superuser_session:true,superuser_until:Date.now()/1000+3600}).firestore();
 await assertSucceeds(admin.collection('_duplicateDisputes').where('status','==','pending').get());
 await assertFails(admin.doc(path).update({status:'approved'}));
 const expired=env.authenticatedContext('admin',{email_verified:true,platform_admin:true,superuser_session:true,superuser_until:1}).firestore();
 await assertFails(expired.doc(path).get());
});
