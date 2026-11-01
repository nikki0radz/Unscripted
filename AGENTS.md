# App interface defaults

- Use app-styled asynchronous dialogs for confirmations and destructive-action warnings. Do not call browser alert(), confirm() or prompt() in product flows.
- Match dialogs to the diary's colours, typography, spacing and button styles; support keyboard focus, Escape and cancellation.
- Browser-owned microphone, passkey and navigation warnings cannot be restyled and should use the platform's normal flow.
- Keep library rows compact, with short previews and the full content inside the entry.
- Treat a cloud backup as successful only after the storage service acknowledges it and the encrypted snapshot can be read back.

# Android iteration

- See `android/RELEASE-WORKFLOW.md`: offer visual previews for layout feedback and signed test APKs for Android behaviour. Small test builds are valid; do not require the user to batch all feedback.
- Use the test/publish workflow after its one-time secrets setup. Do not rebuild locally, manually bump versions or publish stable updates for every edit. Promote the exact candidate the user tested when they request publishing.
- Keep reads and test output focused. Never read APKs or signing material into chat. Record changes in commits and use the workflow summary for candidate download links.
