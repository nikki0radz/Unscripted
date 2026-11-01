const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {compile} = require('../design-preview.js');
const base = {schema:1,revision:'test-1',label:'Softer cards',rules:[{target:'libraryCards',styles:{'border-radius':20,'padding':16}}]};
assert.match(compile(base),/\.entry-card\{border-radius:20px !important;padding:16px !important\}/);
assert.equal(compile({...base,rules:[]}), '');
for (const rule of [
  {target:'body',styles:{color:'#ffffff'}},
  {target:'libraryCards',styles:{background:'url(https://example.com)'}},
  {target:'libraryCards',styles:{color:'red;display:none'}},
  {target:'libraryCards',styles:{display:'none'}},
  {target:'libraryCards',styles:{'font-size':0}},
  {target:'libraryCards',styles:{position:'fixed'}},
  {target:'__proto__',styles:{padding:20}}
]) assert.throws(()=>compile({...base,rules:[rule]}));

function setup(saved) {
  const nodes = new Map(), storage = new Map();
  if (saved) storage.set('unscripted-design-preview-v1',saved);
  const el = id => {if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,checked:false,textContent:''});return nodes.get(id);};
  let response=base,fail=false,resolveFetch=null; const requests=[];
  const context={window:{UnscriptedAndroid:{}},document:{getElementById:el,createElement:()=>el('style'),head:{append(){}}},
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    AbortController,TextDecoder,Uint8Array,setTimeout,clearTimeout,
    fetch:async(url,options)=>{requests.push({url,options});if(fail)throw Error('offline');if(resolveFetch)await resolveFetch;
      let done=false;return {ok:true,headers:{get:()=>null},body:{getReader:()=>({read:async()=>{
        if(done)return {done:true};done=true;return {done:false,value:new TextEncoder().encode(JSON.stringify(response))};},cancel:async()=>{}})}};}
  };
  vm.runInNewContext(fs.readFileSync('design-preview.js','utf8'),context);
  return {el,storage,requests,setResponse:v=>response=v,setFail:v=>fail=v,hold:p=>resolveFetch=p};
}
(async()=>{
  const ui=setup(); assert.equal(ui.requests.length,0,'No preview request without opt-in');
  assert.equal(ui.el('style').textContent,'');
  await ui.el('refreshDesignPreview').onclick();
  assert.match(ui.el('style').textContent,/border-radius:20px/);
  assert.equal(ui.el('designPreviewEnabled').checked,true);
  assert.equal(ui.requests[0].url,'/__native/design-preview');
  assert.equal(ui.requests[0].options.credentials,'omit');
  ui.setFail(true);await ui.el('refreshDesignPreview').onclick();
  assert.match(ui.el('style').textContent,/border-radius:20px/,'Offline keeps last valid preview');
  const restored=setup(ui.storage.get('unscripted-design-preview-v1'));
  assert.match(restored.el('style').textContent,/border-radius:20px/,'Offline cache restores without fetch');
  restored.el('designPreviewBadge').onclick();
  assert.equal(restored.el('style').textContent,'','One-tap restore removes all preview rules');
  assert.equal(JSON.parse(restored.storage.get('unscripted-design-preview-v1')).enabled,false);
  ui.setFail(false);ui.setResponse({...base,rules:[{target:'settings',styles:{display:'none'}}]});
  await ui.el('refreshDesignPreview').onclick();assert.match(ui.el('style').textContent,/border-radius:20px/);
  let release;ui.hold(new Promise(r=>release=r));ui.setResponse(base);
  const pending=ui.el('refreshDesignPreview').onclick();ui.el('stopDesignPreview').onclick();release();await pending;
  assert.equal(ui.el('style').textContent,'','Finishing download cannot re-enable a disabled preview');
  const broken=setup('{broken');assert.equal(broken.el('style').textContent,'');
  console.log('Passed: constrained appearance rules, opt-in, refresh, cached/offline fallback, restore and cancellation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
