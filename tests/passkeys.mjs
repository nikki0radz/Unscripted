import assert from "node:assert/strict";
import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {passkeys} from "../api/passkeys.js";
const origin="https://private.example.test",secret="test-only-access-code-012345678901234567890",rows=new Map();let version=0;
const bucket={
 async put(key,value,options={}){const row=rows.get(key);if(options.onlyIf?.etagMatches&&row?.etag!==options.onlyIf.etagMatches)return null;rows.set(key,{value:String(value),etag:String(++version),uploaded:new Date()});return{};},
 async get(key){const row=rows.get(key);return row?{etag:row.etag,text:async()=>row.value}:null;},
 async list({prefix,limit}){return{objects:[...rows].filter(([key])=>key.startsWith(prefix)).slice(0,limit).map(([key,row])=>({key,uploaded:row.uploaded})),truncated:false};},
 async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])rows.delete(key);}
};
const env={DIARY_ACCESS_TOKEN:secret,DIARY_BACKUPS:bucket};
const request=(path,body={},requestOrigin=origin)=>new Request(origin+path,{method:"POST",headers:{Origin:requestOrigin,"Content-Type":"application/json"},body:JSON.stringify(body)});
const b64=b=>Buffer.from(b).toString("base64url");
function head(type,n){if(n<24)return Buffer.from([type*32+n]);if(n<256)return Buffer.from([type*32+24,n]);return Buffer.from([type*32+25,n>>8,n&255]);}
function cbor(v){
 if(typeof v==="number")return v>=0?head(0,v):head(1,-1-v);
 if(typeof v==="string"){const b=Buffer.from(v);return Buffer.concat([head(3,b.length),b]);}
 if(v instanceof Uint8Array)return Buffer.concat([head(2,v.length),Buffer.from(v)]);
 if(v instanceof Map)return Buffer.concat([head(5,v.size),...[...v].flatMap(([k,value])=>[cbor(k),cbor(value)])]);
 throw Error("Unsupported test CBOR value");
}
let r=await passkeys(request("/passkeys/register/options"),env,false);assert.equal(r.status,401);
r=await passkeys(request("/passkeys/login/options",{},"https://evil.test"),env,false);assert.equal(r.status,403);
r=await passkeys(request("/passkeys/register/options"),env,true);assert.equal(r.status,200);
const registration=await r.json();assert.equal(registration.authenticatorSelection.userVerification,"required");
const {privateKey,publicKey}=generateKeyPairSync("ec",{namedCurve:"prime256v1"}),jwk=publicKey.export({format:"jwk"});
const credentialId=crypto.getRandomValues(new Uint8Array(32)),rpHash=createHash("sha256").update("private.example.test").digest();
const cose=cbor(new Map([[1,2],[3,-7],[-1,1],[-2,Buffer.from(jwk.x,"base64url")],[-3,Buffer.from(jwk.y,"base64url")]]));
const length=Buffer.alloc(2);length.writeUInt16BE(credentialId.length);
const authenticatorData=Buffer.concat([rpHash,Buffer.from([0x45]),Buffer.alloc(4),Buffer.alloc(16),length,credentialId,cose]);
const client=Buffer.from(JSON.stringify({type:"webauthn.create",challenge:registration.challenge,origin,crossOrigin:false}));
const created={id:b64(credentialId),rawId:b64(credentialId),type:"public-key",response:{clientDataJSON:b64(client),attestationObject:b64(cbor(new Map([["fmt","none"],["attStmt",new Map()],["authData",authenticatorData]]))),transports:["internal"]},clientExtensionResults:{}};
r=await passkeys(request("/passkeys/register/verify",created),env,true);assert.equal(r.status,200,await r.clone().text());
assert(rows.has("auth/keys/"+created.id));
r=await passkeys(request("/passkeys/register/verify",created),env,true);assert.equal(r.status,400,"registration challenge must not replay");
async function assertion(counter=1,flags=5,clientOrigin=origin){
 const options=await (await passkeys(request("/passkeys/login/options"),env,false)).json();
 const c=Buffer.from(JSON.stringify({type:"webauthn.get",challenge:options.challenge,origin:clientOrigin,crossOrigin:false}));
 const count=Buffer.alloc(4);count.writeUInt32BE(counter);
 const data=Buffer.concat([rpHash,Buffer.from([flags]),count]);
 const signature=sign("sha256",Buffer.concat([data,createHash("sha256").update(c).digest()]),privateKey);
 return{id:created.id,rawId:created.id,type:"public-key",response:{clientDataJSON:b64(c),authenticatorData:b64(data),signature:b64(signature),userHandle:registration.user.id},clientExtensionResults:{}};
}
const login=await assertion();r=await passkeys(request("/passkeys/login/verify",login),env,false);assert.equal(r.status,200,await r.clone().text());assert.match(r.headers.get("Set-Cookie"),/HttpOnly/);
r=await passkeys(request("/passkeys/login/verify",login),env,false);assert.equal(r.status,400,"login assertion cannot replay");
r=await passkeys(request("/passkeys/login/verify",await assertion(2,1)),env,false);assert.equal(r.status,400,"user verification is mandatory");
r=await passkeys(request("/passkeys/login/verify",await assertion(2,5,"https://evil.test")),env,false);assert.equal(r.status,400,"wrong credential origin must fail");
const tampered=await assertion(2);tampered.response.signature=b64(Buffer.from("bad-signature"));
r=await passkeys(request("/passkeys/login/verify",tampered),env,false);assert.equal(r.status,400,"bad signature must fail");
console.log("Passed: real signed WebAuthn registration/login, mandatory user verification, origin checks, invalid signatures and replay rejection.");
