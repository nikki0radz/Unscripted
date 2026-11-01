"""Write the public update feed from the signed release APK; publish both together."""
from pathlib import Path
import argparse,hashlib,json,xml.etree.ElementTree as ET
p=argparse.ArgumentParser();p.add_argument('apk');args=p.parse_args()
root=Path(__file__).resolve().parents[1];manifest=ET.parse(root/'android/AndroidManifest.xml').getroot();ns='{http://schemas.android.com/apk/res/android}'
version=manifest.get(ns+'versionName');apk=Path(args.apk).resolve()
if not apk.is_file() or apk.name!=f'Unscripted-{version}.apk':raise SystemExit('Expected the signed release APK matching the manifest version.')
value={'packageName':manifest.get('package'),'versionCode':int(manifest.get(ns+'versionCode')),'versionName':version,'downloadUrl':f'https://nikki0radz.github.io/Unscripted/downloads/{apk.name}','sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'sizeBytes':apk.stat().st_size,'notes':'Voice-reactive waveforms throughout recording, perspectives and interviews.'}
(root/'app-update.json').write_text(json.dumps(value,indent=2)+'\n')
print(f'Prepared update feed for {version}; publish app-update.json and downloads/{apk.name} together.')
