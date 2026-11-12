import {
  MAIN_VIEWPORT,
  WIDGET_OUTER_FALLBACK,
  WIDGET_VIEWPORT,
} from "../src/window-size.js";
import { TASKBAR_IDS, taskbarIdentityType } from "./taskbar-identity.js";

function nativeWindowTypes() {
  const nativeWidgetCode = `public static class OdakWidgetBounds {
public delegate bool EnumProc(IntPtr h,IntPtr p);
[StructLayout(LayoutKind.Sequential)] struct R { public int L,T,Rt,B; public int W { get { return Rt-L; } } public int H { get { return B-T; } } }
[DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb,IntPtr p);
[DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h,EnumProc cb,IntPtr p);
[DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
[DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder s,int n);
[DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out R r);
[DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
[DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
[DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
[DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int n);
[DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int z,uint flags);
[DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr h);
[DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
static string Class(IntPtr h) { var c=new StringBuilder(128); GetClassName(h,c,c.Capacity); return c.ToString(); }
static string Title(IntPtr h) { var t=new StringBuilder(512); GetWindowText(h,t,t.Capacity); return t.ToString(); }
static bool WidgetTitle(string title) { return title=="ODAK · Özet" || title=="ODAK · Özet · Üstte"; }
static bool Widget(IntPtr h) { return IsWindowVisible(h) && Class(h).StartsWith("Chrome_WidgetWin_") && WidgetTitle(Title(h)); }
public static IntPtr[] Windows(bool widgetOnly) { var found=new List<IntPtr>(); EnumWindows(delegate(IntPtr h,IntPtr p) { if(Class(h).StartsWith("Chrome_WidgetWin_") && (!widgetOnly || Widget(h))) found.Add(h); return true; },IntPtr.Zero); return found.ToArray(); }
static readonly Dictionary<IntPtr,bool> PinStates=new Dictionary<IntPtr,bool>();
public static void ForgetPin(IntPtr h) { PinStates.Remove(h); }
public static void ReleasePins() {
  foreach(IntPtr h in new List<IntPtr>(PinStates.Keys)) {
    if(!PinStates[h]) continue;
    if(!IsWindow(h)) { PinStates.Remove(h); continue; }
    if(Widget(h)) continue;
    SetWindowPos(h,new IntPtr(-2),0,0,0,0,0x0001|0x0002|0x0010);
    PinStates.Remove(h);
  }
}
public static void SyncPin(IntPtr h) {
  if(h==IntPtr.Zero || !IsWindowVisible(h) || !Class(h).StartsWith("Chrome_WidgetWin_")) return;
  string title=Title(h); if(!WidgetTitle(title)) return;
  bool requested=title=="ODAK · Özet · Üstte",previous; if(!PinStates.TryGetValue(h,out previous)) previous=false;
  PinStates[h]=requested; if(previous==requested) return;
  SetWindowPos(h,new IntPtr(requested?-1:-2),0,0,0,0,0x0001|0x0002|0x0010);
}
static bool Renderer(IntPtr h,R outer,out R view) { R best=new R(); EnumChildWindows(h,delegate(IntPtr child,IntPtr p) { R r; if(IsWindowVisible(child) && Class(child)=="Chrome_RenderWidgetHostHWND" && GetWindowRect(child,out r) && r.W>0 && r.H>0 && r.L>=outer.L && r.T>=outer.T && r.Rt<=outer.Rt && r.B<=outer.B && (long)r.W*r.H>(long)best.W*best.H) best=r; return true; },IntPtr.Zero); view=best; return best.W>0 && best.H>0; }
class Pending { public string Sample; public long StableSince; public bool Restored; }
static readonly Dictionary<IntPtr,Pending> PendingWindows=new Dictionary<IntPtr,Pending>();
public static void Forget(IntPtr h) { PendingWindows.Remove(h); }
// true releases this HWND; wait without resizing until startup measurements settle.
public static bool Fit(IntPtr h,long now,bool expired) {
  if(h==IntPtr.Zero || !Widget(h)) return true;
  Pending pending; if(!PendingWindows.TryGetValue(h,out pending)) { pending=new Pending(); PendingWindows.Add(h,pending); }
  if(IsZoomed(h) || IsIconic(h)) { if(!pending.Restored) { pending.Restored=true; pending.Sample=null; ShowWindow(h,9); } return expired; }
  IntPtr previous=IntPtr.Zero;
  try { previous=SetThreadDpiAwarenessContext(new IntPtr(-4)); if(previous==IntPtr.Zero) previous=SetThreadDpiAwarenessContext(new IntPtr(-3)); } catch(EntryPointNotFoundException) {}
  if(previous==IntPtr.Zero) return expired;
  try {
    uint dpi=96; try { dpi=GetDpiForWindow(h); } catch(EntryPointNotFoundException) {} if(dpi==0) dpi=96;
    double scale=dpi/96.0; R outer,view; if(!GetWindowRect(h,out outer)) return expired;
    int w=0,z=0;
    if(Renderer(h,outer,out view)) {
      string sample=dpi+":"+outer.L+":"+outer.T+":"+outer.W+":"+outer.H+":"+view.W+":"+view.H;
      if(pending.Sample!=sample) { pending.Sample=sample; pending.StableSince=now; return expired; }
      if(now-pending.StableSince<200) return expired;
      int targetW=(int)Math.Round(${WIDGET_VIEWPORT.width}*scale),targetH=(int)Math.Round(${WIDGET_VIEWPORT.height}*scale);
      if(Math.Abs(view.W-targetW)<=1 && Math.Abs(view.H-targetH)<=1) return true;
      w=outer.W+targetW-view.W; z=outer.H+targetH-view.H;
    } else {
      pending.Sample=null;
      if(!expired) return false;
      if(outer.W>500*scale || outer.H>600*scale) { w=(int)Math.Round(${WIDGET_OUTER_FALLBACK.width}*scale); z=(int)Math.Round(${WIDGET_OUTER_FALLBACK.height}*scale); }
    }
    if(w>0 && z>0) SetWindowPos(h,IntPtr.Zero,0,0,w,z,0x0002|0x0004|0x0010);
    return true;
  } finally { SetThreadDpiAwarenessContext(previous); }
}
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
  const nativeMainCode = `public static class OdakMainBounds {
public delegate bool EnumProc(IntPtr h,IntPtr p);
[StructLayout(LayoutKind.Sequential)] struct R { public int L,T,Rt,B; public int W { get { return Rt-L; } } public int H { get { return B-T; } } }
[StructLayout(LayoutKind.Sequential)] struct P { public int X,Y; }
[StructLayout(LayoutKind.Sequential)] struct Placement { public int Size,Flags,Show; public P Min,Max; public R Normal; }
[StructLayout(LayoutKind.Sequential)] struct Monitor { public int Size; public R Bounds,Work; public int Flags; }
[DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb,IntPtr p);
[DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h,EnumProc cb,IntPtr p);
[DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
[DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder s,int n);
[DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out R r);
[DllImport("user32.dll")] static extern bool GetWindowPlacement(IntPtr h,ref Placement p);
[DllImport("user32.dll")] static extern bool SetWindowPlacement(IntPtr h,ref Placement p);
[DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h,uint flags);
[DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr h,ref Monitor m);
[DllImport("user32.dll",EntryPoint="GetWindowLongW")] static extern uint GetWindowLong(IntPtr h,int n);
[DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr h);
[DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
[DllImport("user32.dll")] static extern bool AdjustWindowRectExForDpi(ref R r,uint style,bool menu,uint exStyle,uint dpi);
[DllImport("user32.dll")] static extern bool AdjustWindowRectEx(ref R r,uint style,bool menu,uint exStyle);
static readonly string[] Titles=new string[]{${mainTitles.map((title) => JSON.stringify(title)).join(",")}};
static readonly Dictionary<IntPtr,bool> Prepared=new Dictionary<IntPtr,bool>();
static string Class(IntPtr h) { var c=new StringBuilder(128); GetClassName(h,c,c.Capacity); return c.ToString(); }
static bool IsMain(IntPtr h) { var t=new StringBuilder(512); GetWindowText(h,t,t.Capacity); return IsWindowVisible(h) && Class(h).StartsWith("Chrome_WidgetWin_") && Array.IndexOf(Titles,t.ToString())>=0; }
public static IntPtr[] Windows(bool mainOnly) { var found=new List<IntPtr>(); EnumWindows(delegate(IntPtr h,IntPtr p) { if(mainOnly?IsMain(h):Class(h).StartsWith("Chrome_WidgetWin_")) found.Add(h); return true; },IntPtr.Zero); return found.ToArray(); }
public static void Forget(IntPtr h) { Prepared.Remove(h); }
// Place each new main HWND once at the recommended size, centered; a screen too
// small for it opens maximized. Windows owns later restores and user resizing.
public static bool Arrange(IntPtr h) {
  if(h==IntPtr.Zero || !IsMain(h)) return false;
  if(Prepared.ContainsKey(h)) return true;
  IntPtr previous=IntPtr.Zero;
  try { previous=SetThreadDpiAwarenessContext(new IntPtr(-4)); if(previous==IntPtr.Zero) previous=SetThreadDpiAwarenessContext(new IntPtr(-3)); } catch(EntryPointNotFoundException) {}
  if(previous==IntPtr.Zero) return false;
  try {
    var placement=new Placement(); placement.Size=Marshal.SizeOf(typeof(Placement));
    var monitor=new Monitor(); monitor.Size=Marshal.SizeOf(typeof(Monitor));
    if(!GetWindowPlacement(h,ref placement) || !GetMonitorInfo(MonitorFromWindow(h,2),ref monitor) || monitor.Work.W<=0 || monitor.Work.H<=0) return false;
    uint dpi=96; try { dpi=GetDpiForWindow(h); } catch(EntryPointNotFoundException) {} if(dpi==0) dpi=96;
    int targetWidth=(int)Math.Round(${MAIN_VIEWPORT.width}*dpi/96.0),targetHeight=(int)Math.Round(${MAIN_VIEWPORT.height}*dpi/96.0);
    int width=targetWidth,height=targetHeight;
    uint ex=GetWindowLong(h,-20),style=GetWindowLong(h,-16)&~0x21000000u;
    R frame=new R(); frame.Rt=width; frame.B=height;
    bool adjusted; try { adjusted=AdjustWindowRectExForDpi(ref frame,style,false,ex,dpi); } catch(EntryPointNotFoundException) { adjusted=AdjustWindowRectEx(ref frame,style,false,ex); }
    if(adjusted) { width=frame.W; height=frame.H; }
    R outer;
    if(GetWindowRect(h,out outer)) {
      R view=new R(); EnumChildWindows(h,delegate(IntPtr child,IntPtr p) { R r; if(IsWindowVisible(child) && Class(child)=="Chrome_RenderWidgetHostHWND" && GetWindowRect(child,out r) && r.W>0 && r.H>0 && r.L>=outer.L && r.T>=outer.T && r.Rt<=outer.Rt && r.B<=outer.B && (long)r.W*r.H>(long)view.W*view.H) view=r; return true; },IntPtr.Zero);
      if(view.W>0 && view.H>0) { width=targetWidth+outer.W-view.W; height=targetHeight+outer.H-view.H; }
    }
    int frameWidth=Math.Max(0,width-targetWidth),frameHeight=Math.Max(0,height-targetHeight);
    // Clamp each side on its own: a short screen keeps the full recommended
    // width, so the restored window still gets the wide desktop layout.
    int fitWidth=Math.Min(targetWidth,Math.Max(1,monitor.Work.W-frameWidth)),fitHeight=Math.Min(targetHeight,Math.Max(1,monitor.Work.H-frameHeight));
    bool fits=fitWidth==targetWidth && fitHeight==targetHeight;
    width=Math.Min(monitor.Work.W,fitWidth+frameWidth); height=Math.Min(monitor.Work.H,fitHeight+frameHeight);
    int left=monitor.Work.L+(monitor.Work.W-width)/2,top=monitor.Work.T+(monitor.Work.H-height)/2;
    // WINDOWPLACEMENT uses workspace coordinates except for tool windows.
    if((ex&0x80)==0) { left-=monitor.Work.L-monitor.Bounds.L; top-=monitor.Work.T-monitor.Bounds.T; }
    placement.Normal.L=left; placement.Normal.T=top; placement.Normal.Rt=left+width; placement.Normal.B=top+height;
    // The restore rectangle is stored either way, including for already maximized HWNDs.
    placement.Flags=0; placement.Show=fits?1:3;
    if(!SetWindowPlacement(h,ref placement)) return false;
    Prepared[h]=true; return true;
  } finally { SetThreadDpiAwarenessContext(previous); }
}
}`;
  return { widget: nativeWidgetCode, main: nativeMainCode };
}

/** One session-local helper handles new ODAK windows from either role. */
export function windowHelperSource() {
  const types = nativeWindowTypes();
  const native = `using System; using System.Collections.Generic; using System.Text; using System.Runtime.InteropServices;\n${types.widget}\n${types.main}\n${taskbarIdentityType()}`;
  return `$ErrorActionPreference='Stop'
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$prefix='Local\\ODAK.WindowSizing.'+$sid
$failure=Join-Path ([IO.Path]::GetTempPath()) ('ODAK-Pencere.'+$sid+'.error.txt')
$worker=[Threading.Mutex]::new($false,$prefix+'.Worker')
$launch=[Threading.Mutex]::new($false,$prefix+'.Launch')
$ready=[Threading.EventWaitHandle]::new($false,[Threading.EventResetMode]::ManualReset,$prefix+'.Ready')
$pinReady=[Threading.EventWaitHandle]::new($false,[Threading.EventResetMode]::ManualReset,$prefix+'.PinReady')
$wake=[Threading.EventWaitHandle]::new($false,[Threading.EventResetMode]::AutoReset,$prefix+'.Wake')
$owned=$false
$exitLock=$false
try {
  try { $owned=$worker.WaitOne(0) } catch [Threading.AbandonedMutexException] { $owned=$true }
  if (!$owned) { return }
  $ready.Reset()
  $pinReady.Reset()
  Add-Type -TypeDefinition @'
${native}
'@
  # Taskbar identity: pinning an ODAK window pins its own launcher, not Chrome.
  $identity=@{}
  $folder=$PSScriptRoot
  if ($folder) {
    $command=Join-Path $env:SystemRoot 'System32\\cmd.exe'
    foreach ($role in @(@{ Key='main'; Id='${TASKBAR_IDS.main}'; File='ODAK.cmd'; Icon='ODAK.ico'; Name='ODAK' },@{ Key='widget'; Id='${TASKBAR_IDS.widget}'; File='ODAK-Widget.cmd'; Icon='ODAK-Widget.ico'; Name='ODAK Widget' })) {
      $file=Join-Path $folder $role.File
      $icon=Join-Path $folder $role.Icon
      if (!(Test-Path -LiteralPath $icon -PathType Leaf)) { $icon=Join-Path $folder 'ODAK.ico' }
      if (Test-Path -LiteralPath $file -PathType Leaf) { $identity[$role.Key]=@{ Id=$role.Id; Command=([char]34+$command+[char]34+' /d /s /c '+[char]34+[char]34+$file+[char]34+[char]34); Name=$role.Name; Icon=($icon+',0') } }
    }
  }
  $seen=[Collections.Generic.HashSet[IntPtr]]::new()
  foreach ($h in @([OdakMainBounds]::Windows($false))) { [void]$seen.Add($h) }
  $settling=@{}
  $clock=[Diagnostics.Stopwatch]::StartNew()
  $lastSeen=$clock.ElapsedMilliseconds
  $idleGrace=30000
  $pinReady.Set()
  $ready.Set()
  while ($true) {
    $now=$clock.ElapsedMilliseconds
    if ($wake.WaitOne(0)) { $lastSeen=$now; $idleGrace=30000 }
    $alive=[Collections.Generic.HashSet[IntPtr]]::new()
    foreach ($h in @([OdakMainBounds]::Windows($false))) { [void]$alive.Add($h) }
    foreach ($h in @($seen)) { if (!$alive.Contains($h)) { [void]$seen.Remove($h); $settling.Remove($h); [OdakMainBounds]::Forget($h); [OdakWidgetBounds]::Forget($h); [OdakWidgetBounds]::ForgetPin($h); [OdakTaskbar]::Forget($h) } }
    [OdakWidgetBounds]::ReleasePins()
    $mains=@([OdakMainBounds]::Windows($true))
    $widgets=@([OdakWidgetBounds]::Windows($true))
    if ($mains.Count+$widgets.Count -gt 0) { $lastSeen=$now; $idleGrace=5000 }
    foreach ($h in $mains) {
      if ($identity.main) { [void][OdakTaskbar]::Tag($h,$identity.main.Id,$identity.main.Command,$identity.main.Name,$identity.main.Icon) }
      if ($seen.Add($h)) { $settling[$h]=@{ Role='main'; Until=$now+2500 } }
    }
    foreach ($h in $widgets) {
      [OdakWidgetBounds]::SyncPin($h)
      if ($identity.widget) { [void][OdakTaskbar]::Tag($h,$identity.widget.Id,$identity.widget.Command,$identity.widget.Name,$identity.widget.Icon) }
      if ($seen.Add($h)) { $settling[$h]=@{ Role='widget'; Until=$now+2500 } }
    }
    foreach ($h in @($settling.Keys)) {
      $entry=$settling[$h]
      if (!$alive.Contains($h)) { $settling.Remove($h); [OdakMainBounds]::Forget($h); [OdakWidgetBounds]::Forget($h); continue }
      if ($entry.Role -eq 'widget') {
        if ([OdakWidgetBounds]::Fit($h,$now,($now -ge $entry.Until))) { $settling.Remove($h); [OdakWidgetBounds]::Forget($h) }
      } elseif ([OdakMainBounds]::Arrange($h) -or $now -ge $entry.Until) { $settling.Remove($h) }
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
} catch {
  try { [IO.File]::WriteAllText($failure,($Error | Out-String)) } catch {}
  throw
} finally {
  if ($owned) { $ready.Reset(); $pinReady.Reset(); $worker.ReleaseMutex() }
  if ($exitLock) { $launch.ReleaseMutex() }
  $worker.Dispose()
  $launch.Dispose()
  $ready.Dispose()
  $pinReady.Dispose()
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
    "$helper=Join-Path ([IO.Path]::GetDirectoryName($html)) 'ODAK-Pencere.ps1'",
    "$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
    "$prefix='Local\\ODAK.WindowSizing.'+$sid",
    "$failure=Join-Path ([IO.Path]::GetTempPath()) ('ODAK-Pencere.'+$sid+'.error.txt')",
    "$launch=[Threading.Mutex]::new($false,$prefix+'.Launch')",
    "$ready=$null; $pinReady=$null; $wake=$null; $launchOwned=$false; $sizingReady=$false; $sizingError='Pencere yardimcisi baslatma kilidi alinamadi.'",
    "try { try { $launchOwned=$launch.WaitOne(10000) } catch [Threading.AbandonedMutexException] { $launchOwned=$true }; if ($launchOwned) { try { if (!(Test-Path -LiteralPath $helper -PathType Leaf)) { throw 'ODAK-Pencere.ps1 bulunamadi. Dosyayi TAKIP.html ile ayni klasorde tutun.' }; [IO.File]::Delete($failure); $ready=[Threading.EventWaitHandle]::new($false,[Threading.EventResetMode]::ManualReset,$prefix+'.Ready'); $pinReady=[Threading.EventWaitHandle]::new($false,[Threading.EventResetMode]::ManualReset,$prefix+'.PinReady'); $wake=[Threading.EventWaitHandle]::new($false,[Threading.EventResetMode]::AutoReset,$prefix+'.Wake'); $wake.Set() | Out-Null; Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -WindowStyle Hidden -ArgumentList @('-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',([char]34+$helper+[char]34)); $sizingReady=$ready.WaitOne(10000); if (!$sizingReady) { if (Test-Path -LiteralPath $failure -PathType Leaf) { throw ([IO.File]::ReadAllText($failure)) }; throw 'Pencere yardimcisi 10 saniye icinde hazir olmadi.' } } catch { $sizingReady=$false; $sizingError=$_.Exception.Message } }; if ($sizingReady) { $url+='?windowSizing=native'; if ($pinReady -and $pinReady.WaitOne(0)) { $url+='&windowPin=native' } }; $arguments=@(('--app='+[char]34+$url+[char]34)); Start-Process -FilePath $chrome -ArgumentList $arguments } finally { if ($ready) { $ready.Dispose() }; if ($pinReady) { $pinReady.Dispose() }; if ($wake) { $wake.Dispose() }; if ($launchOwned) { $launch.ReleaseMutex() }; $launch.Dispose() }",
    "if (!$sizingReady) { Write-Host 'ODAK acildi; otomatik pencere boyutu uygulanamadi.'; Write-Host $sizingError; pause }",
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
