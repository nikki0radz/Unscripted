"""Execute production layout setup against Android's pre-content decor lifecycle.
A focused JVM model reproduces PhoneWindow's null dereference before content
installation; it also delivers realistic bar/IME insets to the actual listener.
This is not an Android instrumentation or physical-device test.
"""
from pathlib import Path
import subprocess,tempfile,sys
root=Path(__file__).resolve().parents[1]
source=Path(sys.argv[1]).read_text() if len(sys.argv)>1 else (root/'android/src/com/nikki/unscripted/MainActivity.java').read_text()
startup=source[source.index('  // The container owns'):source.index('  WebSettings s=')]
for name in ['android.view.WindowInsetsController','android.view.WindowInsets','android.view.Window','android.view.View','android.graphics.Insets','android.graphics.Color','android.widget.FrameLayout','android.webkit.WebView']:
 startup=startup.replace(name,name.split('.')[-1])
harness='''
public class StartupCheck {
 static class Build {static class VERSION {static int SDK_INT;}}
 static class Color {static int TRANSPARENT=0;}
 static class Insets {int left,top,right,bottom;Insets(int l,int t,int r,int b){left=l;top=t;right=r;bottom=b;}}
 static class WindowInsets {
  static class Type {static int systemBars(){return 1;}static int displayCutout(){return 2;}static int ime(){return 4;}}
  static WindowInsets CONSUMED=new WindowInsets();
  Insets bars=new Insets(0,24,0,48),keyboard=new Insets(0,0,0,0);
  Insets getInsets(int type){return type==4?keyboard:bars;}
  int getSystemWindowInsetLeft(){return bars.left;}int getSystemWindowInsetTop(){return bars.top;}int getSystemWindowInsetRight(){return bars.right;}int getSystemWindowInsetBottom(){return Math.max(bars.bottom,keyboard.bottom);}
  WindowInsets consumeSystemWindowInsets(){return CONSUMED;}
 }
 static class WindowInsetsController {
  static final int APPEARANCE_LIGHT_STATUS_BARS=8,APPEARANCE_LIGHT_NAVIGATION_BARS=16;
  int calls;void setSystemBarsAppearance(int appearance,int mask){if(appearance!=0)throw new AssertionError("Expected light icons");calls++;}
 }
 static class View {
  static final int SYSTEM_UI_FLAG_LAYOUT_STABLE=256,SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN=1024,SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION=512;
  int left,top,right,bottom;void setPadding(int l,int t,int r,int b){left=l;top=t;right=r;bottom=b;}void setSystemUiVisibility(int flags){}
 }
 static class Window {
  View decor;boolean absentController;WindowInsetsController controller=new WindowInsetsController();
  void setStatusBarColor(int color){}void setNavigationBarColor(int color){}void setNavigationBarDividerColor(int color){}void setNavigationBarContrastEnforced(boolean b){}void setStatusBarContrastEnforced(boolean b){}void setDecorFitsSystemWindows(boolean b){}
  View getDecorView(){if(decor==null)decor=new View();return decor;}
  WindowInsetsController getInsetsController(){if(decor==null)throw new NullPointerException("PhoneWindow.mDecor is not installed");return absentController?null:controller;}
 }
 interface InsetsListener {WindowInsets apply(View v,WindowInsets i);}
 static class FrameLayout extends View {
  static class LayoutParams {LayoutParams(int w,int h){}}
  InsetsListener listener;FrameLayout(Object context){}void setBackgroundColor(int colour){}void addView(WebView web,LayoutParams params){}void setOnApplyWindowInsetsListener(InsetsListener l){listener=l;}void requestApplyInsets(){listener.apply(this,new WindowInsets());}
 }
 static class WebView extends View {static final int RENDERER_PRIORITY_IMPORTANT=2;WebView(Object context){}void setBackgroundColor(int color){}void setRendererPriorityPolicy(int priority,boolean waived){if(priority!=2||waived)throw new AssertionError("Background renderer priority must be retained");}}
 Window window=new Window();WebView web;FrameLayout content;
 Window getWindow(){return window;}void setContentView(FrameLayout v){window.getDecorView();content=v;}
 void startup(){PRODUCTION}
 static void require(boolean b,String message){if(!b)throw new AssertionError(message);}
 public static void main(String[] args){
  for(int sdk:new int[]{26,29,30,35})for(boolean missing:new boolean[]{false,true}){
   Build.VERSION.SDK_INT=sdk;StartupCheck a=new StartupCheck();a.window.absentController=missing;a.startup();
   require(a.content!=null,"Content installed");require(a.content.top==24&&a.content.bottom==48,"System bars reserved outside WebView");
   if(sdk>=30&&!missing)require(a.window.controller.calls==1,"Controller configured after decor creation");
   WindowInsets keyboard=new WindowInsets();keyboard.keyboard=new Insets(0,0,0,320);a.content.listener.apply(a.content,keyboard);require(a.content.bottom==320,"Keyboard above navigation bar");
   a.content.listener.apply(a.content,new WindowInsets());require(a.content.bottom==48,"Closing keyboard restores navigation space");
  }
  System.out.println("Passed: startup before decor, null controllers, API 26/29/30/35, system-bar bounds, keyboard resizing and restoration.");
 }
}
'''.replace('PRODUCTION',startup)
with tempfile.TemporaryDirectory(prefix='unscripted-startup-') as work:
 file=Path(work)/'StartupCheck.java';file.write_text(harness)
 subprocess.run(['java','com.sun.tools.javac.Main','-d',work,str(file)],check=True)
 subprocess.run(['java','-cp',work,'StartupCheck'],check=True)
