package com.nikki.unscripted;

import android.app.*;
import android.content.*;

final class AppNotifications {
 static final String COMPLETE="transcription_complete";
 static int icon(Context c){return c.getResources().getIdentifier("ic_notification_u","drawable",c.getPackageName());}
 static void channels(Context c){
  NotificationManager manager=c.getSystemService(NotificationManager.class);
  manager.createNotificationChannel(new NotificationChannel("activity","Recording and transcription",NotificationManager.IMPORTANCE_LOW));
  NotificationChannel complete=new NotificationChannel(COMPLETE,"Transcription finished",NotificationManager.IMPORTANCE_DEFAULT);
  complete.setDescription("Let you know when a recording's full transcript has been saved.");
  manager.createNotificationChannel(complete);
 }
 static synchronized void transcriptionFinished(Context c,String entryId,String revision){
  if(!entryId.matches("[a-zA-Z0-9_-]{1,128}")||revision.isEmpty()||revision.length()>32768)return;
  channels(c);
  NotificationManager manager=c.getSystemService(NotificationManager.class);
  if(!manager.areNotificationsEnabled()||manager.getNotificationChannel(COMPLETE).getImportance()==NotificationManager.IMPORTANCE_NONE)return;
  SharedPreferences sent=c.getSharedPreferences("transcription-notifications",Context.MODE_PRIVATE);
  if(revision.equals(sent.getString(entryId,"")))return;
  Intent intent=new Intent(c,MainActivity.class).setAction("transcription-"+entryId).putExtra("notificationEntry",entryId);
  PendingIntent open=PendingIntent.getActivity(c,0,intent,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
  Notification notification=new Notification.Builder(c,COMPLETE).setSmallIcon(icon(c))
   .setContentTitle("Transcription finished").setContentText("Your transcript is ready. Tap to open your entry.")
   .setContentIntent(open).setAutoCancel(true).setCategory(Notification.CATEGORY_STATUS).build();
  try{manager.notify(entryId,2,notification);sent.edit().putString(entryId,revision).apply();}catch(SecurityException ignored){}
 }
}
