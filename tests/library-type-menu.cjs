const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {normalize,toggleType,caption}=require('../library-type-menu.js');
assert.deepEqual(normalize(['questions','diary','diary','bad']),['diary','questions']);
assert.deepEqual(normalize(['all','diary']),[]);
assert.deepEqual(toggleType(['diary'],'questions'),['diary','questions']);
assert.deepEqual(toggleType(['diary','questions'],'diary'),['questions']);
assert.deepEqual(toggleType(['questions'],'questions'),[]);
assert.deepEqual(toggleType(['diary','questions'],'all'),[]);
assert.equal(caption([]),'Everything');assert.equal(caption(['diary','questions']),'2 types');
const app=fs.readFileSync('app.js','utf8'),state={libraryKind:['diary','questions'],topic:'All'};
const c={state,allParts:e=>e.parts||[],sortedParts:e=>e.parts||[]};vm.createContext(c);
vm.runInContext(app.slice(app.indexOf('  function libraryKinds'),app.indexOf('  function markText')),c);
const diary={id:'d',kind:'diary',parts:[{id:'d1',type:'note',text:'hello',answer:'hello'}]};
const interview={id:'i',kind:'interview',parts:[{id:'i1',type:'note',answer:'hello',interviewQuestion:true},{id:'i2',type:'note',answer:'hello'}]};
assert(c.libraryCardMatches(diary));assert(!c.libraryCardMatches(interview));
assert(c.libraryPartMatches(diary.parts[0],diary));assert(c.libraryPartMatches(interview.parts[0],interview));assert(!c.libraryPartMatches(interview.parts[1],interview));
assert(!c.libraryEntryMatches({kind:'diaryChat'}));
state.libraryKind=['questions','perspectives'];assert(c.libraryQuestionMatches({interviewQuestion:true}));assert(c.libraryQuestionMatches({reflectionAnswer:true}));assert(!c.libraryQuestionMatches({reflectionAnswer:true,parentQuestionId:'p'}));
state.libraryKind=['all'];assert(c.libraryCardMatches(diary));assert(c.libraryCardMatches(interview));
// Run the real menu with minimal DOM to verify persistence, open state and focus restoration.
function harness(saved='[]'){
 const nodes={},listeners={},calls=[];let document;
 function el(){return {hidden:false,children:[],style:{},classList:{toggle(){}},setAttribute(k,v){this[k]=v},append(...x){this.children.push(...x)},focus(){document.activeElement=this},querySelectorAll(){return [nodes.libraryTypeClose,...nodes.libraryTypeOptions.children.map(r=>r.children[2]),nodes.libraryTypeDone]}};}
 for(const id of ['libraryTypeModal','libraryKindButton','libraryTypeOptions','libraryKindLabel','libraryTypeCount','libraryTypeClose','libraryTypeDone'])nodes[id]=el();
 nodes.libraryTypeModal.hidden=true;const shell=el();shell.inert=false;
 document={body:el(),activeElement:nodes.libraryKindButton,getElementById:id=>nodes[id],querySelector:()=>shell,createElement:el,createElementNS:el,addEventListener:(k,fn)=>listeners[k]=fn};
 const localStorage={getItem:()=>saved,setItem:(k,v)=>saved=v};
 vm.runInNewContext(fs.readFileSync('library-type-menu.js','utf8'),{document,localStorage,window:{UnscriptedDiary:{setLibraryTypes:v=>calls.push([...v])},addEventListener(){}}});
 return {nodes,document,shell,calls,listeners,saved:()=>saved};
}
const h=harness();h.nodes.libraryKindButton.onclick();assert.equal(h.nodes.libraryTypeModal.hidden,false);assert.equal(h.shell.inert,true);
h.nodes.libraryTypeOptions.children[1].children[2].onchange();h.nodes.libraryTypeOptions.children[3].children[2].onchange();
assert.deepEqual(h.calls.at(-1),['diary','questions']);assert.equal(h.nodes.libraryTypeModal.hidden,false);assert.equal(h.nodes.libraryKindLabel.textContent,'2 types');
h.nodes.libraryTypeDone.onclick();assert.equal(h.nodes.libraryTypeModal.hidden,true);assert.equal(h.shell.inert,false);assert.equal(h.document.activeElement,h.nodes.libraryKindButton);
assert.deepEqual(harness(h.saved()).calls.at(-1),['diary','questions']);assert.deepEqual(harness('{broken').calls.at(-1),['all']);
h.nodes.libraryKindButton.onclick();h.listeners.keydown({key:'Escape',preventDefault(){},stopImmediatePropagation(){}});assert(h.nodes.libraryTypeModal.hidden);
h.nodes.libraryKindButton.onclick();h.nodes.libraryTypeModal.onclick({target:h.nodes.libraryTypeModal});assert(h.nodes.libraryTypeModal.hidden);
console.log('Passed: multi-type union, reset, search-part scope, persistence, sheet interactions and focus restoration.');
