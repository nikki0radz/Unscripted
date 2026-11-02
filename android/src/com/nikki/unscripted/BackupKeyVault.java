package com.nikki.unscripted;
import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.util.AtomicFile;
import java.io.*;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

/** Device-only encryption of backup key material; never stores the recovery password. */
final class BackupKeyVault {
 private static final String ALIAS="unscripted-backup-device-v1";
 private static AtomicFile file(Context c){return new AtomicFile(new File(c.getNoBackupFilesDir(),"backup-key-v1"));}
 private static javax.crypto.SecretKey key() throws Exception {
  KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
  if(!store.containsAlias(ALIAS)){
   KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
   gen.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());gen.generateKey();
  }
  return (javax.crypto.SecretKey)store.getKey(ALIAS,null);
 }
 static synchronized String save(Context c,String scope,String value){
  FileOutputStream out=null;AtomicFile f=file(c);
  try{
   if(scope.length()>2000||value.length()>1024)throw new Exception();
   Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());cipher.updateAAD(scope.getBytes("UTF-8"));
   byte[] encrypted=cipher.doFinal(value.getBytes("UTF-8"));out=f.startWrite();out.write(cipher.getIV());out.write(encrypted);f.finishWrite(out);return "";
  }catch(Exception e){if(out!=null)f.failWrite(out);return "Could not remember backup access on this phone. Backups remain available for this session.";}
 }
 static synchronized String load(Context c,String scope){
  if(!file(c).getBaseFile().exists())return "";
  try{
   byte[] data=file(c).readFully();if(data.length<28||data.length>2048)throw new Exception();
   Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,data,0,12));cipher.updateAAD(scope.getBytes("UTF-8"));
   return new String(cipher.doFinal(data,12,data.length-12),"UTF-8");
  }catch(Exception e){return "!";}
 }
 static synchronized void clear(Context c){file(c).delete();}
}
