# App interface defaults

- Use app-styled asynchronous dialogs for confirmations and destructive-action warnings. Do not call browser alert(), confirm() or prompt() in product flows.
- Match dialogs to the diary's colours, typography, spacing and button styles; support keyboard focus, Escape and cancellation.
- Browser-owned microphone, passkey and navigation warnings cannot be restyled and should use the platform's normal flow.
- Keep library rows compact, with short previews and the full content inside the entry.
- Treat a cloud backup as successful only after the storage service acknowledges it and the encrypted snapshot can be read back.
