const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const values=new Map(),store=new Map(),events={};
const context={localStorage:{getItem:k=>store.get(k)||null},document:{documentElement:{style:{setProperty:(k,v)=>values.set(k,v)}},getElementById:()=>null},window:{addEventListener:(name,fn)=>events[name]=fn}};
vm.runInNewContext(fs.readFileSync('text-style.js','utf8'),context);
assert.equal(values.get('--question-size'),'16px');assert.equal(values.get('--heading-size'),'24px');
store.set('unscripted-text-style',JSON.stringify({font:'Classic serif',headingFont:'Clean Arial',bodySize:18,headingSize:20,questionSize:14}));context.window.UnscriptedTextStyle.apply();assert.equal(values.get('--reading-font'),'Georgia,serif');assert.equal(values.get('--heading-font'),'Arial,sans-serif');assert.equal(values.get('--question-size'),'14px');
context.window.UnscriptedTextStyle.apply({bodySize:999,questionSize:1,font:'url(evil)'});assert.equal(values.get('--reading-size'),'22px');assert.equal(values.get('--question-size'),'13px');assert.doesNotMatch(values.get('--reading-font'),/evil/);
console.log('Passed: live reading variables, saved font preferences, independent heading/question sizes and safe bounds.');
