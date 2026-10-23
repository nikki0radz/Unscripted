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

for(const preset of context.window.UnscriptedTextStyle.presets){context.window.UnscriptedTextStyle.apply({fontPreset:preset.id,overallScale:75,bodySize:12,headingSize:20,questionSize:16});assert.equal(values.get('--reading-size'),'9px','choosing a font preset leaves size ratios alone');if(preset.id!=='diary')assert.equal(values.get('--reading-font'),values.get('--heading-font'),'single-font styles use the same font throughout');}
store.set('unscripted-text-style',JSON.stringify({fontPreset:'classic',font:'Soft sans',headingFont:'Clean Arial',overallScale:65,bodySize:13}));context.window.UnscriptedTextStyle.apply();assert.equal(values.get('--reading-font'),'Georgia,serif');assert.equal(values.get('--heading-font'),'Georgia,serif');assert.equal(context.window.UnscriptedTextStyle.read().overallScale,65);
store.set('unscripted-text-style',JSON.stringify({font:'Soft sans',headingFont:'Soft sans'}));assert.equal(context.window.UnscriptedTextStyle.read().fontPreset,'soft','matching old choices migrate to a preset');
store.set('unscripted-text-style',JSON.stringify({font:'Classic serif',headingFont:'Clean Arial'}));assert.equal(context.window.UnscriptedTextStyle.read().fontPreset,'current','old custom combinations are preserved until a new style is chosen');
console.log('Passed: one-choice font looks, single-font consistency, saved preset restore, size preservation and legacy font migration.');
