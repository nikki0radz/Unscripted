# Product backlog

## Simple, dependable backups — first implementation in 1.0.17
Requested 1 November 2026. Implemented 2 November in 1.0.17: simple overview,
last-success display, persisted latest failure, advanced recovery controls, discoverable
local export, Android Keystore-encrypted device-only derived key, password-gated restore,
and read-back verification of uploaded audio as well as the manifest. Existing encryption
format and recovery password remain compatible. One-time setup is required after updating.

Remaining: real-device validation, streaming large-library export/restore (the current
250 MB cloud restore cap remains), resumable transfer, confirmed local-file completion,
and native background work. The detailed requirements below remain the acceptance plan.

- Default view: last successful cloud backup with date/time, clear current status,
  automatic backup on/off, and one Back up now action. Keep last success visible
  after a later failure. Show never-backed-up/unknown honestly; don't invent dates.
- Remember backup capability on this trusted Android device after a one-time setup,
  so manual and automatic uploads don't need the recovery password on every launch.
  Design secure Android Keystore-backed protection for the required backup key;
  don't save a plaintext password in web storage or remove encryption.
  Restoring on another device still requires the recovery password. Investigate
  device-lock/key invalidation, migration of existing encrypted backups and recovery
  before choosing the implementation. Explain that forgetting the recovery password
  still prevents recovery on a new device; saving the key locally is not a reset.
- Hide restore, older backups (currently snapshots), recovery and storage controls
  under Advanced backup settings. Retain version history internally.
- Show preparing/uploading/verifying/succeeded/failed states and a short actionable
  reason on failure with retry. Persist separate last-attempt and last-success data.
  Only declare success after storage acknowledgement and read-back verification.
  Verify referenced audio availability/integrity as part of a complete backup.
- Investigate the user's reported failure using a future error message or diagnostics;
  cause is currently unknown. Existing limits include 24 MB per clip and ~8 MB text
  manifest; do not assume these caused this failure.
- Present Save a backup file as a simple secondary option, including recordings,
  transcripts, summaries and profiles, usable independently of cloud availability.
  Local export already exists as JSON with audio; improve discoverability and
  large-library reliability rather than add a duplicate exporter. Current format is
  unencrypted: label that clearly until a protected format is implemented.
- For many hours of audio: investigate streaming/chunked export to avoid a whole
  library JSON/base64 payload in memory, available-space checks, resumable cloud
  transfer and byte-for-byte restore tests. Confirm actual file write success before
  marking a local backup saved. Offer Android Save/Share, including Drive when the
  user has it installed; saving locally must not imply a successful Drive upload.
- Automatic backups currently require the app open and backup key unlocked.
  Show that limitation honestly. True background backup is separate native work;
  a checked toggle must not misleadingly imply backups run after closing the app.

## Preview-first design workflow

- Review designs interactively in chat before packaging more APKs. No APK for each
  visual iteration. Use the existing in-app appearance feed where its supported
  targets suffice; it cannot currently change arbitrary markup, controls or backup
  settings. Clearly distinguish chat mockups, live appearance previews and installed
  functionality. Batch approved changes into a later requested test build.
- Explore a preview gallery accessible on the phone for broader screen designs,
  independent of installed-app updates, without granting preview content access to
  live diary data. Any expansion of the in-app preview engine needs a deliberate,
  bundled app update; don't silently describe it as already supported.

## Approved-design release audit — 1.0.18

See APPROVED-CHANGES.md for the complete delivery checklist. Corrected the missed
promotion of the category-row Everything filter, hidden Search by meaning action,
and fading divider: all are now installed defaults, independent of Preview settings.
Future releases must test approved UI with Preview off and with old cached previews.


### Compact entry layout delivery (2 November 2026)
Approved slim toolbar, summary-heading Clarify, horizontal topics, compact aligned recording/Transcript/info row, 9px seek thumb and smaller red Delete are implemented in source. Packaged in the locally built, original-key-signed 1.0.19 (code 20) APK. Phone acceptance remains pending; the stable update feed is unchanged. Use the established local build/sign method until automated signing is explicitly configured and verified.



### Home text capture — 3 November 2026
Small Write a thought shortcut under the main microphone. Saves a normal text note locally without microphone permission or an AI connection; add audio to the same entry later. Blank/cancelled new notes do not create empty entries. Save failures retain the editor text and duplicate saves are blocked. Included in locally built 1.0.20 (code 21), signed with the original certificate. All 16 workflow checks pass, including text capture failure/cancel/duplicate-save coverage. Phone acceptance pending; stable feed unchanged.
