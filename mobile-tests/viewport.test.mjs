import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('mobile/viewport.js','utf8');
test('Safari overlays track the keyboard and reset after leaving an input',()=>{
    const props=new Map(),events={},viewEvents={};
    const viewport={height:440,offsetTop:12,scale:1,addEventListener:(name,fn)=>viewEvents[name]=fn};
    const document={activeElement:{tagName:'INPUT'},documentElement:{style:{setProperty:(k,v)=>props.set(k,v),removeProperty:k=>props.delete(k)}},addEventListener:(name,fn)=>events[name]=fn};
    const window={innerHeight:844,visualViewport:viewport,addEventListener(){}};
    vm.runInNewContext(source,{window,document});
    assert.equal(props.get('--app-visible-height'),'440px');assert.equal(props.get('--app-hidden-bottom'),'392px');
    document.activeElement={tagName:'BUTTON'};events.focusout();assert.equal(props.size,0);
    document.activeElement={tagName:'TEXTAREA'};events.focusin();assert.equal(props.size,3);
    viewport.scale=2;viewEvents.resize();assert.equal(props.size,0,'pinch zoom must not be treated as a keyboard');
});
test('browsers without visualViewport keep CSS fallback sizing',()=>{
    assert.doesNotThrow(()=>vm.runInNewContext(source,{window:{},document:{}}));
});
