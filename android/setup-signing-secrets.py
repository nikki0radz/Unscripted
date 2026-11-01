"""Run once on a trusted computer with GitHub CLI authenticated. Never prints secrets."""
import argparse
import base64
import getpass
from pathlib import Path
import subprocess

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('keystore', type=Path)
p.add_argument('--password-file', type=Path)
a = p.parse_args()
key = a.keystore.read_bytes()
password = (a.password_file.read_text().rstrip('\r\n') if a.password_file
            else getpass.getpass('Existing Unscripted signing password: '))
if not key or not password:
    raise SystemExit('Existing keystore and password are required; do not generate a new key.')
for name, value in [('ANDROID_KEYSTORE_BASE64', base64.b64encode(key).decode()),
                    ('ANDROID_KEYSTORE_PASSWORD', password)]:
    subprocess.run(['gh', 'secret', 'set', name, '--repo', 'nikki0radz/Unscripted'],
                   input=value, text=True, check=True)
print('Both signing secrets uploaded. Run the test action to verify the existing signing identity.')
