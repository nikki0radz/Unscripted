# Appearance-only previews

Settings → Display → Preview upcoming changes → Refresh preview opts into the current public
`design-preview.json`. A small header badge and Use installed design both remove the
preview instantly. Refresh is manual; valid previews are cached for offline use.
Fetch failures keep the last valid design; invalid cache starts with the installed one.

The initial feed has no rules: enabling it confirms connectivity without imposing a
new design the user has not requested. For each requested design iteration, edit only
this JSON and publish it to main/GitHub Pages. No APK build or backend deployment is
needed for supported appearance changes. Wait for Pages deployment before asking the
user to refresh. When approved, transfer the rules into the installed stylesheet in
the next normal APK and clear the feed when appropriate.

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
scaling. New controls, DOM ordering or new target/property capabilities require an APK.
Do not describe this as arbitrary screen layout or native-feature live updating.

The Android shell fetches one fixed public HTTPS JSON URL through a dedicated endpoint;
it does not relax the WebView's external-origin rule. No diary cookies, access codes,
recordings or entries are sent. Both sides cap the response at 32 KB, reject redirects,
and time out. JSON is validated atomically before replacing existing styles.

Initial preview-support APK: 1.0.13 (code 14), built with the existing signing key as
a one-time bootstrap while GitHub signing-secret setup remains pending. The stable
update feed remains at 1.0.12. Future APKs use the test/promotion workflow once configured.
