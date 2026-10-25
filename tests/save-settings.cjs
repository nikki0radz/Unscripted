const assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('app.js','utf8'),start=source.indexOf('  async function saveSettingsAndReturn()'),end=source.indexOf('  function saveApiSettings()',start);
let savedTone=0,savedText=0,back=0,toast='',fail=false;
const button={disabled:false},status={scrollIntoView(){}};
const elements={saveSettingsButton:button,defaultToneControls:{firstElementChild:{saveSettings:async()=>{savedTone++;return !fail}}},textStyleControls:{saveSettings:()=>savedText++},settingsStatus:status};
const handler=new Function('$','document','saveApiSettings','window','Event','showToast','setTimeout','state',source.slice(start,end)+'return saveSettingsAndReturn;')(
id=>elements[id],{activeElement:{blur(){}}},()=>true,{dispatchEvent:e=>{if(e.type==='unscripted-back')back++}},Event,message=>toast=message,fn=>{fn();return 1},{view:'settings'});
(async()=>{await handler();assert.equal(savedTone,1);assert.equal(savedText,1);assert.equal(back,1);assert.equal(toast,'✓ Changes saved');assert.equal(button.disabled,false);fail=true;await handler();assert.equal(back,1,'failed saves stay on settings');assert.match(toast,/Could not save/);console.log('Passed: Save flushes style changes, confirms success and returns; failed persistence stays on Settings.');})().catch(e=>{console.error(e);process.exit(1)});
