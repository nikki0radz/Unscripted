const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const values=new Map(),store=new Map(),events={};
const context={localStorage:{getItem:k=>store.get(k)||null},document:{documentElement:{style:{setProperty:(k,v)=>values.set(k,v)}},getElementById:()=>null},window:{addEventListener:(name,fn)=>events[name]=fn}};
vm.runInNewContext(fs.readFileSync('text-style.js','utf8'),context);
assert.equal(values.get('--question-size'),'16px');assert.equal(values.get('--heading-size'),'24px');
store.set('unscripted-text-style',JSON.stringify({font:'Classic serif',headingFont:'Clean Arial',bodySize:18,headingSize:20,questionSize:14}));context.window.UnscriptedTextStyle.apply();assert.equal(values.get('--reading-font'),'Georgia,serif');assert.equal(values.get('--heading-font'),'Arial,sans-serif');assert.equal(values.get('--question-size'),'14px');
context.window.UnscriptedTextStyle.apply({bodySize:999,questionSize:1,font:'url(evil)'});assert.equal(values.get('--reading-size'),'26px');assert.equal(values.get('--question-size'),'4px');assert.doesNotMatch(values.get('--reading-font'),/evil/);
console.log('Passed: live reading variables, saved font preferences, independent heading/question sizes and safe bounds.');

context.window.UnscriptedTextStyle.apply({overallScale:10,bodySize:14,headingSize:24,questionSize:16});
assert.equal(values.get('--text-scale'),'0.1');assert.equal(values.get('--reading-size'),'1.4px');assert.equal(values.get('--heading-size'),'2.4px');assert.equal(values.get('--question-size'),'1.6px');
context.window.UnscriptedTextStyle.apply({overallScale:75,bodySize:12,headingSize:20,questionSize:16});
assert.equal(values.get('--reading-size'),'9px');assert.equal(values.get('--heading-size'),'15px');assert.equal(values.get('--question-size'),'12px');
assert.equal(parseFloat(values.get('--heading-size'))/parseFloat(values.get('--question-size')),20/16,'overall scaling preserves the chosen proportions');
store.set('unscripted-text-style',JSON.stringify({overallScale:10,bodySize:4,headingSize:6,questionSize:4}));events['unscripted-settings']();assert.equal(values.get('--reading-size'),'0.4px');assert.equal(context.window.UnscriptedTextStyle.read().overallScale,10);
console.log('Passed: proportional 10–180% overall scale, sub-pixel lower end, and restoring saved scale.');


const api=context.window.UnscriptedTextStyle;
assert.equal(api.choices.length,6);
api.apply({font:'Handwritten',headingFont:'Gothic',questionFont:'Calligraphy',bodySize:14,headingSize:24,questionSize:16,overallScale:100});
assert.match(values.get('--reading-font'),/Caveat/);assert.match(values.get('--heading-font'),/UnifrakturCook/);assert.match(values.get('--question-font'),/Dancing Script/);
assert.equal(values.get('--reading-size'),'18.2px');assert.equal(values.get('--question-size'),'20.8px','calligraphy receives automatic optical compensation');
api.apply({font:'Handwritten',headingFont:'Brush',questionFont:'Calligraphy',bodySize:14,headingSize:24,questionSize:16,overallScale:50});assert.equal(values.get('--reading-size'),'9.1px');assert.equal(values.get('--question-size'),'10.4px');assert.match(values.get('--heading-font'),/Permanent Marker/);
store.set('unscripted-text-style',JSON.stringify({fontPreset:'gothic',font:'Soft sans',headingFont:'Soft sans',overallScale:65}));const migrated=api.read();assert.equal(migrated.font,'Gothic');assert.equal(migrated.questionFont,'Gothic');assert.equal(migrated.overallScale,65);assert.equal(migrated.fontPreset,undefined);
store.set('unscripted-text-style',JSON.stringify({font:'Typewriter',headingFont:'Gothic',questionFont:'Calligraphy',overallScale:75}));api.apply();assert.match(values.get('--reading-font'),/Special Elite/);assert.match(values.get('--heading-font'),/UnifrakturCook/);assert.match(values.get('--question-font'),/Dancing Script/);
console.log('Passed: six font choices, independent heading/question/text preferences, optical balance, proportional scaling and migration without losing saved sizes.');
