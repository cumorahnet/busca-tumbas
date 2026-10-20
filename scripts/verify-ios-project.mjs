import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const plist=require('plist');
const xcode=require('xcode');
const info=plist.parse(fs.readFileSync('ios/App/App/Info.plist','utf8'));
for(const key of ['NSCameraUsageDescription','NSPhotoLibraryUsageDescription','NSLocationWhenInUseUsageDescription'])assert.ok(info[key],key+' missing');
assert.equal(info.UIFileSharingEnabled,true);assert.equal(info.LSSupportsOpeningDocumentsInPlace,true);
const config=plist.parse(fs.readFileSync('ios/App/App/GoogleService-Info.plist','utf8'));
assert.equal(config.BUNDLE_ID,'com.cumorahnet.buscatumbas');
assert.ok(info.CFBundleURLTypes.some(t=>t.CFBundleURLSchemes.includes(config.REVERSED_CLIENT_ID)),'Google callback missing');
const project=xcode.project('ios/App/App.xcodeproj/project.pbxproj');project.parseSync();
const refs=Object.values(project.hash.project.objects.PBXFileReference).filter(r=>r&&typeof r==='object');
for(const name of ['AppViewController.swift','PublicDownloadsPlugin.swift','GoogleService-Info.plist']){
    assert.ok(refs.some(r=>String(r.path).replaceAll('"','')===name),'Missing Xcode file '+name);
    assert.ok(fs.existsSync('ios/App/App/'+name));
}
const scene=fs.readFileSync('ios/App/App/SceneDelegate.swift','utf8');
assert.ok(scene.includes('rootViewController = AppViewController()'));
assert.ok(fs.readFileSync('ios/App/App/AppViewController.swift','utf8').includes('registerPluginInstance(PublicDownloadsPlugin())'));
assert.ok(fs.readFileSync('ios/App/CapApp-SPM/Package.swift','utf8').includes('CapacitorFirebaseAuthentication'));
assert.ok(JSON.parse(fs.readFileSync('firebase.json','utf8')).hosting.ignore.includes('ios/**'));
console.log('iOS project references, Google callback, permissions, native downloads and hosting exclusions verified. This is not an Xcode build or an iPhone device test.');
