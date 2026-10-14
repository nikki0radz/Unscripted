import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from "./webauthn-vendor.js";
import {sessionCookie} from "./privacy.js";
const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
const decode = text => Uint8Array.from(atob(text.replaceAll("-","+").replaceAll("_","/")),x=>x.charCodeAt(0));
const bytes = text => new TextEncoder().encode(text);
const validId = id => typeof id==="string" && /^[A-Za-z0-9_-]{8,1400}$/.test(id);
async function digest(text){return encode(await crypto.subtle.digest("SHA-256",bytes(text)));}
export async function passkeys(request,env,session) {
  const response=(payload,status=200,headers={})=>new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store",...headers}});
  const url=new URL(request.url),path=url.pathname;
  if(request.method!=="POST" || request.headers.get("Origin")!==url.origin)return response({error:"Passkey sign-in must use the private diary address."},403);
  if(!env.DIARY_ACCESS_TOKEN||!env.DIARY_BACKUPS)return response({error:"Passkeys need the private storage binding and diary access code configured."},503);
  const registering=path.startsWith("/passkeys/register/");
  if(registering&&!session)return response({error:"Sign in with your diary code before adding a passkey."},401);
  const bucket=env.DIARY_BACKUPS,version=await digest("passkey-registry:"+env.DIARY_ACCESS_TOKEN),rpID=url.hostname;
  const read=async key=>{const object=await bucket.get(key);return object?{object,data:JSON.parse(await object.text())}:null;};
  const write=async(key,value,options={})=>bucket.put(key,JSON.stringify(value),{httpMetadata:{contentType:"application/json",cacheControl:"no-store"},...options});
  async function saveChallenge(options,purpose) {
    await write("auth/challenges/"+options.challenge,{purpose,version,origin:url.origin,expires:Date.now()+180000});
    // Clear abandoned, expired challenges in bounded batches.
    const old=await bucket.list({prefix:"auth/challenges/",limit:100});
    const stale=old.objects.filter(x=>Date.now()-new Date(x.uploaded).getTime()>600000).map(x=>x.key);
    if(stale.length)await bucket.delete(stale);
  }
  async function claimChallenge(credential,purpose) {
    if(!credential?.response||typeof credential.response.clientDataJSON!=="string"||credential.response.clientDataJSON.length>10000)throw new Error("Invalid passkey response.");
    const client=JSON.parse(new TextDecoder().decode(decode(credential.response.clientDataJSON)));
    if(!validId(client.challenge))throw new Error("Invalid passkey challenge.");
    const key="auth/challenges/"+client.challenge,stored=await read(key);
    if(!stored||stored.data.purpose!==purpose||stored.data.version!==version||stored.data.origin!==url.origin||stored.data.expires<Date.now()||stored.data.used)throw new Error("This sign-in request expired or was already used. Try again.");
    // R2 conditional write makes the challenge single-use even with concurrent requests.
    const claimed=await write(key,{...stored.data,used:true},{onlyIf:{etagMatches:stored.object.etag}});
    if(!claimed)throw new Error("This sign-in request was already used. Try again.");
    return client.challenge;
  }
  try {
    if(path==="/passkeys/register/options"){
      const listing=await bucket.list({prefix:"auth/keys/",limit:20}),existing=[];
      for(const item of listing.objects){const row=await read(item.key);if(row?.data.version===version&&row.data.origin===url.origin)existing.push(row.data);}
      if(existing.length>=10)return response({error:"Ten passkeys are already registered."},400);
      const options=await generateRegistrationOptions({rpName:"Unscripted diary",rpID,userName:"My private diary",userDisplayName:"Unscripted",userID:bytes(await digest("diary-owner:"+rpID)),attestationType:"none",excludeCredentials:existing.map(x=>({id:x.id,transports:x.transports})),authenticatorSelection:{residentKey:"required",userVerification:"required",authenticatorAttachment:"platform"},supportedAlgorithmIDs:[-7,-257]});
      await saveChallenge(options,"register");return response(options);
    }
    if(path==="/passkeys/login/options"){
      const options=await generateAuthenticationOptions({rpID,userVerification:"required"});
      await saveChallenge(options,"login");return response(options);
    }
    if(+(request.headers.get("Content-Length")||0)>65536)return response({error:"Passkey response is too large."},413);
    const credential=await request.json();
    if(!validId(credential.id))return response({error:"Invalid passkey identifier."},400);
    if(path==="/passkeys/register/verify"){
      const expectedChallenge=await claimChallenge(credential,"register");
      const result=await verifyRegistrationResponse({response:credential,expectedChallenge,expectedOrigin:url.origin,expectedRPID:rpID,requireUserVerification:true});
      if(!result.verified||!result.registrationInfo)return response({error:"Could not verify that passkey."},400);
      const {credential:registered,credentialDeviceType,credentialBackedUp}=result.registrationInfo;
      await write("auth/keys/"+registered.id,{version,origin:url.origin,id:registered.id,publicKey:encode(registered.publicKey),counter:registered.counter,transports:registered.transports||[],deviceType:credentialDeviceType,backedUp:credentialBackedUp,createdAt:new Date().toISOString()});
      return response({registered:true});
    }
    if(path==="/passkeys/login/verify"){
      const expectedChallenge=await claimChallenge(credential,"login"),stored=await read("auth/keys/"+credential.id);
      if(!stored||stored.data.version!==version||stored.data.origin!==url.origin)return response({error:"This passkey is not registered for this diary. Use your diary access code."},401);
      const row=stored.data;
      const result=await verifyAuthenticationResponse({response:credential,expectedChallenge,expectedOrigin:url.origin,expectedRPID:rpID,requireUserVerification:true,credential:{id:row.id,publicKey:decode(row.publicKey),counter:row.counter,transports:row.transports}});
      if(!result.verified)return response({error:"Passkey sign-in could not be verified."},401);
      const changed=await write("auth/keys/"+row.id,{...row,counter:result.authenticationInfo.newCounter,lastUsed:new Date().toISOString()},{onlyIf:{etagMatches:stored.object.etag}});
      if(!changed)return response({error:"Another sign-in updated this passkey. Try again."},409);
      return response({signedIn:true},200,{"Set-Cookie":await sessionCookie(env.DIARY_ACCESS_TOKEN)});
    }
    return response({error:"Unknown passkey action."},404);
  } catch(error){return response({error:error.message||"Passkey verification failed. Use your diary access code."},400);}
}
