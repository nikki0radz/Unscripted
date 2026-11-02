# Approved changes audit — 1.0.18

Reviewed against this design/release conversation on 2 November 2026.

| Approved request | Installed implementation | Status |
| --- | --- | --- |
| Compact Everything dropdown among category chips | Static `libraryFiltersRow` markup and `.library-categories` styles | Fixed in 1.0.18: was incorrectly opt-in through 1.0.17 |
| Remove visible Search by meaning control | Hidden in installed markup and category CSS; search still works | Fixed default in 1.0.18 |
| Faint fading separator below categories | Installed visible divider | Fixed default in 1.0.18 |
| Leave library summary cards unchanged | No library card rendering changes in this correction | Preserved |
| Soft bottom sheet for Everything | `library-type-menu.js`, themed sheet | Included |
| Multiple entry types, Everything reset, remembered selection | Type union in `app.js`, persisted menu selection | Included and covered by tests |
| Compact pair summary-correction footer | Small prompt/input, Cancel left, Update summary right | Included |
| Hide First recording / Recording N on voice notes | No visible headings for audio; IDs and accessible labels preserved | Included |
| Smaller centred soft circles instead of disclosure triangles | 18px circles, centred 12px SVG, flex alignment | Included for disclosures and custom pickers |
| Compact Summary style + Delete entry, indicator beside label | Content-width summary control and shared footer sizing | Included |
| Simple backup home with last success and Back up now | Installed backup overview and persisted last-success field | Included |
| Password not needed each time to back up | Derived key encrypted by Android Keystore in no-backup storage | Included; existing password required once for setup |
| Restore and older backups under Advanced | Installed advanced section; restore needs recovery password | Included |
| Local backup file option | Existing full JSON exporter exposed prominently | Included; current file is unencrypted |
| Clear failed-backup feedback without losing last success | Persistent last error, checked upload/read-back before success | Included |
| Review designs before building APKs | Interactive chat mockups, limited optional appearance feed | Workflow recorded; correction build explicitly requested |

## Why the library layout was missing

The approved library arrangement was kept in a preview preset rather than promoted
into the normal app. `design-preview.js` moved the filter above search and hid the
divider whenever Preview was off. 1.0.18 removes that reversion path and installs
the approved markup and styles directly. Tests cover preview off/on, old cached
category previews, corrupt cache, and returning to installed design.

The 1.0.17 APK was compared byte-for-byte to the source modules for the sheet,
selection, entry corrections, soft-circle disclosures and backup implementation:
those modules were packaged. The omission was the default library layout.

## Still pending — not represented as delivered

- GitHub automated signing/release needs one-time secret setup. Current APKs are
  signed with the original key and provided directly; no stable-feed promotion
  was performed for this correction.
- Broader in-app live-layout previews beyond the current appearance-rule engine.
- True native background backups after the app closes.
- Streaming/resumable large-library export and restore, and confirmation of local
  export completion. Existing cloud limits remain 24 MB per clip, approximately
  8 MB for text metadata and 250 MB for restore audio in this version.
- Diagnose the previously reported cloud failure from an actual error or log.
- Real-device visual checks and hardware-backed key-storage lifecycle testing.

These future items are tracked in BACKLOG.md. The approved backup screen does not
imply these larger storage changes have been implemented.
