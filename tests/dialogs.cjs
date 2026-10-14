const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const elements=new Map(),listeners={};let focused;
const el=id=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:"",classList:{toggle(){}},focus(){focused=id}});return elements.get(id);};
const document={getElementById:el,activeElement:{focus(){focused="previous"}},addEventListener:(name,fn)=>listeners[name]=fn};
const context={document,window:{},Promise};
vm.runInNewContext(fs.readFileSync("dialogs.js","utf8"),context);
(async()=>{
 const yes=context.window.UnscriptedConfirm("Delete an entry?",{title:"Delete?",confirmLabel:"Delete entry",danger:true});
 assert.equal(el("appConfirmModal").hidden,false);assert.equal(el("appConfirmYes").textContent,"Delete entry");
 el("appConfirmYes").onclick();assert.equal(await yes,true);assert.equal(focused,"previous");
 const no=context.window.UnscriptedConfirm("Import?");el("appConfirmNo").onclick();assert.equal(await no,false);
 const escaped=context.window.UnscriptedConfirm("Restore?");listeners.keydown({key:"Escape",preventDefault(){},stopImmediatePropagation(){}});assert.equal(await escaped,false);
 console.log("Passed: styled confirmation acceptance/cancellation, escape and focus restoration.");
})().catch(e=>{console.error(e);process.exit(1)});
