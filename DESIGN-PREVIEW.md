# Appearance-only previews

Settings → Display → Preview upcoming changes → Refresh preview opts into the current public
`design-preview.json`. A small header badge and Use installed design both remove the
preview instantly. Refresh is manual; valid previews are cached for offline use.
Fetch failures keep the last valid design; invalid cache starts with the installed one.

As of 1.0.18 the approved category-row library layout is the installed default:
Everything sits beside topic chips, Search by meaning is hidden, and the fading
divider is visible below the row. This is static markup and installed CSS, so it
works offline and with Preview disabled. Cached `libraryLayout: "categories"`
feeds remain valid for compatibility but no longer move the controls. Turning
Preview off only removes optional appearance rules, never approved installed UI.
For future supported design iterations, edit the JSON and publish it to Pages;
no APK is needed for supported properties. Promote approved work into installed
markup/styles in the next requested build, and verify with Preview disabled.

Example:

```json
{"schema":1,"revision":"cards-2","label":"Softer library cards","rules":[
  {"target":"libraryCards","styles":{"padding":16,"border-radius":20}},
  {"target":"headings","styles":{"font-family":"serif","font-size":24}}
]}
```

`design-preview.js` defines the supported named targets, properties and numeric bounds.
There are no remote selectors, scripts, markup, image/font URLs, positions, visibility
changes or storage operations. Settings/recovery controls are outside the rule scope.
Fonts use the existing app font stack; text size continues to respect accessibility
scaling. New controls or new target/property capabilities require an APK. DOM ordering is
limited to the built-in `categories` layout preset; arbitrary remote markup is rejected.
Do not describe this as arbitrary screen layout or native-feature live updating.

The Android shell fetches one fixed public HTTPS JSON URL through a dedicated endpoint;
it does not relax the WebView's external-origin rule. No diary cookies, access codes,
recordings or entries are sent. Both sides cap the response at 32 KB, reject redirects,
and time out. JSON is validated atomically before replacing existing styles.

Preview layout-support APK: 1.0.14 (code 15), built with the existing signing key as
a one-time bootstrap while GitHub signing-secret setup remains pending. The stable
update feed remains at 1.0.12. Future APKs use the test/promotion workflow once configured.

The 1.0.15 test APK adds a local soft bottom sheet for the library type filter.
Multiple checked types are combined, the selection is remembered on this device,
and Everything clears the specific choices. Done, backdrop, Escape and Android
Back close the sheet. This functionality requires the APK; it is not downloaded
through the appearance feed. The category-row layout remains opt-in via preview.
