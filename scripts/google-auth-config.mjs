import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
process.env.DEBUG='';
async function main(){
    const mode=process.argv[2]||'--check';
    if(!['--check','--sync'].includes(mode))throw Error('Usa --check o --sync.');
    const project=JSON.parse(await readFile(path.join(root,'.firebaserc'),'utf8')).projects.default;
    const cli=require('firebase-tools/lib/auth');
    const account=cli.getProjectDefaultAccount(root);
    if(!account?.tokens?.refresh_token)throw Error('Inicia sesión con firebase login.');
    const token=await cli.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
    async function get(url){
        const r=await fetch(url,{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(30000)});
        const data=await r.json();
        if(!r.ok)throw Error(r.status===404?'Habilita Google en Firebase Authentication > Sign-in method.':('Error de configuración HTTP '+r.status));
        return data;
    }
    const provider=await get('https://identitytoolkit.googleapis.com/admin/v2/projects/'+project+'/defaultSupportedIdpConfigs/google.com');
    if(!provider.enabled||!provider.clientId)throw Error('Habilita y guarda el proveedor Google en Firebase Authentication.');
    const config=JSON.parse(await readFile(path.join(root,'capacitor.config.json'),'utf8'));
    const apps=await get('https://firebase.googleapis.com/v1beta1/projects/'+project+'/androidApps');
    const app=apps.apps?.find(a=>a.packageName===config.appId);
    if(!app)throw Error('Registra el paquete Android '+config.appId+' en Firebase.');
    const remote=await get('https://firebase.googleapis.com/v1beta1/'+app.name+'/config');
    const bytes=Buffer.from(remote.configFileContents,'base64');
    const android=JSON.parse(bytes);
    const client=android.client?.find(c=>c.client_info?.android_client_info?.package_name===config.appId);
    if(!client?.oauth_client?.some(c=>c.client_type===3))throw Error('Falta el cliente OAuth web en google-services.json. Guarda Google y vuelve a descargar la configuración.');
    const sha=await get('https://firebase.googleapis.com/v1beta1/'+app.name+'/sha');
    if(!sha.certificates?.some(c=>c.certType==='SHA_1'))throw Error('Registra la huella SHA-1 del certificado con el que firmas el APK.');
    if(mode==='--sync')await writeFile(path.join(root,'android/app/google-services.json'),bytes);
    console.log('Google habilitado. Android registrado con cliente OAuth web y firma SHA-1.');
    console.log(mode==='--sync'?'google-services.json actualizado. Ejecuta npm run android:apk.':'Solo consulta: no se realizaron cambios.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
