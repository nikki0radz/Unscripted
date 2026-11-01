# Unscripted for Android 1.0.7

Package: `com.nikki.unscripted`. Android 8 (API 26) or newer; target API 35.
The shell bundles the diary frontend and connects to the existing private Unscripted backend. Sign in with the existing diary access code. The current WebView does not guarantee passkey support; access-code login remains available.

## Install and move your diary

1. In the existing browser/PWA diary, use Settings → Export backup. Keep the original diary installed until the transfer is checked.
2. Install the signed `downloads/Unscripted-1.0.7.apk`. Android may ask permission to install apps from the browser/download manager.
3. Open Unscripted, sign in with the existing access code and allow microphone access. Allow notifications to see ongoing recording/processing status.
4. Settings → Import backup; select the exported JSON. Verify entry counts, transcripts and playback of several original recordings. Encrypted cloud restore is also available with the existing recovery password.
5. Record a disposable 30-second entry, lock the phone, speak for another 30 seconds, reopen and save. Check the whole audio and transcription before relying on background capture for a long entry.

Android app storage is separate from Chrome/PWA storage. Import merges entries with matching IDs. Export uses Android's document save picker. Original browser storage is not changed by installing the APK. Do not uninstall this Android app to update it: future APKs must retain the package name and release signing certificate and increase versionCode.

## Background implementation

Main recordings run in a native microphone foreground service with a persistent notification and partial wake lock. The service independently finalises playable AAC/M4A clips every two minutes, including with the screen off; clip rotation does not depend on WebView JavaScript timers. The diary acknowledges a native clip only after its audio and metadata are committed atomically to IndexedDB. Clips pending acknowledgement are recovered in chronological order after reopening. An active main recording reattaches to the recorder controls.

Reflection and interview/quiz voice inputs use a native MediaRecorder adapter, with their existing pause/stop/save behaviour. Native audio continues when the WebView is in the background; the JavaScript two-minute save timer may be delayed there. A native 20 MB cap finalises the current answer if reached. Uncommitted answer clips are recovered as standalone recordings if their editor is lost. No browser microphone stream is kept open alongside native capture. The existing optional diary screen lock covers the UI without pausing native recording.

AI requests run on a native worker thread in a data-sync foreground service. Request/result files live in private app storage. Each clip's result is retained until its transcript is saved, preventing another upload after a page/process restart. Reopening resumes processing that was interrupted. Requests are sent one at a time by the diary's existing resumable pipeline; pause-after-current-clip remains supported. The WebView timers are deliberately never paused by the Activity; native completion signals advance the pipeline while backgrounded. Completed results survive loss of the editor. Internet access and valid sign-in are still required for transcription.

Android can stop work after a force-stop, reboot, microphone interruption or storage exhaustion. No secret background microphone restart is attempted. Completed native clips remain recoverable; the in-progress clip can be lost on abrupt process death. Android 15 limits background data-sync work to six hours per 24 hours. Manufacturer battery restrictions can also interrupt work. If a phone stops recording during the screen-lock test, set its Unscripted battery usage to Unrestricted and retest.

Only the exact dedicated backend origin is allowed inside the WebView. Frontend files are allowlisted from the APK, local audio paths require UUID-safe names, other origins cannot receive the JavaScript bridge, external links open outside the app, file URL access is disabled, and no credentials or signing material are bundled. The APK uses the existing session/access code and backend: there is no OpenAI API key in the app. Native and IndexedDB audio are local and unencrypted, with Android's normal app isolation; the existing encrypted backup mechanism remains separate.

## Build and release

Use an official Android SDK with API 35/build-tools 35 and JDK 17:

```
python3 android/build.py --sdk-tools "$ANDROID_HOME/build-tools/35.0.0" --android-jar "$ANDROID_HOME/platforms/android-35/android.jar" --out /tmp/unscripted
```

The SDK-only build has no downloaded Java dependencies. GitHub Actions produces the unsigned APK. Sign locally with the persistent Unscripted release keystore (alias `unscripted`), never a debug key; keep private key/password files outside the repository. The owner has a separate private signing backup saved with this release. Never commit it or upload it to a public release. Later versions must reuse that key.

Validation for this release: Java compilation/D8, APK alignment, APK v2/v3 signature verification, package/version/permission inspection, Android bridge tests for chronological recovery, failed-save retention and stable transcription results, plus recording, reflection, interview, quiz, backup, authentication and retrieval regression checks. Not validated on a physical Android device or emulator. Live microphone, screen-off capture, Samsung battery behaviour, backend uploads and initial sign-in must be checked on the phone.

## 1.0.1 navigation-bar fix

Dark system-bar styling with light icons; disable Android’s navigation-bar contrast scrim. A native container reserves space for status/navigation bars, display cutouts and the on-screen keyboard, so the WebView viewport and fixed bottom dock remain inside the usable screen. This replaces WebView padding, which did not reposition fixed web content. Signed with the original release key and versionCode 2; install over 1.0.0 to retain diary storage.

## 1.0.2 startup correction

Install Activity content before requesting the system-bar controller: Android 15 PhoneWindow dereferences its decor inside getInsetsController(), so checking the returned value did not prevent the early startup null-pointer crash in 1.0.1. Retains the navigation-bar colour and safe viewport fix. Startup regression harness executes the production layout initialisation against a model with Android’s uninitialised-decor behaviour, checking API 26/29/30/35, absent controllers, navigation bounds and keyboard resizing. This is not a physical-device test.

## 1.0.3 backup audio import

Accept FileReader audio data URLs with MIME parameters such as audio/webm;codecs=opus, including codec lists, rather than rejecting valid browser exports. Preserve the full MIME type and the exact original bytes; use clip MIME metadata when the data URL omits it. Validate all audio before any diary writes and identify malformed clips without silently skipping recordings. Regression check exercises the actual export/import round trip, preserving summaries, transcripts, reflection data and audio bytes, plus invalid/incomplete backup non-mutation.

## 1.0.4 voice-note presentation and background feedback

Rounder voice-note cards and transcription progress, centred labelled vector action icons, request-bound loading spinners, and extra clearance between pause/resume and save. Final recording layout remains a user choice from interactive previews. Ask for notification permission even when microphone access was previously granted, show processing activity in the ongoing notification, and retain WebView renderer priority while hidden so native completion signals can advance multi-clip processing. Replace the stale browser-only screen-awake warning in the APK. Background recording and HTTP requests already run in the native foreground service; this does not guarantee work after force-stop or Android terminating the process.

## 1.0.5 chosen recording controls

Apply Confirm to finish: Pause/Resume remains prominent and separate, and Finish & save reveals an inline confirmation. Keep recording and Save occupy equal-width, equal-height grid cells. Opening or cancelling confirmation does not pause or stop recording; Save ends it. New sessions reset the confirmation. Give all three voice-note actions identical icon/label grid rows so wrapped labels cannot shift the Write a thought icon vertically.

## 1.0.6 collapsible settings

Group the existing controls into Display, AI & summaries, About you, Backup & transfer, Privacy & sign-in, and App & recording. Native details/summary headers start collapsed, support keyboard and screen-reader interaction, and share a name so supporting WebViews keep one category expanded at a time. All existing IDs and controls are preserved. Failed connection validation opens the relevant category before scrolling to its error.

## 1.0.7 handwritten U and update checks

Uses the chosen generated handwritten U art in the app header and a two-layer Android adaptive launcher icon with an explicit roundIcon. Android applies the launcher mask; there is no legacy square tile under the circular icon.

Native update checks run on opening/returning to the app, at most once every six hours, enabled by default with an opt-out under App & recording → App updates. Check now bypasses that interval. Only public metadata is fetched, with no diary/access-code/cookie headers. Version, package, SHA-256 format, size bounds and HTTPS download host/path are checked; the app only offers newer releases. Downloads require an explicit button and themed confirmation, then open the browser so Android can request installation approval. The manifest checksum is provided as release metadata, not described as an in-app download verification: the browser downloads the APK. Android verifies package signatures when upgrading the existing app. No silent install or automatic download occurs.

The update feed is https://nikki0radz.github.io/Unscripted/app-update.json. It must be published alongside the matching signed downloads/Unscripted-VERSION.apk. Run python3 android/write-release.py /absolute/path/Unscripted-VERSION.apk after signing, and publish both files with the release source. Missing/offline feeds display a truthful error in settings rather than claiming the app is current. Source preparation alone does not activate update hosting. Future releases must update versionCode/versionName, use the same keystore, and regenerate the feed after signing.

Tests cover release validation, hostile URLs, version comparisons, check throttling/opt-out/manual checks, download consent, update UI, startup, backup import and recording. Phone launcher masking, notification behaviour and the actual Android upgrade still require on-device verification.
