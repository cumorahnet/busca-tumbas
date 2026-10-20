import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
process.env.DEBUG='';
const services=['identitytoolkit.googleapis.com','securetoken.googleapis.com','firebaseinstallations.googleapis.com'];
async function main(){
    const mode=process.argv[2]||'--check';
    if(!['--check','--apply'].includes(mode))throw Error('EXPECTED_CHECK_OR_APPLY');
    const config=JSON.parse(await readFile(path.join(root,'android/app/google-services.json'),'utf8'));
    const appId=JSON.parse(await readFile(path.join(root,'capacitor.config.json'),'utf8')).appId;
    const client=config.client.find(c=>c.client_info.android_client_info.package_name===appId);
    if(!client?.api_key?.[0]?.current_key)throw Error('ANDROID_KEY_MISSING');
    const key=client.api_key[0].current_key;
    const cli=require('firebase-tools/lib/auth');
    const account=cli.getProjectDefaultAccount(root);
    if(!account?.tokens?.refresh_token)throw Error('FIREBASE_LOGIN_REQUIRED');
    const token=await cli.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
    const headers={Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'};
    async function api(url,options={}){
        const r=await fetch(url,{...options,headers,signal:AbortSignal.timeout(30000)});
        if(!r.ok)throw Error('CLOUD_API_HTTP_'+r.status);
        return r.json();
    }
    const lookup=await api('https://apikeys.googleapis.com/v2/keys:lookupKey?keyString='+encodeURIComponent(key));
    const url='https://apikeys.googleapis.com/v2/'+lookup.name;
    const current=await api(url);
    const sha=await api('https://firebase.googleapis.com/v1beta1/projects/'+config.project_info.project_id+'/androidApps/'+client.client_info.mobilesdk_app_id+'/sha');
    const fingerprints=[...new Set((sha.certificates||[]).filter(s=>s.certType==='SHA_1').map(s=>s.shaHash.replaceAll(':','').toUpperCase()))];
    if(!fingerprints.length)throw Error('ANDROID_SHA1_MISSING');
    const restrictions={androidKeyRestrictions:{allowedApplications:fingerprints.map(sha1Fingerprint=>({packageName:appId,sha1Fingerprint}))},apiTargets:services.map(service=>({service}))};
    if(mode==='--apply'){
        const operation=await api(url+'?updateMask=restrictions',{method:'PATCH',body:JSON.stringify({name:current.name,etag:current.etag,restrictions})});
        let done=operation;
        for(let i=0;!done.done&&i<30;i++){await new Promise(r=>setTimeout(r,1000));done=await api('https://apikeys.googleapis.com/v2/'+operation.name);}
        if(!done.done||done.error)throw Error('KEY_RESTRICTIONS_UPDATE_FAILED');
    }
    const updated=await api(url);
    const actual=updated.restrictions;
    const applications=actual?.androidKeyRestrictions?.allowedApplications||[];
    if(applications.length!==fingerprints.length||applications.some(a=>a.packageName!==appId||!fingerprints.includes(a.sha1Fingerprint.replaceAll(':','').toUpperCase())))throw Error('ANDROID_APPLICATION_RESTRICTIONS_INCOMPLETE');
    if(actual.apiTargets?.length!==services.length||actual.apiTargets.some(t=>!services.includes(t.service)||t.methods?.length))throw Error('ANDROID_API_RESTRICTIONS_INCOMPLETE');
    console.log('Android API key restricted to '+appId+', '+fingerprints.length+' registered signing certificate(s), and Firebase Auth/Token/Installations.');
    const authUrl='https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key='+encodeURIComponent(key);
    const body=JSON.stringify({providerId:'google.com',continueUri:'https://buscatumbas-2e7cc.web.app/'});
    const anonymous=await fetch(authUrl,{method:'POST',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(20000)});
    const app=await fetch(authUrl,{method:'POST',headers:{'Content-Type':'application/json','X-Android-Package':appId,'X-Android-Cert':fingerprints[0]},body,signal:AbortSignal.timeout(20000)});
    console.log('Access check: no Android identity HTTP '+anonymous.status+'; registered Android identity HTTP '+app.status+'.');
    if(anonymous.status!==403||app.status!==200)throw Error('RESTRICTION_PROPAGATION_OR_ACCESS_CHECK_FAILED');
}
main().catch(error=>{console.error(/^[A-Z0-9_]+$/.test(error.message)?error.message:'API_KEY_SECURITY_CHECK_FAILED');process.exitCode=1;});
