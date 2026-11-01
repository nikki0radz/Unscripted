package com.nikki.unscripted;

import java.net.URI;

/** Release metadata policy independent of Android so it can be tested on the JVM. */
public final class UpdatePolicy {
 public static final String PACKAGE="com.nikki.unscripted";
 public static final String FEED="https://nikki0radz.github.io/Unscripted/app-update.json";
 public static final long CHECK_INTERVAL_MS=6*60*60*1000L;
 public static void validate(String packageName,long versionCode,String versionName,String downloadUrl,String sha256){
  if(!PACKAGE.equals(packageName))throw new IllegalArgumentException("Update is for a different app.");
  if(versionCode<1||versionCode>2100000000L)throw new IllegalArgumentException("Invalid update version.");
  if(versionName==null||!versionName.matches("[0-9A-Za-z.+_-]{1,40}"))throw new IllegalArgumentException("Invalid update name.");
  if(!allowedDownload(downloadUrl))throw new IllegalArgumentException("Untrusted update download address.");
  if(sha256==null||!sha256.matches("[a-fA-F0-9]{64}"))throw new IllegalArgumentException("Update checksum is missing or invalid.");
 }
 public static boolean allowedDownload(String value){
  try{URI url=new URI(value);return "https".equals(url.getScheme())&&"nikki0radz.github.io".equals(url.getHost())&&url.getPort()==-1&&url.getRawUserInfo()==null&&url.getRawQuery()==null&&url.getRawFragment()==null&&url.getRawPath().matches("/Unscripted/downloads/Unscripted-[0-9A-Za-z.+_-]+\\.apk");}catch(Exception e){return false;}
 }
 public static boolean shouldCheck(boolean automatic,boolean busy,long now,long lastAttempt,boolean force){return !busy&&(force||(automatic&&(lastAttempt==0||now<lastAttempt||now-lastAttempt>=CHECK_INTERVAL_MS)));}
 public static boolean newer(long installed,long available){return available>installed;}
 private UpdatePolicy(){}
}
