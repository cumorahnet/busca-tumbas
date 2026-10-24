import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('the Android build preserves public URLs while bundling remote dependencies', () => {
    const html=fs.readFileSync('www/index.html','utf8');
    const publicUrl='https://buscatumbas.lat/';
    assert.ok(html.includes(`<link rel="canonical" href="${publicUrl}">`));
    assert.ok(html.includes(`<meta property="og:url" content="${publicUrl}">`));
    assert.ok(html.includes(`<meta property="og:image" content="${publicUrl}assets/brand/icon-512.png?v=3">`));
    assert.ok(html.includes(`id="app-share-url" class="form-control mb-3" type="url" value="${publicUrl}" readonly`));
    assert.match(html, /<script src="vendor\/[a-f0-9]{20}\.js"><\/script>/);
});

test('the packaged runtime initializes Google plugin proxies from the native bridge',async()=>{
    const html=fs.readFileSync('www/index.html','utf8');
    const runtimeTag='<script src="vendor/capacitor.js"></script>';
    assert.ok(html.includes(runtimeTag),'Android must load the Capacitor JavaScript runtime');
    assert.ok(html.indexOf(runtimeTag)<html.indexOf('mobile/app.js'),'runtime must load before native app hooks');
    const calls=[];
    const context={console,androidBridge:{},Capacitor:{
        PluginHeaders:[{name:'FirebaseAuthentication',methods:[{name:'signInWithGoogle',rtype:'promise'}]}],
        nativePromise:async(name,method,options)=>{calls.push({name,method,options});return {credential:{idToken:'test-token'}}}
    }};
    vm.createContext(context);
    assert.equal(context.Capacitor.registerPlugin,undefined);
    vm.runInContext(fs.readFileSync('www/vendor/capacitor.js','utf8'),context);
    assert.equal(context.Capacitor.isNativePlatform(),true);
    const result=await context.Capacitor.registerPlugin('FirebaseAuthentication').signInWithGoogle({skipNativeAuth:true});
    assert.equal(result.credential.idToken,'test-token');
    assert.equal(calls.length,1);
    assert.equal(calls[0].name,'FirebaseAuthentication');
    assert.equal(calls[0].method,'signInWithGoogle');
    assert.equal(calls[0].options.skipNativeAuth,true);
});
