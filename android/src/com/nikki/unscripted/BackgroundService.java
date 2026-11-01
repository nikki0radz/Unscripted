package com.nikki.unscripted;

import android.app.*;
import android.os.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.media.MediaRecorder;
import org.json.*;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;

public class BackgroundService extends Service {
 static BackgroundService instance;
 static volatile double microphoneLevel;
 final Runnable sampleLevel=new Runnable(){public void run(){double value=0;if(recorder!=null&&!paused)try{value=recorder.getMaxAmplitude()/32768.0;}catch(Exception ignored){}microphoneLevel=value;handler.postDelayed(this,50);}};
 final Handler handler=new Handler(Looper.getMainLooper());
 final ExecutorService network=Executors.newSingleThreadExecutor();
 final Set<String> running=Collections.synchronizedSet(new HashSet<>());
 MediaRecorder recorder; JSONObject meta; File current; long clipStart,total; boolean paused; String error="";
 PowerManager.WakeLock wake;
 static File dir(Context c){File f=new File(c.getFilesDir(),"recordings");f.mkdirs();return f;}
 static File jobs(Context c){File f=new File(c.getFilesDir(),"jobs");f.mkdirs();return f;}
 static byte[] readAll(InputStream stream)throws IOException{try(InputStream in=stream;ByteArrayOutputStream b=new ByteArrayOutputStream()){byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1)b.write(buffer,0,n);return b.toByteArray();}}
 static synchronized void write(File f,String data)throws IOException{File tmp=new File(f.getPath()+".tmp");try(FileOutputStream out=new FileOutputStream(tmp)){out.write(data.getBytes("UTF-8"));out.getFD().sync();}if(!tmp.renameTo(f))throw new IOException("Could not commit recording metadata");}
 static synchronized JSONObject savedStatus(Context c){JSONObject result=new JSONObject();try{JSONArray clips=new JSONArray();File[] files=dir(c).listFiles((d,n)->n.endsWith(".json")&&!n.equals("session.json"));if(files!=null){Arrays.sort(files,Comparator.comparing(File::getName));for(File f:files)clips.put(new JSONObject(new String(readAll(new FileInputStream(f)),"UTF-8")));}result.put("clips",clips);result.put("active",false);File session=new File(dir(c),"session.json");if(session.isFile())result.put("interrupted",new JSONObject(new String(readAll(new FileInputStream(session)),"UTF-8")));}catch(Exception e){try{result.put("error",e.getMessage());}catch(Exception ignored){}}return result;}
 static synchronized void ack(Context c,String id){new File(dir(c),id+".json").delete();new File(dir(c),id+".m4a").delete();}
 static void failJob(Context c,String id,String message){try{write(new File(jobs(c),id+".result"),new JSONObject().put("error",message).toString());new File(jobs(c),id+".request").delete();MainActivity.signal();}catch(Exception ignored){}}
 @Override public void onCreate(){super.onCreate();instance=this;handler.post(sampleLevel);AppNotifications.channels(this);wake=((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"Unscripted:background");}
 void foreground(boolean microphone){PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);Notification.Builder b=new Notification.Builder(this,"activity").setSmallIcon(AppNotifications.icon(this)).setContentTitle("Unscripted").setContentText(microphone?(paused?"Recording paused":"Recording · tap to return"):"Processing your diary in the background…").setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true);
  if(!microphone)b.setProgress(0,0,true);
  int types=microphone?ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE:ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC;if(Build.VERSION.SDK_INT>=29)startForeground(1,b.build(),types);else startForeground(1,b.build());if(!wake.isHeld())wake.acquire();
 }
 @Override public int onStartCommand(Intent intent,int flags,int id){try{boolean record=intent!=null&&"record".equals(intent.getAction());foreground(record||meta!=null);if(record){if(meta!=null)throw new IllegalStateException("Another recording is already running");meta=new JSONObject(intent.getStringExtra("metadata"));total=0;paused=false;error="";write(new File(dir(this),"session.json"),meta.toString());beginClip();}scanJobs();}catch(Exception e){error=Objects.toString(e.getMessage(),"Background work failed");finishClip(false);meta=null;idle();}MainActivity.signal();return START_NOT_STICKY;}
 void beginClip()throws Exception{
  String id=UUID.randomUUID().toString();current=new File(dir(this),id+".m4a");
  recorder=new MediaRecorder();recorder.setAudioSource(MediaRecorder.AudioSource.MIC);recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);recorder.setAudioSamplingRate(44100);recorder.setAudioEncodingBitRate(48000);recorder.setOutputFile(current.getPath());recorder.setMaxFileSize(20*1024*1024);
  recorder.setOnErrorListener((r,w,x)->{error="Microphone interrupted. Previously saved clips are safe.";finishClip(false);meta=null;idle();MainActivity.signal();});
  recorder.setOnInfoListener((r,w,x)->{if(w==MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED){if(meta!=null&&meta.optBoolean("simple")){finishClip(false);meta=null;idle();MainActivity.signal();}else rotate();}});
  recorder.prepare();recorder.start();clipStart=SystemClock.elapsedRealtime();handler.removeCallbacks(rotation);if(!meta.optBoolean("simple"))handler.postDelayed(rotation,120000);MainActivity.signal();
 }
 final Runnable rotation=()->rotate();
 void rotate(){if(recorder==null||paused||meta==null)return;finishClip(true);try{beginClip();}catch(Exception e){error=e.getMessage();meta=null;idle();}MainActivity.signal();}
 void finishClip(boolean keepSession){handler.removeCallbacks(rotation);if(recorder==null)return;MediaRecorder r=recorder;recorder=null;long duration=SystemClock.elapsedRealtime()-clipStart;boolean valid=true;try{r.stop();}catch(Exception e){valid=false;error="The last audio clip was interrupted; earlier saved clips remain available.";}r.release();try{if(valid&&current.length()>0){JSONObject clip=new JSONObject(meta.toString());String id=current.getName().replace(".m4a","");clip.put("id",id).put("duration",duration).put("mime","audio/mp4").put("createdAt",new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",Locale.US){{setTimeZone(TimeZone.getTimeZone("UTC"));}}.format(new Date()));write(new File(dir(this),id+".json"),clip.toString());total+=duration;}else current.delete();}catch(Exception e){error="Could not save audio metadata: "+e.getMessage();}current=null;if(!keepSession)new File(dir(this),"session.json").delete();}
 JSONObject command(String action,String payload)throws Exception{
  switch(action){case "pause":if(meta!=null&&!paused){finishClip(true);paused=true;foreground(true);}break;
   case "resume":if(meta!=null&&paused){paused=false;beginClip();foreground(true);}break;
   case "stop":finishClip(false);meta=null;paused=false;idle();break;
   case "cancel":JSONObject old=meta;finishClip(false);meta=null;if(old!=null){JSONArray clips=savedStatus(this).optJSONArray("clips");for(int i=0;i<clips.length();i++){JSONObject c=clips.getJSONObject(i);if(c.optString("partId").equals(old.optString("partId"))&&c.optString("token").equals(old.optString("token")))ack(this,c.getString("id"));}}idle();break;
  }
  JSONObject s=savedStatus(this);s.put("active",meta!=null).put("paused",paused).put("totalMs",total+(recorder==null?0:SystemClock.elapsedRealtime()-clipStart)).put("error",error);if(meta!=null)s.put("metadata",meta);s.put("level",microphoneLevel);return s;
 }
 void scanJobs(){File[] files=jobs(this).listFiles((d,n)->n.endsWith(".request"));if(files==null)return;for(File f:files)if(running.add(f.getName()))network.submit(()->{String id=f.getName().replace(".request","");try{JSONObject job=new JSONObject(new String(readAll(new FileInputStream(f)),"UTF-8"));JSONObject result=request(job);write(new File(jobs(this),id+".result"),result.toString());f.delete();}catch(Exception e){failJob(this,id,"Transcription request failed: "+e.getMessage()+". Your audio is saved; tap Continue transcription to retry.");}finally{running.remove(f.getName());MainActivity.signal();handler.post(()->idle());}});}
 JSONObject request(JSONObject job)throws Exception{
  URL url=new URL(MainActivity.ORIGIN+job.getString("path"));HttpURLConnection connection=(HttpURLConnection)url.openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(30000);connection.setReadTimeout(120000);connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Origin",MainActivity.ORIGIN);connection.setRequestProperty("Cookie",job.optString("cookie"));if(!job.optString("code").isEmpty())connection.setRequestProperty("Authorization","Bearer "+job.getString("code"));
  byte[] body;if(!job.optString("file").isEmpty()){String boundary="Unscripted"+UUID.randomUUID();connection.setRequestProperty("Content-Type","multipart/form-data; boundary="+boundary);byte[] audio=android.util.Base64.decode(job.getString("file"),android.util.Base64.DEFAULT);ByteArrayOutputStream bytes=new ByteArrayOutputStream();String mime=job.optString("json","audio/mp4");String ext=mime.contains("webm")?"webm":mime.contains("ogg")?"ogg":"m4a";bytes.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\"file\"; filename=\"diary-clip."+ext+"\"\r\nContent-Type: "+mime+"\r\n\r\n").getBytes("UTF-8"));bytes.write(audio);bytes.write(("\r\n--"+boundary+"--\r\n").getBytes("UTF-8"));body=bytes.toByteArray();}else{connection.setRequestProperty("Content-Type","application/json");body=job.getString("json").getBytes("UTF-8");}
  try{connection.setFixedLengthStreamingMode(body.length);try(OutputStream out=connection.getOutputStream()){out.write(body);}int status=connection.getResponseCode();InputStream in=status>=400?connection.getErrorStream():connection.getInputStream();String text=in==null?"":new String(readAll(in),"UTF-8");JSONObject response;try{response=new JSONObject(text);}catch(Exception e){throw new IOException("AI server returned status "+status);}if(status>=400&&!response.has("error"))response.put("error","AI request failed ("+status+")");return response;}finally{connection.disconnect();}
 }
 void idle(){handler.removeCallbacks(stopIdle);if(meta==null&&running.isEmpty())handler.postDelayed(stopIdle,30000);else foreground(meta!=null);}
 final Runnable stopIdle=()->{if(meta==null&&running.isEmpty()){stopForeground(STOP_FOREGROUND_REMOVE);if(wake.isHeld())wake.release();stopSelf();}};
 @Override public void onTimeout(int startId,int fgsType){error="Android paused background processing. Reopen Unscripted to continue.";finishClip(false);meta=null;stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
 @Override public void onDestroy(){handler.removeCallbacks(sampleLevel);microphoneLevel=0;finishClip(false);if(wake!=null&&wake.isHeld())wake.release();if(instance==this)instance=null;network.shutdown();super.onDestroy();}
 @Override public IBinder onBind(Intent intent){return null;}
}
