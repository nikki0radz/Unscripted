package com.nikki.unscripted;

import android.webkit.WebResourceResponse;
import java.io.*;
import java.net.*;
import java.util.*;

/** Fixed public appearance feed; never forwards diary cookies, codes or user URLs. */
final class DesignPreview {
 static final String FEED="https://nikki0radz.github.io/Unscripted/design-preview.json";
 static WebResourceResponse response(){
  HttpURLConnection connection=null;
  try{
   connection=(HttpURLConnection)new URL(FEED).openConnection();
   connection.setConnectTimeout(5000);connection.setReadTimeout(5000);
   connection.setInstanceFollowRedirects(false);connection.setUseCaches(false);
   connection.setRequestProperty("Accept","application/json");
   connection.setRequestProperty("Cache-Control","no-cache");
   if(connection.getResponseCode()!=200)throw new IOException("Preview unavailable");
   if(connection.getContentLengthLong()>32768)throw new IOException("Preview too large");
   ByteArrayOutputStream bytes=new ByteArrayOutputStream();
   try(InputStream input=connection.getInputStream()){
    byte[] buffer=new byte[4096];int count;
    while((count=input.read(buffer))!=-1){if(bytes.size()+count>32768)throw new IOException("Preview too large");bytes.write(buffer,0,count);}
   }
   return result(200,"OK",bytes.toByteArray());
  }catch(Exception e){return result(503,"Preview unavailable","{}".getBytes(java.nio.charset.StandardCharsets.UTF_8));}
  finally{if(connection!=null)connection.disconnect();}
 }
 static WebResourceResponse result(int code,String reason,byte[] bytes){
  Map<String,String> headers=new HashMap<>();headers.put("Cache-Control","no-store");
  return new WebResourceResponse("application/json","UTF-8",code,reason,headers,new ByteArrayInputStream(bytes));
 }
}
