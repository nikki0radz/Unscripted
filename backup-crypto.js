/* Cloud backup encryption. The recovery password and key never leave this device. */
(() => {
  const encoder = new TextEncoder();
  const magic = encoder.encode("USC1");
  async function derive(password, salt) {
    if (typeof password !== "string" || password.length < 16) throw new Error("Use a recovery password of at least 16 characters, ideally several random words.");
    const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  function header(bytes) {
    if (bytes.length < 48 || !magic.every((v, i) => bytes[i] === v)) throw new Error("This is not an encrypted Unscripted backup.");
    return { salt: bytes.slice(4, 20), iv: bytes.slice(20, 32), ciphertext: bytes.slice(32) };
  }
  async function encrypt(data, key, salt) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: magic }, key, data));
    const result = new Uint8Array(32 + ciphertext.length);
    result.set(magic); result.set(salt, 4); result.set(iv, 20); result.set(ciphertext, 32);
    return result;
  }
  async function decrypt(bytes, password, cachedKey, cachedSalt) {
    const { salt, iv, ciphertext } = header(bytes);
    const key = cachedKey && cachedSalt && salt.every((x,i)=>x===cachedSalt[i]) ? cachedKey : await derive(password, salt);
    try { return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: magic }, key, ciphertext)); }
    catch (_) { throw new Error("The recovery password is incorrect, or the backup was damaged."); }
  }
  globalThis.UnscriptedCrypto = { derive, encrypt, decrypt, header };
})();
