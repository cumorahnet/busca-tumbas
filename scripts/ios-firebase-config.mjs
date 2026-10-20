import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const plist=require('plist');
process.env.DEBUG='';
async function main(){
    if(process.argv[2]!=='--sync')throw Error('EXPECTED_SYNC');
    const project=JSON.parse(await readFile('.firebaserc','utf8')).projects.default;
    const bundle=JSON.parse(await readFile('capacitor.config.json','utf8')).appId;
    const cli=require('firebase-tools/lib/auth');const a=cli.getProjectDefaultAccount(process.cwd());
    if(!a?.tokens?.refresh_token)throw Error('FIREBASE_LOGIN_REQUIRED');
    const token=await cli.getAccessToken(a.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
    const headers={Authorization:'Bearer '+token.access_token};
    const base='https://firebase.googleapis.com/v1beta1/projects/'+project;
    const list=await fetch(base+'/iosApps',{headers});if(!list.ok)throw Error('IOS_APP_LOOKUP_FAILED');
    const app=(await list.json()).apps?.find(a=>a.bundleId===bundle);if(!app)throw Error('REGISTER_IOS_APP_IN_FIREBASE');
    const config=await fetch(base+'/iosApps/'+app.appId+'/config',{headers});if(!config.ok)throw Error('IOS_CONFIG_DOWNLOAD_FAILED');
    const bytes=Buffer.from((await config.json()).configFileContents,'base64');const firebase=plist.parse(bytes.toString('utf8'));
    if(!firebase.REVERSED_CLIENT_ID||!firebase.API_KEY)throw Error('ENABLE_GOOGLE_FOR_IOS');
    await writeFile('ios/App/App/GoogleService-Info.plist',bytes);
    const info=plist.parse(await readFile('ios/App/App/Info.plist','utf8'));
    info.CFBundleURLTypes=[{CFBundleURLSchemes:[firebase.REVERSED_CLIENT_ID]}];
    await writeFile('ios/App/App/Info.plist',plist.build(info)+'\n');
    console.log('iOS Firebase config downloaded locally; Google callback registered. No credentials printed.');
}
main().catch(error=>{console.error(/^[A-Z_]+$/.test(error.message)?error.message:'IOS_CONFIG_FAILED');process.exitCode=1});
