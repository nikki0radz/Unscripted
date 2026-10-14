const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
export async function equalSecret(a, b) {
  const hashes = await Promise.all([a, b].map(s => crypto.subtle.digest("SHA-256", encoder.encode(s || ""))));
  let diff = 0; const x = new Uint8Array(hashes[0]), y = new Uint8Array(hashes[1]);
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
async function signature(payload, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}
export async function sessionCookie(secret) {
  const expires = Math.floor(Date.now() / 1000) + 7 * 86400;
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  const payload = expires + "." + nonce;
  return "__Host-unscripted=" + payload + "." + await signature(payload, secret) + "; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800";
}
export async function hasSession(request, secret) {
  if (!secret) return false;
  const value = (request.headers.get("Cookie") || "").split(";").map(x => x.trim()).find(x => x.startsWith("__Host-unscripted="))?.split("=")[1] || "";
  if (!/^\d+\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(value)) return false;
  const [expires, nonce, sig] = value.split(".");
  if (+expires < Date.now() / 1000 || +expires > Date.now() / 1000 + 7 * 86400 + 60) return false;
  return equalSecret(sig, await signature(expires + "." + nonce, secret));
}
export const logoutCookie = "__Host-unscripted=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
export function loginPage() {
  return new Response(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#151719"><title>Unlock Unscripted</title><style>body{background:#151719;color:#f9f8f3;font:16px system-ui;margin:0;padding:24px}main{max-width:400px;margin:14vh auto}input,button{box-sizing:border-box;width:100%;padding:14px;border-radius:12px;margin:12px 0;font:inherit}input{background:#24282a;color:inherit;border:1px solid #586052}button{background:#b8d2ab;border:0;color:#151719}p{line-height:1.6;color:#bec5bd}#status{color:#f3b5a5}#passkeyLogin{background:#24282a;border:1px solid #586052;color:#f9f8f3}[hidden]{display:none!important}</style></head><body><main><h1>unscripted.</h1><p>Your diary, behind a private door.</p><div id="loginControls" hidden><button id="passkeyLogin" type="button">Use fingerprint / face</button><p>Or use your diary access code</p><form id="unlock"><label for="code">Private access code</label><input id="code" name="password" type="password" autocomplete="current-password" required><button>Unlock diary</button></form></div><p id="status" role="status">Checking your saved sign-in...</p><p>Your browser stays signed in for seven days of inactivity. Set up a passkey in Settings after signing in once. Your backup recovery password stays separate.</p></main><script src="/passkey-client.js" defer></script></body></html>`, {
    headers: { "Content-Type":"text/html; charset=utf-8", "Cache-Control":"no-store", "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'", "X-Content-Type-Options":"nosniff" }
  });
}
export async function backup(request, env, cors) {
  const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (!env.DIARY_BACKUPS) return reply({ error: "Cloud storage is not configured. Bind a private R2 bucket as DIARY_BACKUPS." }, 503);
  const path = new URL(request.url).pathname;
  if (path === "/backup/list") {
    const listing = await env.DIARY_BACKUPS.list({ prefix: "diary/snapshots/", limit: 1000 });
    return reply({ snapshots: listing.objects.map(x => ({ key: x.key.slice(6), createdAt: x.uploaded.toISOString(), size: x.size })), truncated: listing.truncated });
  }
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!/^(clips\/[a-f0-9]{64}|snapshots\/[a-f0-9]{32}\/\d{13}-[a-f0-9]{16})$/.test(key)) return reply({ error: "Invalid backup object." }, 400);
  if (path === "/backup/get") {
    const object = await env.DIARY_BACKUPS.get("diary/" + key);
    if (!object) return reply({ error: "Backup not found." }, 404);
    return new Response(object.body, { headers: { ...cors, "Content-Type": "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
  if (path === "/backup/put") {
    const limit = key.startsWith("clips/") ? 25 * 1024 * 1024 : 8 * 1024 * 1024;
    if (+(request.headers.get("Content-Length") || 0) > limit) return reply({ error: "Backup object is too large." }, 413);
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "An encrypted backup is required." }, 400);
    const chunks = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); return reply({ error: "Backup object is too large." }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    if (size < 48 || String.fromCharCode(...bytes.slice(0, 4)) !== "USC1") return reply({ error: "Only encrypted Unscripted backups are accepted." }, 400);
    await env.DIARY_BACKUPS.put("diary/" + key, bytes, { httpMetadata: { contentType: "application/octet-stream", cacheControl: "no-store" } });
    // Keep seven complete snapshots for each device. Referenced encrypted clips stay available.
    if (key.startsWith("snapshots/")) {
      const prefix = "diary/" + key.split("/").slice(0, 2).join("/") + "/";
      const history = await env.DIARY_BACKUPS.list({ prefix, limit: 1000 });
      const stale = history.objects.sort((a,b) => b.key.localeCompare(a.key)).slice(7);
      if (stale.length) await env.DIARY_BACKUPS.delete(stale.map(x => x.key));
    }
    return reply({ saved: true });
  }
  return reply({ error: "Unknown backup endpoint." }, 404);
}
