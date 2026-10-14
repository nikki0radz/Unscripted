# Unscripted 🎙️

A private, voice-first thought diary. A home for your long rambles, afterthoughts, evolving opinions and random ideas.

## What works in this first version

- **Start recording in one tap** (mic permission required); pause, resume, finish.
- **Long voice notes** with independently playable audio clips, auto-saved every 2 minutes. Keep the app open, awake and in the foreground for reliable capture.
- **Add to an existing entry** as often as you like; recordings and written afterthoughts keep their original dates.
- **Browse and search** your entry titles, notes, summaries, tags and saved transcripts, and filter by topic; play an entire entry’s recordings consecutively.
- **Edit** AI titles, summaries and topics, and add written entries.
- **Audio and text stored locally** in IndexedDB, no automatic upload to GitHub.
- **Export and import backups** that include original audio files and text. Backups are unencrypted: store privately.
- **Personalise accent colour** using the Friend Dossier-style hue wheel, brightness slider and recent colours.
- **Optional AI**, with transcription, neutral summary and topic tagging after recordings, plus "Ask my diary" with links to dated source entries. Requires configuring a secure backend separately.

This is a **first version**, not a production-grade backup or data-sync service. Please test with short recordings before entrusting it with important material.

## Start locally

Serve this folder with a static server (mic permissions work on HTTPS or `localhost`):

```bash
python -m http.server 8000
```

Visit `http://localhost:8000`. Allow microphone access. Try recording, pausing, saving and adding an extra recording or written thought. If you don't configure AI, everything else still works, and the original audio is saved.

## Put it on GitHub Pages

1. The code is already published to **[`nikki0radz/Unscripted`](https://github.com/nikki0radz/Unscripted)**. No need to create another repository.
2. All frontend source files and the optional `api/` code are already in the repository. Cloudflare backend code isn't deployed by GitHub Pages.
3. In **Settings → Pages**, choose **Deploy from a branch**, `main`, `/ (root)` (unless you've already enabled it).
4. Open the GitHub Pages URL from a phone. In Chrome, choose **Add to Home screen** to install it as a PWA.

### Important security note about hosting

GitHub Pages project sites under the same `username.github.io` host **share a browser origin**, so another app on that host may access this app's local browser storage if it deliberately tries to. For a personal diary, a **dedicated website origin** (own domain or subdomain) is strongly preferred. Don't store highly sensitive recordings on a shared-origin test site. The frontend HTML/JS can be public, but **your diary entries are stored only on your device**, unless you explicitly enable AI processing or export them.

## Add AI later using Cloudflare Workers

The included `api/worker.js` supports `/transcribe`, `/organize`, and `/ask`, and uses OpenAI models via your private backend. Nothing works over AI until you set this up. Do **not** put an OpenAI API key in `index.html`, a GitHub repository, a browser input, or a URL.

1. Create a Cloudflare account and install Node.js on a computer. In the `api` folder, run `npx wrangler login`.
2. Edit `api/wrangler.toml` so `ALLOWED_ORIGIN` is the **exact origin** hosting the diary, e.g. `https://diary.example.com` (without any path).
3. Run `npx wrangler deploy` inside `api`. Note the new HTTPS `workers.dev` address.
4. Add **two secrets** using `npx wrangler secret put OPENAI_API_KEY` and `npx wrangler secret put DIARY_ACCESS_TOKEN`. The first is your OpenAI API key. The second is a long random access code of your own, different from the OpenAI key (at least 32 random characters). Never commit either one.
5. In the diary's **Settings → Connect AI**, enter the Worker address and your **private access code**. By default the access code stays in `sessionStorage` for the current tab. You can explicitly opt to **Remember access code on this device** to make future automatic transcription seamless; only do so on a trusted device and dedicated diary domain.
6. New completed recordings will be sent to OpenAI for transcription, and the transcriptions to OpenAI for summary/tag generation. To process older entries, open the entry and tap **Transcribe & refresh summary**. You can then ask questions in **Ask diary**.

Cloudflare secret configuration: <https://developers.cloudflare.com/workers/configuration/secrets/>  
OpenAI transcription reference: <https://platform.openai.com/docs/api-reference/audio/createTranscription>

The APIs are charged separately from any ChatGPT subscription. These requests transmit the audio (for transcription) and excerpts of transcripts (for analysis) to the AI provider. AI routes do not store your audio or transcript; enabled R2 backups store only encrypted copies. AI analysis is restricted to the supplied transcripts; if your archive grows very large, some entries/excerpts may not be included in a given question. The app flags partial-history responses.

## Storage limitations

- Recordings are saved in **two-minute independent audio clips** while the page remains active. The current clip can be lost if a call, screen lock, operating-system suspension, or tab closure interrupts the app. Browser recording is **not guaranteed in the background**.
- IndexedDB is device and browser-specific. Clearing site data, using private browsing, changing devices or uninstalling may erase recordings. Export backups frequently, and consider a dedicated encrypted sync system before relying on this for years.
- Large backups can consume substantial memory and storage, and exports currently use JSON including base64-encoded audio (bigger than original files). On very large archives, export regularly and consider a proper archive/export format in a later version.
- A recording is split into clips not for a user-visible time limit, but to save progressively and make each upload small enough for a transcription endpoint. You can make as many recordings per entry as you want, subject to device storage.
- "Ask diary" does not use a full semantic vector index yet. It chooses source entries by text matching plus time coverage, and some material may be omitted. Search inside the library currently uses literal substring matching. Full semantic retrieval would be an appropriate future upgrade.
- Access-code sign-in and encrypted cloud backup are available at the dedicated Worker origin. Email login, live cloud sync, speaker diarisation, reliable locked-screen Android recording and unlimited-size exports are **not included**.

## Private diary and encrypted automatic backups

The Worker now also hosts the diary frontend at its root workers.dev URL. It checks private access-code sign-in before serving the app. App icons and installation metadata are public and contain no diary data. Sign-in uses DIARY_ACCESS_TOKEN to establish a Secure, HttpOnly, SameSite cookie for seven days. Rotating the secret invalidates sessions.

If you already have recordings on GitHub Pages, export them there first, then import at the private Worker address. Different website origins do not share browser storage. Install the diary from the private Worker address; AI then uses the same-origin signed-in session automatically.

### Cloudflare setup

1. Create a PRIVATE R2 bucket named unscripted-backups. Keep public access, r2.dev and public custom domains disabled. The account owner must handle any Cloudflare billing/terms setup.
2. Uncomment the R2 binding block at the bottom of api/wrangler.toml and redeploy. Binding must be DIARY_BACKUPS and bucket name must match. Keep that binding in configuration so later deployments preserve it.
3. In the private diary's Settings, enable automatic cloud backups and enter a separate recovery password of at least 16 characters (ideally several random words). Save it in your password manager.
4. Unlock backups, tap Back up now, and verify a successful timestamp. Test backup and restore with a short disposable recording before relying on it.

Until the bucket is bound, cloud controls show a setup error; recording and AI still work. Unlock backups each time the app reopens. The recovery password and encryption key stay in memory only. Automatic uploads run after changes while the app is open and unlocked; Android can suspend or close it, so this is not guaranteed background backup.

### Encryption and recovery

Audio and diary metadata are encrypted on the device with AES-256-GCM. The 256-bit key is derived by PBKDF2-SHA-256 (600,000 iterations, random 128-bit salt); each object gets a fresh random 96-bit IV. Wrong passwords or tampering fail integrity checks. Recovery passwords are never uploaded to Cloudflare or OpenAI.

All cloud operations require authentication. CORS alone is not access control. Seven recent complete snapshots per device are retained; referenced audio is uploaded before publishing the snapshot. New empty devices never upload an empty diary over old data. This is backup/restore, not live sync or conflict resolution.

Restore validates and decrypts all audio before an atomic IndexedDB update. Matching entry IDs are replaced; other local entries remain. An unencrypted local safety export is downloaded first when the device has entries. Limits: audio clips 24 MB, snapshot metadata under 8 MB, restore up to 250 MB of decrypted audio. Larger archives need a future streaming restore.

Deleting an entry locally does not erase existing cloud snapshots or orphaned encrypted audio. Manage permanent cloud removal in Cloudflare. Losing the recovery password makes cloud backups unrecoverable. Changing the diary access code does not change backup encryption.

### What the link exposes

Someone with only the diary URL cannot retrieve your diary or backups. Someone with the access code or a signed-in browser can access the backend; they also need the separate recovery password to decrypt backups. Cloudflare account administrators can manage encrypted objects and see storage size/timing, but the app does not upload the recovery password.

Local recordings still live unencrypted in the browser's IndexedDB. Sign-out removes the login session and diary caches, not local recordings. It is not protection against somebody controlling your device or its developer tools. Use a trusted locked phone. Cloud backup unlock is intentionally limited to the dedicated Worker origin, because GitHub Pages project apps share an origin.

AI processing is separate from backup encryption: OpenAI receives readable audio/transcript excerpts when you request AI processing. Responses requests use store:false, which is not a claim of zero provider retention. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).

### Another perspective

Each tap asks one concise, specific reflection question grounded in the selected entry, selected diary excerpts and optional editable context. It may challenge assumptions, evidence, needs, another person's constraints or an evidenced recurring pattern. It should not automatically validate the user, defend another person, shame them or explain away abuse. Unknown motives stay conditional.

The feature does not inherit ChatGPT memory, build a hidden clinical profile, diagnose or claim to read the full archive. Prior questions are passed in to reduce repeats; source links point to available diary entries. Questions and editable context are included in backups.

### Checks

Run with Node 24 or equivalent Web Crypto support:

    node tests/security.mjs
    node tests/cloud-client.mjs

These use fake R2/OpenAI responses and verify sign-in/origin restrictions, secret rotation, encryption and tampering, authenticated backup, snapshot retention, empty-device protection, automatic scheduling, restore and one-question validation. Live OpenAI/R2 and phone installation still need the owner's configured account.

## Next improvements

After testing on your own phone: optional email login, encrypted device-to-device sync, stronger search/indexing, background-native Android recorder, audio export to zip, richer source citations including timestamps, and editing auto-transcription mistakes.
