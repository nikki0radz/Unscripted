package com.nikki.unscripted;

import android.content.*;
import android.content.pm.*;
import android.os.Build;
import org.json.*;
import java.io.*;
import java.net.*;

/** Checks public version metadata only. No diary or authentication data is sent. */
public final class AppUpdates {
 final Context context;final android.content.SharedPreferences preferences;
 final long installedCode;final String installedName;
 boolean busy=false;String error="";JSONObject release;
 public AppUpdates(Context c){context=c.getApplicationContext();preferences=context.getSharedPreferences("app-updates",Context.MODE_PRIVATE);long code=0;String name="Unknown";try{PackageInfo p=context.getPackageManager().getPackageInfo(context.getPackageName(),0);code=Build.VERSION.SDK_INT>=28?p.getLongVersionCode():p.versionCode;name=p.versionName;}catch(Exception ignored){}installedCode=code;installedName=name;try{String saved=preferences.getString("release","");if(!saved.isEmpty()){JSONObject candidate=new JSONObject(saved);validate(candidate);release=candidate;}}catch(Exception ignored){preferences.edit().remove("release").apply();}}
 static void validate(JSONObject data)throws Exception {long size=data.optLong("sizeBytes",0);if(size<1||size>50*1024*1024L)throw new IOException("Update APK size is invalid.");Object code=data.opt("versionCode");if(!(code instanceof Number)||((Number)code).doubleValue()!=((Number)code).longValue())throw new IOException("Update version is not a whole number.");UpdatePolicy.validate(data.optString("packageName"),((Number)code).longValue(),data.optString("versionName"),data.optString("downloadUrl"),data.optString("sha256"));}
 public synchronized JSONObject status(){JSONObject value=new JSONObject();try{value.put("installedVersion",installedName).put("installedCode",installedCode).put("automatic",preferences.getBoolean("automatic",true)).put("checking",busy).put("lastChecked",preferences.getLong("lastChecked",0)).put("error",error).put("available",release!=null&&UpdatePolicy.newer(installedCode,release.getLong("versionCode")));if(release!=null)value.put("release",release);}catch(Exception ignored){}return value;}
 public void automatic(boolean enabled){preferences.edit().putBoolean("automatic",enabled).apply();if(enabled)check(false);}
 public void check(boolean force){synchronized(this){long now=System.currentTimeMillis();if(!UpdatePolicy.shouldCheck(preferences.getBoolean("automatic",true),busy,now,preferences.getLong("lastAttempt",0),force))return;busy=true;error="";preferences.edit().putLong("lastAttempt",now).apply();}MainActivity.signal();
  new Thread(()->{try{JSONObject candidate=fetch();validate(candidate);synchronized(this){release=candidate;}preferences.edit().putString("release",candidate.toString()).putLong("lastChecked",System.currentTimeMillis()).apply();}
   catch(Exception e){synchronized(this){error=e.getMessage()==null?"Could not check for updates. Try again when connected.":e.getMessage();}}
   finally{synchronized(this){busy=false;}MainActivity.signal();}},"Unscripted-update-check").start();
 }
 JSONObject fetch()throws Exception{
  HttpURLConnection connection=(HttpURLConnection)new URL(UpdatePolicy.FEED).openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(12000);connection.setReadTimeout(12000);connection.setUseCaches(false);connection.setRequestProperty("Cache-Control","no-cache");connection.setRequestProperty("Accept","application/json");
  try{int code=connection.getResponseCode();if(code==404)throw new IOException("The update feed has not been published yet. You can still install app updates from the download link.");if(code!=200)throw new IOException("Update service unavailable ("+code+"). Please try again later.");ByteArrayOutputStream data=new ByteArrayOutputStream();try(InputStream in=connection.getInputStream()){byte[] chunk=new byte[2048];int length;while((length=in.read(chunk))!=-1){if(data.size()+length>16384)throw new IOException("Update metadata is too large.");data.write(chunk,0,length);}}return new JSONObject(data.toString("UTF-8"));}finally{connection.disconnect();}
 }
 public synchronized String downloadUrl(){try{if(release!=null&&UpdatePolicy.newer(installedCode,release.getLong("versionCode"))&&UpdatePolicy.allowedDownload(release.getString("downloadUrl")))return release.getString("downloadUrl");}catch(Exception ignored){}return "";}
}
