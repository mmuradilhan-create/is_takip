import { WIDGET_OUTER_FALLBACK, WIDGET_VIEWPORT } from "../src/window-size.js";

function nativeWindowTypes() {
  const nativeWidgetCode = `using System; using System.Collections.Generic; using System.Text; using System.Runtime.InteropServices; public static class OdakWidgetBounds {
public delegate bool EnumProc(IntPtr h,IntPtr p);
[StructLayout(LayoutKind.Sequential)] struct R { public int L,T,Rt,B; public int W { get { return Rt-L; } } public int H { get { return B-T; } } }
[DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb,IntPtr p);
[DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h,EnumProc cb,IntPtr p);
[DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
[DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder s,int n);
[DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out R r);
[DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
[DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
[DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int n);
[DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int z,uint flags);
[DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr h);
[DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
static string Class(IntPtr h) { var c=new StringBuilder(128); GetClassName(h,c,c.Capacity); return c.ToString(); }
static bool Widget(IntPtr h) { if(!IsWindowVisible(h) || !Class(h).StartsWith("Chrome_WidgetWin_")) return false; var t=new StringBuilder(512); GetWindowText(h,t,t.Capacity); return t.ToString()=="ODAK · Özet"; }
public static IntPtr[] Windows(bool widgetOnly) { var found=new List<IntPtr>(); EnumWindows(delegate(IntPtr h,IntPtr p) { if(Class(h).StartsWith("Chrome_WidgetWin_")) { var t=new StringBuilder(512); GetWindowText(h,t,t.Capacity); if(!widgetOnly || (IsWindowVisible(h) && t.ToString()=="ODAK · Özet")) found.Add(h); } return true; },IntPtr.Zero); return found.ToArray(); }
static bool Renderer(IntPtr h,R outer,out R view) { R best=new R(); EnumChildWindows(h,delegate(IntPtr child,IntPtr p) { R r; if(IsWindowVisible(child) && Class(child)=="Chrome_RenderWidgetHostHWND" && GetWindowRect(child,out r) && r.W>0 && r.H>0 && r.L>=outer.L && r.T>=outer.T && r.Rt<=outer.Rt && r.B<=outer.B && (long)r.W*r.H>(long)best.W*best.H) best=r; return true; },IntPtr.Zero); view=best; return best.W>0 && best.H>0; }
public static void Fit(IntPtr h) { if(h==IntPtr.Zero || !Widget(h)) return; if(IsZoomed(h) || IsIconic(h)) { ShowWindow(h,9); return; } IntPtr previous=IntPtr.Zero; try { previous=SetThreadDpiAwarenessContext(new IntPtr(-4)); if(previous==IntPtr.Zero) previous=SetThreadDpiAwarenessContext(new IntPtr(-3)); } catch(EntryPointNotFoundException) {} if(previous==IntPtr.Zero) return; try { uint dpi=96; try { dpi=GetDpiForWindow(h); } catch(EntryPointNotFoundException) {} if(dpi==0) dpi=96; double scale=dpi/96.0; R outer,view; if(!GetWindowRect(h,out outer)) return; int w=0,z=0; if(Renderer(h,outer,out view)) { int targetW=(int)Math.Round(${WIDGET_VIEWPORT.width}*scale),targetH=(int)Math.Round(${WIDGET_VIEWPORT.height}*scale); if(Math.Abs(view.W-targetW)<=1 && Math.Abs(view.H-targetH)<=1) return; w=outer.W+targetW-view.W; z=outer.H+targetH-view.H; } else if(outer.W>500*scale || outer.H>600*scale) { w=(int)Math.Round(${WIDGET_OUTER_FALLBACK.width}*scale); z=(int)Math.Round(${WIDGET_OUTER_FALLBACK.height}*scale); } if(w>0 && z>0) SetWindowPos(h,IntPtr.Zero,0,0,w,z,0x0002|0x0004|0x0010); } finally { SetThreadDpiAwarenessContext(previous); } }
}`;
  const mainTitles = [
    "Dashboard · Odak",
    "Genel bakış · Odak",
    "Günlük işler · Odak",
    "Haftalık plan · Odak",
    "Aylık hedefler · Odak",
    "Senelik hedefler · Odak",
    "Toplantı aksiyon · Odak",
    "Toplantı aksiyonları · Odak",
    "Bekleyen konular · Odak",
  ];
  const nativeMainCode = `using System; using System.Collections.Generic; using System.Text; using System.Runtime.InteropServices; public static class OdakMainBounds {
public delegate bool EnumProc(IntPtr h,IntPtr p);
[DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb,IntPtr p);
[DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
[DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder s,int n);
[DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int n);
[DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
static readonly string[] Titles=new string[]{${mainTitles.map((title) => JSON.stringify(title)).join(",")}};
public static IntPtr[] Windows(bool mainOnly) { var found=new List<IntPtr>(); EnumWindows(delegate(IntPtr h,IntPtr p) { if(!mainOnly || IsWindowVisible(h)) { var t=new StringBuilder(512); var c=new StringBuilder(128); GetWindowText(h,t,t.Capacity); GetClassName(h,c,c.Capacity); if(c.ToString().StartsWith("Chrome_WidgetWin_") && (!mainOnly || Array.IndexOf(Titles,t.ToString())>=0)) found.Add(h); } return true; },IntPtr.Zero); return found.ToArray(); }
public static void Maximize(IntPtr h) { if(h==IntPtr.Zero || !IsWindowVisible(h)) return; var t=new StringBuilder(512); var c=new StringBuilder(128); GetWindowText(h,t,t.Capacity); GetClassName(h,c,c.Capacity); if(c.ToString().StartsWith("Chrome_WidgetWin_") && Array.IndexOf(Titles,t.ToString())>=0 && !IsZoomed(h)) ShowWindow(h,3); }
}`;
  return { widget: nativeWidgetCode, main: nativeMainCode };
}

/** One session-local helper handles new ODAK windows from either role. */
export function windowHelperSource() {
  const types = nativeWindowTypes();
  const native = `${types.widget}\n${types.main.slice(types.main.indexOf("public static class"))}`;
  return `$ErrorActionPreference='Stop'
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$prefix='Local\\ODAK.WindowSizing.'+$sid
$worker=[Threading.Mutex]::new($false,$prefix+'.Worker')
$launch=[Threading.Mutex]::new($false,$prefix+'.Launch')
$ready=[Threading.EventWaitHandle]::new($false,[Threading.EventResetMode]::ManualReset,$prefix+'.Ready')
$wake=[Threading.EventWaitHandle]::new($false,[Threading.EventResetMode]::AutoReset,$prefix+'.Wake')
$owned=$false
$exitLock=$false
try {
  try { $owned=$worker.WaitOne(0) } catch [Threading.AbandonedMutexException] { $owned=$true }
  if (!$owned) { return }
  $ready.Reset()
  Add-Type -TypeDefinition @'
${native}
'@
  $seen=[Collections.Generic.HashSet[IntPtr]]::new()
  foreach ($h in @([OdakMainBounds]::Windows($false))) { [void]$seen.Add($h) }
  $settling=@{}
  $clock=[Diagnostics.Stopwatch]::StartNew()
  $lastSeen=$clock.ElapsedMilliseconds
  $idleGrace=30000
  $ready.Set()
  while ($true) {
    $now=$clock.ElapsedMilliseconds
    if ($wake.WaitOne(0)) { $lastSeen=$now; $idleGrace=30000 }
    $alive=[Collections.Generic.HashSet[IntPtr]]::new()
    foreach ($h in @([OdakMainBounds]::Windows($false))) { [void]$alive.Add($h) }
    foreach ($h in @($seen)) { if (!$alive.Contains($h)) { [void]$seen.Remove($h); $settling.Remove($h) } }
    $mains=@([OdakMainBounds]::Windows($true))
    $widgets=@([OdakWidgetBounds]::Windows($true))
    if ($mains.Count+$widgets.Count -gt 0) { $lastSeen=$now; $idleGrace=5000 }
    foreach ($h in $mains) {
      if ($seen.Add($h)) { $settling[$h]=@{ Role='main'; Until=$now+2500 } }
    }
    foreach ($h in $widgets) {
      if ($seen.Add($h)) { $settling[$h]=@{ Role='widget'; Until=$now+2500 } }
    }
    foreach ($h in @($settling.Keys)) {
      $entry=$settling[$h]
      if (!$alive.Contains($h) -or $now -ge $entry.Until) { $settling.Remove($h); continue }
      if ($entry.Role -eq 'widget') { [OdakWidgetBounds]::Fit($h) }
      else { [OdakMainBounds]::Maximize($h) }
    }
    if ($mains.Count+$widgets.Count -eq 0 -and $now-$lastSeen -ge $idleGrace) {
      try { $exitLock=$launch.WaitOne(0) } catch [Threading.AbandonedMutexException] { $exitLock=$true }
      if ($exitLock) {
        if ($wake.WaitOne(0)) { $lastSeen=$now; $idleGrace=30000 }
        elseif (@([OdakMainBounds]::Windows($true)).Count+@([OdakWidgetBounds]::Windows($true)).Count -gt 0) { $lastSeen=$now; $idleGrace=5000 }
        else { $ready.Reset(); break }
        $launch.ReleaseMutex()
        $exitLock=$false
      }
    }
    Start-Sleep -Milliseconds 100
  }
} finally {
  if ($owned) { $ready.Reset(); $worker.ReleaseMutex() }
  if ($exitLock) { $launch.ReleaseMutex() }
  $worker.Dispose()
  $launch.Dispose()
  $ready.Dispose()
  $wake.Dispose()
}
`;
}

/** Keep geometry out of Chrome's process-wide command line. */
export function createWindowsLauncher(mode) {
  if (!["desktop", "widget"].includes(mode))
    throw new Error("Geçersiz pencere görünümü.");
  const statements = [
    "$html=[IO.Path]::GetFullPath($env:ODAK_HTML)",
    "if (!(Test-Path -LiteralPath $html -PathType Leaf)) { throw 'TAKIP.html bulunamadi. Baslaticiyi TAKIP.html ile ayni klasore koyun.' }",
    "$paths=@()",
    "foreach ($folder in @($env:LOCALAPPDATA,$env:ProgramFiles,${env:ProgramFiles(x86)})) { if ($folder) { $paths+=(Join-Path $folder 'Google\\Chrome\\Application\\chrome.exe') } }",
    "$chrome=$paths | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1",
    "if (!$chrome) { foreach ($key in @('HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe','HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe')) { if (Test-Path -LiteralPath $key) { $candidate=(Get-Item -LiteralPath $key).GetValue(''); if ($candidate) { $candidate=$candidate.Trim([char]34); if (Test-Path -LiteralPath $candidate -PathType Leaf) { $chrome=$candidate; break } } } } }",
    "if (!$chrome) { throw 'Google Chrome bulunamadi. Mevcut kayitlarin farkli bir tarayicida acilmamasi icin otomatik tarayici degisikligi yapilmadi.' }",
    `$url=([Uri]$html).AbsoluteUri+'#${mode}'`,
    "$arguments=@(('--app='+[char]34+$url+[char]34))",
    "$helper=Join-Path ([IO.Path]::GetDirectoryName($html)) 'ODAK-Pencere.ps1'",
    "$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
    "$prefix='Local\\ODAK.WindowSizing.'+$sid",
    "$launch=[Threading.Mutex]::new($false,$prefix+'.Launch')",
    "$ready=$null; $wake=$null; $launchOwned=$false; $sizingReady=$false",
    "try { try { $launchOwned=$launch.WaitOne(10000) } catch [Threading.AbandonedMutexException] { $launchOwned=$true }; if ($launchOwned) { try { if (!(Test-Path -LiteralPath $helper -PathType Leaf)) { throw 'ODAK-Pencere.ps1 bulunamadi.' }; $ready=[Threading.EventWaitHandle]::new($false,[Threading.EventResetMode]::ManualReset,$prefix+'.Ready'); $wake=[Threading.EventWaitHandle]::new($false,[Threading.EventResetMode]::AutoReset,$prefix+'.Wake'); $wake.Set() | Out-Null; $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes([IO.File]::ReadAllText($helper))); if ($encoded.Length -gt 30000) { throw 'Pencere yardimcisi komut sinirini asiyor.' }; Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -WindowStyle Hidden -ArgumentList @('-NoLogo','-NoProfile','-EncodedCommand',$encoded); $sizingReady=$ready.WaitOne(10000) } catch { $sizingReady=$false } }; Start-Process -FilePath $chrome -ArgumentList $arguments } finally { if ($ready) { $ready.Dispose() }; if ($wake) { $wake.Dispose() }; if ($launchOwned) { $launch.ReleaseMutex() }; $launch.Dispose() }",
    "if (!$sizingReady) { Write-Host 'ODAK acildi; otomatik pencere boyutu uygulanamadi. ODAK-Pencere.ps1 dosyasini ayni klasorde tutun.'; pause }",
  ];
  const command =
    "$ErrorActionPreference='Stop'; try { " +
    statements.join("; ") +
    " } catch { Write-Host 'ODAK acilamadi.'; Write-Host $_.Exception.Message; exit 1 }";
  if (command.length + 80 > 8191)
    throw new Error("Windows başlatıcısı CMD satır sınırını aşıyor.");
  return [
    "@echo off",
    "setlocal DisableDelayedExpansion",
    "rem Keep all package files beside the existing TAKIP.html.",
    'set "ODAK_HTML=%~dp0TAKIP.html"',
    `powershell.exe -NoLogo -NoProfile -Command "${command}"`,
    "if errorlevel 1 (",
    "  echo.",
    "  pause",
    "  exit /b 1",
    ")",
    "endlocal",
    "",
  ].join("\r\n");
}
