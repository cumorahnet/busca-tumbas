import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('index.html','utf8');
const context={};
vm.createContext(context);
for(const name of ['escapeHtml','inlineJsValue']) vm.runInContext(html.match(new RegExp('function '+name+'\\([^]*?\\n}'))[0],context);
test('untrusted inline arguments remain data after HTML decoding',()=>{
 for(const payload of ["O'Brien",'&quot;);attack();//',"');attack();//",'\" autofocus onfocus=attack() x=\"','<img src=x onerror=attack()>','\\\";attack();//']) {
  const encoded=context.inlineJsValue(payload);
  assert.ok(!/[<>"']/.test(encoded));
  const entities={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"};
  const decoded=encoded.replace(/&(amp|lt|gt|quot|#39);/g,value=>entities[value]);
  let actual;
  vm.runInNewContext('receive('+decoded+')',{receive:value=>{actual=value;},attack:()=>assert.fail('Injected script executed')});
  assert.equal(actual,payload);
 }
});
test('all inline script blocks compile',()=>{
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});
