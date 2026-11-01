from pathlib import Path
import tempfile,subprocess
root=Path(__file__).resolve().parents[1]
harness='''
package com.nikki.unscripted;
public class UpdatePolicyCheck {
 static void require(boolean b,String s){if(!b)throw new AssertionError(s);}
 static void invalid(Runnable r){try{r.run();throw new AssertionError("Untrusted metadata accepted");}catch(IllegalArgumentException expected){}}
 public static void main(String[] args){
  String good="https://nikki0radz.github.io/Unscripted/downloads/Unscripted-1.0.8.apk",hash=new String(new char[64]).replace('\\0','a');
  UpdatePolicy.validate("com.nikki.unscripted",9,"1.0.8",good,hash);
  for(String u:new String[]{"http://nikki0radz.github.io/Unscripted/downloads/Unscripted-1.0.8.apk","https://evil.example/Unscripted/downloads/Unscripted-1.0.8.apk","https://nikki0radz.github.io.evil.example/Unscripted/downloads/Unscripted-1.0.8.apk","https://user:password@nikki0radz.github.io/Unscripted/downloads/Unscripted-1.0.8.apk",good+"?redirect=evil",good+"#fragment","https://nikki0radz.github.io/Unscripted/downloads/Unscripted-../other.apk","https://nikki0radz.github.io/Unscripted/downloads/Unscripted-%2e%2e.apk","javascript:alert(1)"})require(!UpdatePolicy.allowedDownload(u),"Blocked URL: "+u);
  invalid(()->UpdatePolicy.validate("other.app",9,"1.0.8",good,hash));invalid(()->UpdatePolicy.validate(UpdatePolicy.PACKAGE,0,"1.0.8",good,hash));invalid(()->UpdatePolicy.validate(UpdatePolicy.PACKAGE,9,"bad name",good,hash));invalid(()->UpdatePolicy.validate(UpdatePolicy.PACKAGE,9,"1.0.8",good,"bad"));
  require(UpdatePolicy.newer(8,9),"Newer release");require(!UpdatePolicy.newer(8,8),"No repeat prompt for installed release");require(!UpdatePolicy.newer(8,7),"No downgrade");
  long now=100000000L;require(UpdatePolicy.shouldCheck(true,false,now,0,false),"First launch checks");require(!UpdatePolicy.shouldCheck(true,false,now,now-1000,false),"Check throttled on rapid resume");require(UpdatePolicy.shouldCheck(true,false,now,now-UpdatePolicy.CHECK_INTERVAL_MS,false),"Checks again after six hours");require(!UpdatePolicy.shouldCheck(false,false,now,0,false),"Opt-out respected");require(UpdatePolicy.shouldCheck(false,false,now,now,true),"Manual check bypasses interval and opt-out");require(!UpdatePolicy.shouldCheck(true,true,now,0,true),"No concurrent checks");require(UpdatePolicy.shouldCheck(true,false,100,now,false),"Clock rollback does not suppress checks indefinitely");
  System.out.println("Passed: update metadata and URL policy, version comparisons, launch check, opt-out, throttling, manual override and clock rollback.");
 }
}
'''
with tempfile.TemporaryDirectory(prefix='unscripted-update-policy-') as temp:
 test=Path(temp)/'UpdatePolicyCheck.java';test.write_text(harness)
 subprocess.run(['java','com.sun.tools.javac.Main','-d',temp,str(root/'android/src/com/nikki/unscripted/UpdatePolicy.java'),str(test)],check=True)
 subprocess.run(['java','-cp',temp,'com.nikki.unscripted.UpdatePolicyCheck'],check=True)
