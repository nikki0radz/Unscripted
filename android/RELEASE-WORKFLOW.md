# Test on your phone, then publish the tested APK

Visual changes can first be reviewed in a browser preview. Notifications, lock-screen
playback, microphone behaviour and Android permissions need an installed test APK.
Small test builds are encouraged: batching is optional, not a requirement to gather
all feedback before trying the app.

## One-time setup

Use the **existing** Unscripted signing backup, not a newly generated key. The build
checks its certificate against the original app before offering any APK.

On a trusted computer with Python and [GitHub CLI](https://cli.github.com/) installed:

1. Run `gh auth login` and sign in as the repository owner.
2. Download this repository and extract your existing private Android signing backup
   outside the repository.
3. From the repository folder run:

   ```sh
   python3 android/setup-signing-secrets.py /path/to/unscripted-release.jks
   ```

   Enter the existing signing password when prompted. If the backup includes a
   password file, append `--password-file /path/to/password.txt` instead.
   The script sends the two values directly to GitHub's encrypted Actions secrets;
   it does not print them. Never paste them into a chat, issue or repository file.

Secrets created: `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD`.
The alias is already set to `unscripted`; the original key and store share a password.
The secrets can be viewed by name (not value) under Settings → Secrets and variables
→ Actions. Repository policies must allow the workflow to write releases and push
the update-feed commit. Pages must retain its existing main-branch/root deployment.

## Get a test APK

Open [the release action](https://github.com/nikki0radz/Unscripted/actions/workflows/release.yml)
→ Run workflow → branch **main**, action **test**. Add a short description of what
to try. Leave candidate blank.

Checks pass first; GitHub then builds and signs once. The workflow summary and
GitHub Releases contain a direct APK link, which can be shared in chat.
These are **public pre-releases**, not private testing links. They do not alter
the stable feed or prompt normal app users to update.

Install over the existing app, without uninstalling. The same package/signature
retains app storage, but keep a current backup before using experimental code.
Test with a disposable entry first. Android ordinarily blocks downgrades: if a
candidate is faulty, issue a corrected higher-numbered build, even when reverting code.

## Publish the one you liked

Run the same workflow with action **publish** and the exact tested tag, for example
`v1.0.19`. No code compilation or signing happens again. The workflow downloads the
candidate, verifies its original signature, package, version, size and checksum,
then commits those exact bytes and their update feed to main. It explicitly requests
a Pages build and verifies the live feed and APK before marking the release stable.
You already have that APK installed, so you do not need to reinstall it.

If main changes during promotion, the ordinary Git push fails safely: rerun publish
against current main. If Pages deployment fails after the feed commit, rerun publish
for the same candidate; it resumes without a new build or duplicate commit. A newer
stable version cannot be replaced by an older candidate. Do not edit release assets.

Version codes are allocated from this workflow's monotonically increasing run number
plus the existing baseline of 13. The display version is `1.0.<code minus 1>`.
Skipped numbers are normal. Do not reset the offset or manually bump manifests for
automated builds. Version changes happen in the build checkout, not the source tree;
the candidate feed records the installed version. Existing releases remain available.

## Validation and limits

Pushes and PRs run lightweight checks; only an explicit test request compiles an APK.
Test builds rerun checks on their exact source revision before signing. Promotion
does not rerun application tests against a different revision: it checks the signed,
already-tested candidate. Automated checks cannot validate Samsung notification UI,
real microphone response or your assessment of the layout.

Signing credentials are only exposed to the trusted main-branch test build's signing
step and its presence check, never pull-request jobs. Keystore files are temporary and
removed after signing. Signed APKs contain no signing passwords or private keys.

The pipeline still needs its first live test after secrets are configured. Until then,
local validation proves the scripts/checks, not GitHub permissions or Pages deployment.

Backend deployment is separate. If a change affects `api/`, review compatibility with
the installed stable app before deploying it; an APK candidate does not isolate a
shared backend. No backend deployment is added by this workflow.
