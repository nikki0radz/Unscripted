import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) Object.defineProperty(globalThis,"crypto",{value:webcrypto});
const {default:worker} = await import("../api/worker.js");
const {sessionCookie} = await import("../api/privacy.js");
const secret = "test-only-random-private-token-1234567890123456";
const origin = "https://diary.example.test";
const objects = new Map();
const bucket = {
  async put(key,value) {objects.set(key,{value:new Uint8Array(value),uploaded:new Date()});return {};},
  async get(key) {const row=objects.get(key);return row?{body:row.value}:null;},
  async list({prefix}) {return {objects:[...objects].filter(([k])=>k.startsWith(prefix)).map(([key,row])=>({key,uploaded:row.uploaded,size:row.value.length})),truncated:false};},
  async delete(keys) {for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key);}
};
const env = {DIARY_ACCESS_TOKEN:secret,ALLOWED_ORIGIN:"https://nikki0radz.github.io",DIARY_BACKUPS:bucket,ASSETS:{fetch:async()=>new Response("<html><head></head><body>Private app</body></html>",{headers:{"Content-Type":"text/html"}})}};
const req=(path,body,headers={})=>new Request(origin+path,{method:"POST",headers:{Origin:origin,"Content-Type":"application/json",...headers},body:typeof body==="string"||body instanceof Uint8Array?body:JSON.stringify(body||{})});
let r=await worker.fetch(new Request(origin+"/"),env);
assert.match(await r.text(),/Unlock Unscripted/);
r=await worker.fetch(new Request(origin+"/app.js"),env);assert.equal(r.status,401);
r=await worker.fetch(req("/session",{code:"wrong"}),env);assert.equal(r.status,401);
r=await worker.fetch(req("/session",{code:secret},{Origin:"https://evil.test"}),env);assert.equal(r.status,403);
r=await worker.fetch(req("/session",{code:secret}),env);
const cookie=r.headers.get("Set-Cookie");assert.match(cookie,/Secure; HttpOnly; SameSite=Lax/);
const cookieHeader=cookie.split(";")[0];
r=await worker.fetch(new Request(origin+"/session/status",{headers:{Cookie:cookieHeader}}),env);
assert.equal((await r.json()).signedIn,true);assert.match(r.headers.get("Set-Cookie"),/Max-Age=604800/);
r=await worker.fetch(new Request(origin+"/session/status"),env);assert.equal((await r.json()).signedIn,false);
r=await worker.fetch(new Request(origin+"/",{headers:{Cookie:cookieHeader}}),env);
assert.match(await r.text(),/unscripted-private-host/);
r=await worker.fetch(req("/backup/list"),env);assert.equal(r.status,401);
r=await worker.fetch(req("/backup/list",{}, {Cookie:cookieHeader,Origin:"https://evil.test"}),env);assert.equal(r.status,403);
vm.runInThisContext(fs.readFileSync(new URL("../backup-crypto.js",import.meta.url),"utf8"));
const C=globalThis.UnscriptedCrypto, salt=crypto.getRandomValues(new Uint8Array(16));
const password="test only long random recovery password";
const key=await C.derive(password,salt), plain=new TextEncoder().encode("private diary recording");
const encrypted=await C.encrypt(plain,key,salt), encrypted2=await C.encrypt(plain,key,salt);
assert.notDeepEqual(encrypted,encrypted2);
assert.deepEqual(await C.decrypt(encrypted,password),plain);
await assert.rejects(()=>C.decrypt(encrypted,"wrong password but long enough"));
const damaged=encrypted.slice();damaged[damaged.length-1]^=1;await assert.rejects(()=>C.decrypt(damaged,password));
const objectKey="clips/"+"a".repeat(64);
r=await worker.fetch(req("/backup/put?key="+objectKey,encrypted,{Cookie:cookieHeader}),env);assert.equal(r.status,200);
assert(!Buffer.from(objects.get("diary/"+objectKey).value).includes(Buffer.from(plain)));
r=await worker.fetch(req("/backup/get?key="+objectKey,{}, {Cookie:cookieHeader}),env);assert.equal(r.status,200);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),encrypted);
r=await worker.fetch(req("/backup/put?key="+objectKey,plain,{Cookie:cookieHeader}),env);assert.equal(r.status,400);
r=await worker.fetch(req("/backup/get?key=../secrets",{}, {Cookie:cookieHeader}),env);assert.equal(r.status,400);
for(let i=0;i<9;i++){
  const snapshotKey="snapshots/"+"b".repeat(32)+"/"+(1700000000000+i)+"-"+"c".repeat(16);
  r=await worker.fetch(req("/backup/put?key="+snapshotKey,encrypted,{Cookie:cookieHeader}),env);assert.equal(r.status,200);
}
assert.equal((await bucket.list({prefix:"diary/snapshots/"})).objects.length,7);
r=await worker.fetch(req("/backup/list",{}, {Cookie:cookieHeader}),{...env,OPENAI_API_KEY:undefined});assert.equal(r.status,200);
r=await worker.fetch(new Request(origin+"/",{headers:{Cookie:cookieHeader}}),{...env,DIARY_ACCESS_TOKEN:"changed-secret"});assert.match(await r.text(),/Unlock Unscripted/);
globalThis.fetch=async(_url,options)=>{
  const body=JSON.parse(options.body);assert.match(body.instructions,/exactly ONE/);assert.match(body.instructions,/motives are unknown/);
  return new Response(JSON.stringify({output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({question:"What evidence would change your interpretation of this situation?",sourceIds:["selected","invented"]})}]}]}));
};
r=await worker.fetch(req("/reflect",{entry:{id:"selected",text:"I feel ignored by my partner."},sources:[],profile:"",previous:[]},{Cookie:cookieHeader}),{...env,OPENAI_API_KEY:"test-key"});
const reflection=await r.json();assert.equal(r.status,200);assert.equal((reflection.question.match(/\?/g)||[]).length,1);assert.deepEqual(reflection.sourceIds,["selected"]);
globalThis.fetch=async()=>new Response(JSON.stringify({output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({question:"Why? And what next?",sourceIds:[]})}]}]}));
r=await worker.fetch(req("/reflect",{entry:{id:"selected",text:"A thought."}},{Cookie:cookieHeader}),{...env,OPENAI_API_KEY:"test-key"});assert.equal(r.status,400);
console.log("Passed: private sign-in, origin checks, secret rotation, encryption round-trip/wrong-password/tampering, authenticated encrypted R2 backup and retention, one-question reflection validation.");
