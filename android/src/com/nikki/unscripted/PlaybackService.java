package com.nikki.unscripted;

import android.app.*;
import android.content.*;
import android.media.*;
import android.media.session.*;
import android.os.*;
import org.json.*;
import java.io.*;

/** Owns playback and media controls independently of the WebView lifecycle. */
public class PlaybackService extends Service {
 static PlaybackService instance;
 static volatile String snapshot="{}";
 static final int ID=41;
 final Handler handler=new Handler(Looper.getMainLooper());
 MediaPlayer player; MediaSession session; AudioManager manager; AudioFocusRequest focus;
 JSONArray clips=new JSONArray(); String token="",entry="",title="Voice recording",error="";
 int index; long pending; boolean prepared,wantsPlay,ended;
 static File directory(Context c){File f=new File(c.getCacheDir(),"playback");f.mkdirs();return f;}
 static boolean safe(String s){return s!=null&&s.matches("[a-zA-Z0-9_-]{1,128}");}
 static File file(Context c,String token,int index){return new File(directory(c),token+"-"+index+".audio");}
 final Runnable tick=new Runnable(){public void run(){publish(false);handler.postDelayed(this,500);}};
 final BroadcastReceiver noisy=new BroadcastReceiver(){public void onReceive(Context c,Intent i){pause();}};
 @Override public void onCreate(){super.onCreate();instance=this;
  getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel("playback","Voice-note playback",NotificationManager.IMPORTANCE_LOW));
  File[] cached=directory(this).listFiles();if(cached!=null)for(File f:cached)if(f.lastModified()<System.currentTimeMillis()-86400000L)f.delete();
  manager=getSystemService(AudioManager.class);
  AudioAttributes attributes=new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();
  focus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(attributes).setOnAudioFocusChangeListener(change->{if(change<0)pause();},handler).build();
  session=new MediaSession(this,"Unscripted playback");
  session.setCallback(new MediaSession.Callback(){public void onPlay(){resume();}public void onPause(){pause();}public void onStop(){finish();}public void onRewind(){seek(position()-10000);}public void onSeekTo(long p){seek(p);}});
  session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS|MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);session.setActive(true);
  if(Build.VERSION.SDK_INT>=33)registerReceiver(noisy,new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),Context.RECEIVER_NOT_EXPORTED);else registerReceiver(noisy,new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
  handler.post(tick);
 }
 @Override public int onStartCommand(Intent intent,int flags,int id){
  startForeground(ID,notification());
  try{String action=intent==null?"stop":intent.getAction();
   if("load".equals(action)){JSONObject data=new JSONObject(intent.getStringExtra("data"));String next=data.getString("token");if(!safe(next))throw new IOException("Invalid recording");
    if(!next.equals(token)){releasePlayer();token=next;clips=data.getJSONArray("clips");if(clips.length()==0||clips.length()>10000)throw new IOException("No audio");entry=data.optString("entryId");title=data.optString("title","Voice recording");if(title.length()>160)title=title.substring(0,160);index=0;pending=0;ended=false;error="";
     for(int n=0;n<clips.length();n++)if(!file(this,token,n).isFile())throw new IOException("Audio is missing");

    }
    resume();
   }else if("play".equals(action))resume();else if("pause".equals(action))pause();else if("back".equals(action))seek(position()-10000);else if("seek".equals(action))seek(intent.getLongExtra("position",0));else if("stop".equals(action))finish();
  }catch(Exception e){fail("Could not play this recording.");}
  return START_NOT_STICKY;
 }
 long duration(int n){return Math.max(1,clips.optJSONObject(n).optLong("duration",1));}
 long total(){long n=0;for(int i=0;i<clips.length();i++)n+=duration(i);return n;}
 long position(){long n=0;for(int i=0;i<index;i++)n+=duration(i);try{return n+(prepared?player.getCurrentPosition():pending);}catch(Exception e){return n+pending;}}
 void resume(){try{startForeground(ID,notification());if(manager.requestAudioFocus(focus)!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED){error="Audio is being used by another app.";wantsPlay=false;publish(true);return;}error="";wantsPlay=true;if(ended){ended=false;index=0;pending=0;releasePlayer();}if(player==null)load();else if(prepared)player.start();publish(true);}catch(Exception e){fail("Could not resume this recording.");}}
 void pause(){wantsPlay=false;try{if(prepared)player.pause();}catch(Exception ignored){}manager.abandonAudioFocusRequest(focus);publish(true);}
 void releasePlayer(){prepared=false;if(player!=null){player.release();player=null;}}
 void load(){try{releasePlayer();final MediaPlayer p=new MediaPlayer();player=p;
  p.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());p.setWakeMode(this,PowerManager.PARTIAL_WAKE_LOCK);p.setDataSource(file(this,token,index).getAbsolutePath());
  p.setOnPreparedListener(mp->{if(player!=mp)return;prepared=true;try{clips.getJSONObject(index).put("duration",mp.getDuration());}catch(Exception ignored){}mp.seekTo(Math.min(pending,Math.max(0,mp.getDuration()-1)),MediaPlayer.SEEK_CLOSEST);pending=0;if(wantsPlay)mp.start();publish(true);});
  p.setOnCompletionListener(mp->{if(index+1<clips.length()){index++;pending=0;load();}else{wantsPlay=false;ended=true;manager.abandonAudioFocusRequest(focus);publish(true);stopForeground(STOP_FOREGROUND_REMOVE);}});
  p.setOnErrorListener((mp,what,extra)->{fail("This audio format could not be played.");return true;});p.prepareAsync();
 }catch(Exception e){fail("Could not read this recording.");}}
 void seek(long target){if(clips.length()==0)return;target=Math.max(0,Math.min(total()-1,target));int n=0;while(n+1<clips.length()&&target>=duration(n)){target-=duration(n);n++;}ended=false;pending=target;if(n!=index||player==null){index=n;load();}else if(prepared){player.seekTo(pending,MediaPlayer.SEEK_CLOSEST);pending=0;}publish(true);}
 void fail(String message){error=message;wantsPlay=false;releasePlayer();manager.abandonAudioFocusRequest(focus);publish(false);stopForeground(STOP_FOREGROUND_REMOVE);}
 void finish(){wantsPlay=false;ended=false;pending=0;index=0;releasePlayer();publish(false);stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
 PendingIntent action(String name){return PendingIntent.getService(this,name.hashCode(),new Intent(this,PlaybackService.class).setAction(name),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
 Notification notification(){Intent i=new Intent(this,MainActivity.class).setAction("playback-"+entry).putExtra("notificationEntry",entry);PendingIntent open=PendingIntent.getActivity(this,41,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  if(session!=null)session.setSessionActivity(open);
  Notification.Builder b=new Notification.Builder(this,"playback").setSmallIcon(AppNotifications.icon(this)).setContentTitle(title).setContentText(wantsPlay?"Playing voice recording":"Paused").setContentIntent(open).setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PRIVATE).setCategory(Notification.CATEGORY_TRANSPORT).setOngoing(wantsPlay)
   .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_rew,"Back 10 seconds",action("back")).build())
   .addAction(new Notification.Action.Builder(wantsPlay?android.R.drawable.ic_media_pause:android.R.drawable.ic_media_play,wantsPlay?"Pause":"Play",action(wantsPlay?"pause":"play")).build())
   .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"Stop",action("stop")).build()).setDeleteIntent(action("stop"));
  if(session!=null)b.setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0,1,2));return b.build();
 }
 void publish(boolean notify){try{snapshot=new JSONObject().put("active",instance==this).put("token",token).put("position",position()).put("duration",total()).put("playing",wantsPlay).put("ended",ended).put("error",error).toString();
  session.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE,title).putString(MediaMetadata.METADATA_KEY_ARTIST,"Unscripted").putLong(MediaMetadata.METADATA_KEY_DURATION,total()).build());
  session.setPlaybackState(new PlaybackState.Builder().setActions(PlaybackState.ACTION_PLAY|PlaybackState.ACTION_PAUSE|PlaybackState.ACTION_PLAY_PAUSE|PlaybackState.ACTION_STOP|PlaybackState.ACTION_REWIND|PlaybackState.ACTION_SEEK_TO).setState(ended?PlaybackState.STATE_STOPPED:wantsPlay?PlaybackState.STATE_PLAYING:PlaybackState.STATE_PAUSED,position(),wantsPlay?1:0).build());
  if(notify&&!token.isEmpty())getSystemService(NotificationManager.class).notify(ID,notification());
 }catch(Exception ignored){}}
 @Override public void onDestroy(){handler.removeCallbacks(tick);releasePlayer();manager.abandonAudioFocusRequest(focus);session.release();unregisterReceiver(noisy);if(instance==this)instance=null;try{snapshot=new JSONObject(snapshot).put("active",false).put("playing",false).toString();}catch(Exception ignored){}super.onDestroy();}
 @Override public IBinder onBind(Intent i){return null;}
}
