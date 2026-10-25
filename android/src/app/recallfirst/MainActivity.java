package app.recallfirst;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

// Recall First for Android: the web app in a full-screen WebView.
public class MainActivity extends Activity {
  private static final String URL = "https://recall-first.vercel.app/app";
  private WebView web;

  @Override protected void onCreate(Bundle state) {
    super.onCreate(state);
    web = new WebView(this);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);          // the local trend lives in localStorage
    s.setMediaPlaybackRequiresUserGesture(false);
    web.setWebViewClient(new WebViewClient());
    web.setWebChromeClient(new WebChromeClient() {
      @Override public void onPermissionRequest(PermissionRequest r) { r.grant(r.getResources()); }  // mic for "Speak your answer"
    });
    setContentView(web);
    if (state != null) web.restoreState(state); else web.loadUrl(URL);
  }
  @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
  @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
