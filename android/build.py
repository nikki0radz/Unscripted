"""Reproducible SDK-only unsigned Android build (no external Java libraries).
python android/build.py --sdk-tools /sdk/build-tools/35.0.0 --android-jar /sdk/platforms/android-35/android.jar --out /tmp/unscripted
Sign the output with a persistent private release key using apksigner.
"""
from pathlib import Path
import argparse,subprocess,zipfile,xml.etree.ElementTree as ET
p=argparse.ArgumentParser();p.add_argument('--sdk-tools',required=True);p.add_argument('--android-jar',required=True);p.add_argument('--out',required=True);a=p.parse_args()
r=Path(__file__).resolve().parents[1];version=ET.parse(r/'android/AndroidManifest.xml').getroot().get('{http://schemas.android.com/apk/res/android}versionName');out=Path(a.out).resolve();tools=Path(a.sdk_tools);api=Path(a.android_jar)
for name in ['classes','dex']:(out/name).mkdir(parents=True,exist_ok=True)
def run(*cmd):subprocess.run([str(v) for v in cmd],check=True)
run('java','com.sun.tools.javac.Main','-source','8','-target','8','-cp',api,'-d',out/'classes',*sorted((r/'android/src/com/nikki/unscripted').glob('*.java')))
run('java','-cp',tools/'lib/d8.jar','com.android.tools.r8.D8','--min-api','26','--lib',api,'--output',out/'dex',*sorted((out/'classes').rglob('*.class')))
run(tools/'aapt','package','-f','-M',r/'android/AndroidManifest.xml','-S',r/'android/res','-I',api,'-F',out/'resources.apk')
with zipfile.ZipFile(out/'app-unsigned.apk','w',zipfile.ZIP_DEFLATED) as dest:
 with zipfile.ZipFile(out/'resources.apk') as source:
  for item in source.infolist():dest.writestr(item,source.read(item.filename))
 dest.write(out/'dex/classes.dex','classes.dex')
 for f in sorted(r.iterdir()):
  if f.is_file() and f.suffix in ['.html','.js','.css','.png','.svg','.webmanifest']:dest.write(f,'assets/'+f.name)
run(tools/'zipalign','-f','4',out/'app-unsigned.apk',out/f'Unscripted-{version}-unsigned.apk')
print(out/f'Unscripted-{version}-unsigned.apk')
