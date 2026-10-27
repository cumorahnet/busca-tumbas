import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8');
function setup(){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,textContent:'',style:{},setAttribute(){},classList:{items:new Set(),toggle(name,on){if(on)this.items.add(name);else this.items.delete(name);}}});return nodes.get(id)};
 const ctx={document:{getElementById:node},benefitStatus:null,auth:{currentUser:{uid:'user'}},window:{location:{href:''},Capacitor:{isNativePlatform:()=>false}},SUPPORT_EMAIL:'test@example.com'};
 vm.createContext(ctx);for(const name of ['formatBenefitDate','renderBenefitStatus','renderPublicBenefitStatus','requestPlusPurchase'])vm.runInContext(html.match(new RegExp('function '+name+'\\([^]*?\\n}'))[0],ctx);
 return {ctx,node};
}
const base={adFree:false,contributionCount:15,contributionsPerReward:10,contributionsToNextReward:5,rewardDays:30};
test('launch hides advertising and purchases even when an individual entitlement is absent',()=>{
 const s=setup();s.ctx.renderBenefitStatus({...base,monetization:{launchActive:true,launchEndsAt:'2027-01-02T00:00:00-06:00',adsEnabled:false,plusSalesEnabled:false}});
 assert.equal(s.node('main-app').classList.items.has('show-ads'),false);assert.equal(s.node('request-plus-btn').hidden,true);assert.equal(s.node('request-plus-btn').disabled,true);
 assert.match(s.node('benefits-title').textContent,/Lanzamiento/);assert.match(s.node('benefits-description').textContent,/1 de enero de 2027/);assert.match(s.node('benefits-progress-text').textContent,/acumulan/);
});
test('missing policy stays ad-free and prevents direct purchase invocation',()=>{
 const s=setup();s.ctx.renderBenefitStatus(base);s.ctx.requestPlusPurchase();assert.equal(s.node('main-app').classList.items.has('show-ads'),false);assert.equal(s.node('request-plus-btn').hidden,true);assert.equal(s.ctx.window.location.href,'');
});

test('the annual promotion shows progress, earned expiry and a clean public description',()=>{
 const s=setup();
 s.ctx.renderBenefitStatus({...base,firstMonthReward:{count:49,deadline:'2099-11-26T12:00:00Z'}});
 assert.match(s.node('first-month-reward-description').textContent,/49 de 50/);
 s.ctx.renderBenefitStatus({...base,firstMonthReward:{qualified:true,adFreeUntil:'2027-11-12T12:00:00Z'}});
 assert.match(s.node('first-month-reward-description').textContent,/Meta cumplida/);
 assert.match(s.node('first-month-reward-description').textContent,/2027/);
 s.ctx.renderPublicBenefitStatus();
 assert.match(s.node('first-month-reward-description').textContent,/50 aportaciones válidas/);
 assert.doesNotMatch(s.node('first-month-reward-description').textContent,/Meta cumplida|49 de 50/);
 assert.equal(s.node('benefits-progress').hidden,true);
});
test('explicit post-launch activation restores ads for free users and respects ad-free benefits',()=>{
 const s=setup();const monetization={adsEnabled:true,plusSalesEnabled:true};s.ctx.renderBenefitStatus({...base,monetization});assert.equal(s.node('main-app').classList.items.has('show-ads'),true);assert.equal(s.node('request-plus-btn').hidden,false);
 s.ctx.renderBenefitStatus({...base,monetization,adFree:true,source:'paid'});assert.equal(s.node('main-app').classList.items.has('show-ads'),false);
});
