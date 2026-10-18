import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8');
function setup(){
    const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:''});return nodes.get(id)};
    const ctx={document:{getElementById:node},birthYearWasEstimated:false,deathAgeWasCalculated:false};
    vm.createContext(ctx);vm.runInContext(html.match(/const mesesES = \[[^]*?\];/)[0],ctx);
    for(const name of ['parseSpanishDateToISO','calculateAgeFromDates','updateCalculatedDeathAge','calculateEstimatedBirthYear','markBirthDateAsManual','markDeathAgeAsManual'])
        vm.runInContext(html.match(new RegExp('function '+name+'\\([^]*?\\n}'))[0],ctx);
    return {ctx,node};
}
test('age uses completed birthdays and accepts valid full Spanish or ISO dates',()=>{
    const {ctx}=setup();
    for(const [birth,death,age] of [
        ['10 de Mayo de 1950','9 de Mayo de 2020',69],['10 de Mayo de 1950','10 de Mayo de 2020',70],
        ['1950-05-10','2020-05-11',70],['2020-01-01','2020-01-01',0],
        ['2020-01-01','2020-12-31',0],['2000-02-29','2021-02-28',20],['2000-02-29','2021-03-01',21]])
        assert.equal(ctx.calculateAgeFromDates(birth,death),age);
});
test('incomplete, impossible, reversed or out-of-range dates cannot invent an age',()=>{
    const {ctx}=setup();
    for(const [birth,death] of [['1950','2020'],['Mayo de 1950','10 de Mayo de 2020'],['1950-05','2020-05-10'],
        ['2001-02-29','2020-05-10'],['31 de Abril de 1950','10 de Mayo de 2020'],['2021-01-01','2020-01-01'],
        ['1800-01-01','2000-01-01'],['','2020-01-01']])assert.equal(ctx.calculateAgeFromDates(birth,death),null);
});
test('automatic age updates with dates and disappears when full dates are no longer present',()=>{
    const s=setup();s.node('display-fecha-nacimiento').value='10 de Mayo de 1950';s.node('display-fecha-defuncion').value='9 de Mayo de 2020';
    s.ctx.calculateEstimatedBirthYear();assert.equal(s.node('display-edad-defuncion').value,'69');assert.match(s.node('death-age-calculation-hint').textContent,/calculada/);
    s.node('display-fecha-defuncion').value='10 de Mayo de 2020';s.ctx.calculateEstimatedBirthYear();assert.equal(s.node('display-edad-defuncion').value,'70');
    s.node('display-fecha-nacimiento').value='1950';s.ctx.markBirthDateAsManual();assert.equal(s.node('display-edad-defuncion').value,'');
    assert.equal(s.node('death-age-calculation-hint').textContent,'');
});
test('explicit ages are preserved and birth-year estimation remains independent',()=>{
    const s=setup();s.node('display-fecha-nacimiento').value='10 de Mayo de 1950';s.node('display-fecha-defuncion').value='9 de Mayo de 2020';
    s.node('display-edad-defuncion').value='70';s.ctx.calculateEstimatedBirthYear();assert.equal(s.node('display-edad-defuncion').value,'70');
    s.node('display-fecha-nacimiento').value='';s.ctx.markDeathAgeAsManual();assert.equal(s.node('display-fecha-nacimiento').value,'1950');assert.equal(s.ctx.birthYearWasEstimated,true);
    s.node('display-edad-defuncion').value='';s.ctx.markDeathAgeAsManual();assert.equal(s.node('display-fecha-nacimiento').value,'');assert.equal(s.node('display-edad-defuncion').value,'');
});
