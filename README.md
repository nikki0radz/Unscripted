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

The home screen now includes Interview me: choose a mixed interview, confidence, relationships, big questions/moral dilemmas, revisiting history or your own goal. AI asks six adaptive questions, one at a time, using selected dated diary excerpts and saved self-description. Questions can be skipped; you can resume or finish early. An interview with at least one answer saves progressively as an entry marked Interview. Typed or transcribed answer text is saved; temporary voice-answer audio is not retained. History references link to actual supplied source entries. A complete interview receives the usual personalised summary. An all-skipped interview creates no empty diary entry.

Interview drafts are included in backup profile metadata, and saved interviews use the normal entry/audio backup system. The AI is explicitly told that hypothetical dilemmas and skipped prompts are not evidence of real events or beliefs. Interviews are reflective prompts, not assessments or guaranteed confidence treatment.

Settings now includes two AI-led six-question interviews: Get to know me and Reflection context. Each question adapts to previous answers; answers can be typed, recorded then transcribed, skipped or edited later. Voice answer audio is used for transcription and discarded; the editable text answer is what is saved. Quiz answers and generated context are included in local exports and encrypted cloud snapshots. An unfinished typed draft survives closing the quiz.

Get to know me guides the tone of future summaries. Summaries address you directly as "you", with conversational warmth, while remaining faithful to the entry; profile background is not evidence that events happened in a recording. Existing automatic summaries can be refreshed from an entry's Transcribe & refresh summary button. Manually edited summaries remain protected.

The recorder includes a top-right cancel button and a confirmation dialog. Discarding removes only the current recording part and its autosaved audio clips; other parts stay. A new entry with no remaining parts is removed. Cancellation waits for in-flight saving before final cleanup, and microphone tracks are stopped.

Each tap asks one concise, specific reflection question grounded in the selected entry, selected diary excerpts and optional editable context. It may challenge assumptions, evidence, needs, another person's constraints or an evidenced recurring pattern. It should not automatically validate the user, defend another person, shame them or explain away abuse. Unknown motives stay conditional.

The feature does not inherit ChatGPT memory, build a hidden clinical profile, diagnose or claim to read the full archive. Prior questions are passed in to reduce repeats; source links point to available diary entries. Questions and editable context are included in backups.

### Checks

Passkey sign-in is available under Settings → Private sign-in. Sign in once with your diary access code, then choose Set up fingerprint / face sign-in. This registers a platform passkey with device verification required; the device may use biometrics or its PIN. Public keys and short-lived challenges live under the private R2 bucket's auth/ prefix. Registration requires an existing sign-in. Challenges are consumed with conditional R2 writes, and origin, RP ID, signature and verification flags are checked by SimpleWebAuthn. Changing the diary access secret invalidates registered passkeys; keep the access code as a fallback.

Sessions use Secure, HttpOnly, SameSite=Lax cookies, with same-origin checks on state-changing requests. This supports launches from the home screen. An initial saved-session check avoids requesting the access code when a valid cookie already exists. Sessions refresh when the diary opens and expire after seven days of inactivity. Biometrics sign in to the diary; they do not replace the separate backup recovery password.

Backup uploads now require a JSON acknowledgement and byte-for-byte read-back of the encrypted snapshot before reporting Backup verified. Cloudflare R2 objects appear under diary/clips and diary/snapshots; passkey records are under auth. Old successful status messages are not proof of a new backup.

All application confirmations use themed asynchronous dialogs. Browser-owned microphone/passkey/navigation warnings remain platform controlled. Library rows show a compact single-line summary preview; open an entry for the full summary and topics.

The passkey server/browser bundles are pinned to SimpleWebAuthn server 14.0.3 and browser 13.2.2. Dependency manifests, lockfile, entry sources and third-party notices are included under vendor/. The bundles are already checked in, so deployment needs no dependency install/build. Regenerate with the pinned esbuild dependency if updating them; preserve third-party notices. Static assets exclude api/ and vendor/.

Run with Node 24 or equivalent Web Crypto support:

    node tests/security.mjs
    node tests/cloud-client.mjs
    node tests/profile-quiz.mjs
    node tests/quiz-client.cjs
    node tests/recording.cjs
    node tests/dialogs.cjs
    node tests/passkeys.mjs
    node tests/interview.mjs

These use fake R2/OpenAI responses and verify sign-in/origin restrictions, secret rotation, encryption and tampering, authenticated backup, snapshot retention, empty-device protection, automatic scheduling, restore and one-question validation. Live OpenAI/R2 and phone installation still need the owner's configured account.

## Next improvements

After testing on your own phone: optional email login, encrypted device-to-device sync, stronger search/indexing, background-native Android recorder, audio export to zip, richer source citations including timestamps, and editing auto-transcription mistakes.

Recordings use one full-length seekable player per session; two-minute autosave clips remain internal. Existing recordings use the same player without converting or replacing their original audio.
Validation: `node tests/recording-player.cjs` covers cross-clip seeking and playback continuation.

Always lock on opening (Private sign-in) is a per-device screen lock, enabled only after a verified passkey check. It covers and makes the diary inert before initial rendering, locks on backgrounding and page restoration, and pauses the main recorder and playback. Unlock needs fresh server-verified passkey authentication or the diary access code, with an internet connection. A signed-in session alone does not dismiss the cover. This does not encrypt the local IndexedDB or protect against someone accessing browser storage/developer tools; use your phone's device lock too.

Another perspective opens a question-and-answer dialog with typed or recorded answers, pause/resume, a live microphone meter and editable transcription. Save atomically stores a marked reflection note and its original audio in the current entry; cancelling or replacing the question discards the draft. Reflections appear separately at the bottom but participate in local search, dated Ask diary sources, transcript export and encrypted backups. Existing unanswered reflection questions remain visible. Voice answers pause when the app is backgrounded, and each recording is capped at ten active minutes or 24 MB.

Reflection checks: `node tests/perspective-client.cjs` and `node tests/recording.cjs`.
