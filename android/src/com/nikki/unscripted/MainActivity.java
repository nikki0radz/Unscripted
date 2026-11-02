package com.nikki.unscripted;

import android.app.*;
import android.os.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.webkit.*;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;

public class MainActivity extends Activity {
 static final String ORIGIN="https://unscripted-private-ai.nikki0radz.workers.dev";
 static MainActivity active;
 WebView web; ValueCallback<Uri[]> chooser; PermissionRequest micRequest;
 String exportData;
 AppUpdates updates;
 final Handler main=new Handler(Looper.getMainLooper());
 @Override public void onCreate(Bundle b){super.onCreate(b);active=this;
  // The container owns the system-bar space. Padding the WebView itself does
  // not move CSS fixed-position navigation out of the system navigation bar.
  final int background=0xff151719;
  android.view.Window window=getWindow();
  window.setStatusBarColor(android.graphics.Color.TRANSPARENT);
  window.setNavigationBarColor(android.graphics.Color.TRANSPARENT);
  if(Build.VERSION.SDK_INT>=28)window.setNavigationBarDividerColor(android.graphics.Color.TRANSPARENT);
  if(Build.VERSION.SDK_INT>=29){window.setNavigationBarContrastEnforced(false);window.setStatusBarContrastEnforced(false);}
  if(Build.VERSION.SDK_INT>=30){
   window.setDecorFitsSystemWindows(false);
  }else window.getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE|android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
  android.widget.FrameLayout container=new android.widget.FrameLayout(this);
  container.setBackgroundColor(background);
  web=new WebView(this);web.setBackgroundColor(background);
  container.addView(web,new android.widget.FrameLayout.LayoutParams(-1,-1));
  container.setOnApplyWindowInsetsListener((v,insets)->{
   if(Build.VERSION.SDK_INT>=30){
    android.graphics.Insets bars=insets.getInsets(android.view.WindowInsets.Type.systemBars()|android.view.WindowInsets.Type.displayCutout());
    android.graphics.Insets keyboard=insets.getInsets(android.view.WindowInsets.Type.ime());
    v.setPadding(bars.left,bars.top,bars.right,Math.max(bars.bottom,keyboard.bottom));
    return android.view.WindowInsets.CONSUMED;
   }
   v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
   return insets.consumeSystemWindowInsets();
  });
  setContentView(container);
  // PhoneWindow.getInsetsController() dereferences its decor internally. The
  // decor exists only after content installation; a null check on the returned
  // controller cannot protect a call made before setContentView().
  if(Build.VERSION.SDK_INT>=30){
   android.view.WindowInsetsController controller=window.getInsetsController();
   if(controller!=null)controller.setSystemBarsAppearance(0,android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
  }
  container.requestApplyInsets();
  web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT,false);
  WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(true);s.setMediaPlaybackRequiresUserGesture(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  CookieManager.getInstance().setAcceptCookie(true);
  web.addJavascriptInterface(new Bridge(),"UnscriptedAndroid");
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView w,WebResourceRequest r){if(ORIGIN.equals(origin(r.getUrl())))return false; if(r.isForMainFrame()&&Arrays.asList("https","http").contains(r.getUrl().getScheme()))try{startActivity(new Intent(Intent.ACTION_VIEW,r.getUrl()));}catch(Exception ignored){}return true;}
   @Override public WebResourceResponse shouldInterceptRequest(WebView w,WebResourceRequest r){
    Uri uri=r.getUrl();if(!ORIGIN.equals(origin(uri)))return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
    String path=uri.getPath();
    if("/__native/design-preview".equals(path))return DesignPreview.response();
    try{
     if(path.startsWith("/__native/audio/")){String id=path.substring(16);if(!id.matches("[a-zA-Z0-9_-]+"))throw new IOException();return new WebResourceResponse("audio/mp4",null,new FileInputStream(new File(BackgroundService.dir(MainActivity.this),id+".m4a")));}
     if(path.equals("/")||path.equals("/index.html")){String cookie=CookieManager.getInstance().getCookie(ORIGIN);if(cookie==null||!cookie.contains("__Host-unscripted="))return null;path="/index.html";}
     String name=path.substring(1);
     if(name.matches("[a-zA-Z0-9_-]+\\.(js|css|html|png|svg|webmanifest)")){
      if(name.equals("service-worker.js"))return new WebResourceResponse("application/javascript","UTF-8",new ByteArrayInputStream("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.registration.unregister()));".getBytes("UTF-8")));
      String mime=name.endsWith(".js")?"application/javascript":name.endsWith(".css")?"text/css":name.endsWith(".html")?"text/html":name.endsWith(".png")?"image/png":"image/svg+xml";
      InputStream data=getAssets().open(name);
      if(name.equals("index.html")){String html=new String(BackgroundService.readAll(data),"UTF-8").replace("<head>","<head><meta name=\"unscripted-private-host\" content=\"true\"><script src=\"native-android.js\" defer></script>"); data=new ByteArrayInputStream(html.getBytes("UTF-8"));}
      Map<String,String> headers=new HashMap<>();headers.put("Cache-Control","no-store");headers.put("Content-Security-Policy","frame-src 'none'; object-src 'none'; base-uri 'self'");
      return new WebResourceResponse(mime,"UTF-8",200,"OK",headers,data);
     }
    }catch(IOException ignored){}return null;
   }
   @Override public void onPageFinished(WebView w,String url){CookieManager.getInstance().flush();}
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> callback,FileChooserParams params){if(chooser!=null)chooser.onReceiveValue(null);chooser=callback;Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.setType("application/json");i.addCategory(Intent.CATEGORY_OPENABLE);try{startActivityForResult(i,10);return true;}catch(Exception e){chooser=null;return false;}}
   @Override public void onPermissionRequest(PermissionRequest p){runOnUiThread(()->{if(!ORIGIN.equals(p.getOrigin().toString().replaceAll("/$",""))){p.deny();return;}if(checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)p.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});else{micRequest=p;requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO},12);}});}
  });
  updates=new AppUpdates(this);
  web.loadUrl(ORIGIN+"/");
 }
 static String origin(Uri u){return u.getScheme()+"://"+u.getAuthority();}
 static void signal(){MainActivity a=active;if(a!=null)a.main.post(()->a.web.evaluateJavascript("window.dispatchEvent(new Event('unscripted-native'));",null));}
 @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);signal();}
 @Override public void onRequestPermissionsResult(int req,String[] names,int[] grants){super.onRequestPermissionsResult(req,names,grants);if(req==12&&micRequest!=null){if(grants.length>0&&grants[0]==PackageManager.PERMISSION_GRANTED)micRequest.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});else micRequest.deny();micRequest=null;}signal();}
 @Override protected void onActivityResult(int req,int result,Intent data){super.onActivityResult(req,result,data);if(req==10&&chooser!=null){chooser.onReceiveValue(result==RESULT_OK&&data!=null?new Uri[]{data.getData()}:null);chooser=null;}if(req==11&&result==RESULT_OK&&data!=null&&exportData!=null){final String value=exportData;final Uri uri=data.getData();new Thread(()->{try(OutputStream out=getContentResolver().openOutputStream(uri)){out.write(value.getBytes("UTF-8"));}catch(Exception e){main.post(()->android.widget.Toast.makeText(this,"Could not save backup",1).show());}}).start();}exportData=null;}
 @Override protected void onResume(){super.onResume();active=this;if(web!=null)signal();if(updates!=null)updates.check(false);}
 @Override protected void onDestroy(){if(active==this)active=null;super.onDestroy();}
 @Override public void onBackPressed(){web.evaluateJavascript("window.UnscriptedDiary?.recording()?window.UnscriptedDiary.toast('Save or pause your recording before leaving.'):history.back()",null);}
 class Bridge {
  @JavascriptInterface public String saveBackupKey(String scope,String value){return BackupKeyVault.save(MainActivity.this,scope,value);}
 @JavascriptInterface public String loadBackupKey(String scope){return BackupKeyVault.load(MainActivity.this,scope);}
 @JavascriptInterface public void forgetBackupKey(){BackupKeyVault.clear(MainActivity.this);}
 @JavascriptInterface public boolean available(){return true;}
  @JavascriptInterface public double microphoneLevel(){return BackgroundService.microphoneLevel;}
  @JavascriptInterface public String playbackStatus(){return PlaybackService.snapshot;}
  @JavascriptInterface public String playbackWrite(String token,int index,String data,boolean append){
   if(!PlaybackService.safe(token)||index<0||index>9999||data.length()>400000)return "Invalid audio";
   try(FileOutputStream out=new FileOutputStream(PlaybackService.file(MainActivity.this,token,index),append)){out.write(android.util.Base64.decode(data,android.util.Base64.DEFAULT));return "";}catch(Exception e){return "Could not prepare audio. Check device storage.";}
  }
  @JavascriptInterface public void playback(String action,String data){main.post(()->{try{
   if(!Arrays.asList("load","play","pause","stop","seek","back").contains(action))return;
   if(!action.equals("load")&&PlaybackService.instance==null)return;
   Intent i=new Intent(MainActivity.this,PlaybackService.class).setAction(action).putExtra("data",data);
   if(action.equals("seek"))i.putExtra("position",new JSONObject(data).optLong("position"));
   startForegroundService(i);
  }catch(Exception e){android.widget.Toast.makeText(MainActivity.this,"Could not start audio playback",1).show();}});}

  @JavascriptInterface public void transcriptionFinished(String entryId,String revision){main.post(()->AppNotifications.transcriptionFinished(MainActivity.this,entryId,revision));}
  @JavascriptInterface public String notificationEntry(){return Objects.toString(getIntent().getStringExtra("notificationEntry"),"");}
  @JavascriptInterface public void clearNotificationEntry(){getIntent().removeExtra("notificationEntry");}
  @JavascriptInterface public String updateStatus(){return updates==null?"{}":updates.status().toString();}
  @JavascriptInterface public void checkAppUpdates(){if(updates!=null)updates.check(true);}
  @JavascriptInterface public void setAutomaticUpdates(boolean enabled){if(updates!=null)updates.automatic(enabled);}
  @JavascriptInterface public void downloadAppUpdate(){main.post(()->{String address=updates==null?"":updates.downloadUrl();if(!address.isEmpty())try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(address)));}catch(Exception e){android.widget.Toast.makeText(MainActivity.this,"No browser is available to download the update.",1).show();}});}
  @JavascriptInterface public void requestNotifications(){main.post(()->{if(hasWindowFocus()&&Build.VERSION.SDK_INT>=33&&checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},14);});}
  @JavascriptInterface public boolean microphoneGranted(){return checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED;}
  @JavascriptInterface public void permissions(){main.post(()->{ArrayList<String> p=new ArrayList<>();if(!microphoneGranted())p.add(android.Manifest.permission.RECORD_AUDIO);if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)p.add(android.Manifest.permission.POST_NOTIFICATIONS);if(!p.isEmpty())requestPermissions(p.toArray(new String[0]),13);});}
  @JavascriptInterface public String command(String action,String metadata){
   final String[] answer={"{}"};CountDownLatch latch=new CountDownLatch(1);
   main.post(()->{try{
    if(action.equals("start")){if(PlaybackService.instance!=null)PlaybackService.instance.pause();Intent i=new Intent(MainActivity.this,BackgroundService.class);i.setAction("record");i.putExtra("metadata",metadata);startForegroundService(i);answer[0]="{\"starting\":true}";}
    else if(BackgroundService.instance!=null)answer[0]=BackgroundService.instance.command(action,metadata).toString();
    else if(action.equals("status"))answer[0]=BackgroundService.savedStatus(MainActivity.this).toString();
   }catch(Exception e){answer[0]="{\"error\":"+JSONObject.quote(e.getMessage())+"}";}finally{latch.countDown();}});
   try{latch.await(5,TimeUnit.SECONDS);}catch(Exception ignored){}return answer[0];
  }
  @JavascriptInterface public void ack(String id){if(id.matches("[a-zA-Z0-9_-]+"))BackgroundService.ack(MainActivity.this,id);}
  @JavascriptInterface public String http(String id,String path,String json,String base64,String code){
   if(!id.matches("[a-zA-Z0-9_-]+")||!Arrays.asList("/transcribe","/organize","/ask","/reflect","/interview","/profile-quiz","/clarify-question","/search").contains(path))return "Unsupported request";
   try{JSONObject job=new JSONObject().put("id",id).put("path",path).put("json",json).put("file",base64).put("code",code).put("cookie",Objects.toString(CookieManager.getInstance().getCookie(ORIGIN),""));BackgroundService.write(new File(BackgroundService.jobs(MainActivity.this),id+".request"),job.toString());main.post(()->{try{Intent i=new Intent(MainActivity.this,BackgroundService.class).setAction("http");startForegroundService(i);}catch(Exception e){BackgroundService.failJob(MainActivity.this,id,e.getMessage());}});return "";}catch(Exception e){return e.getMessage();}
  }
  @JavascriptInterface public String result(String id){if(!id.matches("[a-zA-Z0-9_-]+"))return "";File f=new File(BackgroundService.jobs(MainActivity.this),id+".result");try{return new String(BackgroundService.readAll(new FileInputStream(f)),"UTF-8");}catch(Exception e){return "";}}
  @JavascriptInterface public void forget(String id){if(id.matches("[a-zA-Z0-9_-]+"))new File(BackgroundService.jobs(MainActivity.this),id+".result").delete();}
  @JavascriptInterface public void exportBackup(String text,String name){exportData=text;main.post(()->{Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("application/json");i.putExtra(Intent.EXTRA_TITLE,name);startActivityForResult(i,11);});}
 }
}
