package app.recallfirst;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
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
  private PermissionRequest pending;

  @Override public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
    if (pending == null) return;
    if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) pending.grant(pending.getResources()); else pending.deny();
    pending = null;
  }

  @Override protected void onCreate(Bundle state) {
    super.onCreate(state);
    web = new WebView(this);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);          // the local trend lives in localStorage
    s.setMediaPlaybackRequiresUserGesture(false);
    web.setWebViewClient(new WebViewClient());
    web.setWebChromeClient(new WebChromeClient() {
      // Mic for "Answer by voice": ask Android first (runtime permission), then grant the page's request.
      @Override public void onPermissionRequest(final PermissionRequest r) {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) { r.grant(r.getResources()); return; }
        pending = r;
        requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, 1);
      }
    });
    setContentView(web);
    if (state != null) web.restoreState(state); else web.loadUrl(URL);
  }
  @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
  @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
