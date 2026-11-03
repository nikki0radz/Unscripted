const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const app = fs.readFileSync('app.js', 'utf8');
const elements = new Map(), entries = new Map();
const $ = id => { if (!elements.has(id)) elements.set(id, {hidden:true, value:'', focus(){}}); return elements.get(id); };
let nextId = 0, fail = false, saves = 0, opened = null, release;
const ctx = { $, state:{}, document:{activeElement:{focus(){}}}, uid:()=>String(++nextId), fmtDate:()=>'',
  showToast(){}, activeAI:()=>false, openEntry:id=>opened=id, refreshEntries:async()=>{},
  transaction:async (_s,_m,cb)=>cb({get:id=>structuredClone(entries.get(id))}),
  saveEntry:async entry=>{saves++;if(release)await new Promise(r=>release=r);if(fail)throw Error('Storage full');entries.set(entry.id,structuredClone(entry));}
};
vm.createContext(ctx);
vm.runInContext(app.slice(app.indexOf('  let editorSaving'), app.indexOf('  function supportedMime')), ctx);
(async()=>{
  await ctx.writeThought(null); assert.equal(entries.size,0); ctx.closeEditor(); assert.equal(entries.size,0);
  await ctx.writeThought(null); $('editorInput').value='  '; await ctx.submitEditor(); assert.equal(entries.size,0); assert.equal($('editorModal').hidden,false);
  $('editorInput').value='Remember this at work\nTalk about it later'; fail=true; await ctx.submitEditor();
  assert.equal(entries.size,0); assert.equal($('editorModal').hidden,false); assert.match($('editorInput').value,/Remember/);
  fail=false; await ctx.submitEditor(); assert.equal(entries.size,1); assert.equal($('editorModal').hidden,true);
  const first=entries.get(opened); assert.equal(first.title,'Remember this at work'); assert.equal(first.parts[0].type,'note'); assert.match(first.parts[0].text,/Talk about it later/);
  await ctx.writeThought(opened); $('editorInput').value='An addition'; await ctx.submitEditor(); assert.equal(entries.size,1); assert.equal(entries.get(opened).parts.length,2);
  await ctx.writeThought(null); $('editorInput').value='Only once'; release=true; const before=saves;
  const pending=ctx.submitEditor(); await ctx.submitEditor(); assert.equal(saves,before+1); ctx.closeEditor(); assert.equal($('editorModal').hidden,false); release(); release=null; await pending;
  assert.equal(entries.size,2); assert.equal($('editorSave').disabled,false);
  console.log('Passed: offline text save, cancel/blank without empty entries, failure retains text, add to existing entry, duplicate-save guard.');
})().catch(e=>{console.error(e);process.exitCode=1;});
