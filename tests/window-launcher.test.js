import test from "node:test";
import assert from "node:assert/strict";
import {
  createWindowsLauncher,
  windowHelperSource,
} from "../scripts/window-launcher.js";

const helper = windowHelperSource();

test("both launchers keep window geometry out of Chrome's process-wide arguments", () => {
  for (const role of ["desktop", "widget"]) {
    const launcher = createWindowsLauncher(role);
    assert(launcher.includes(`AbsoluteUri+'#${role}'`));
    assert(
      launcher.includes("$arguments=@(('--app='+[char]34+$url+[char]34))"),
    );
    assert.doesNotMatch(
      launcher,
      /--(?:start-maximized|window-size|window-position)/i,
    );
    assert(launcher.includes("$sizingReady=$ready.WaitOne(10000)"));
    const wait = launcher.indexOf("$sizingReady=$ready.WaitOne(10000)");
    const ownership = launcher.indexOf(
      "if ($sizingReady) { $url+='?windowSizing=native';",
    );
    const argumentsReady = launcher.indexOf("$arguments=@(");
    const open = launcher.indexOf("Start-Process -FilePath $chrome");
    assert(
      wait < ownership && ownership < argumentsReady && argumentsReady < open,
      "only a ready native helper takes ownership before app arguments are built",
    );
    assert(
      launcher.includes(
        "Start-Process -FilePath $chrome -ArgumentList $arguments",
      ),
    );
  }
  assert.throws(() => createWindowsLauncher("anything-else"));
});

test("generated launch commands preserve path quoting and stay within Windows command limits", () => {
  for (const role of ["desktop", "widget"]) {
    const launcher = createWindowsLauncher(role);
    assert(launcher.includes("setlocal DisableDelayedExpansion\r\n"));
    assert(launcher.includes('set "ODAK_HTML=%~dp0TAKIP.html"\r\n'));
    assert(launcher.includes("[IO.Path]::GetFullPath($env:ODAK_HTML)"));
    assert(launcher.includes("([Uri]$html).AbsoluteUri"));
    const lines = launcher.split("\r\n");
    assert(lines.every((line) => line.length < 8191));
    const command = lines.find((line) => line.startsWith("powershell.exe "));
    assert.equal(
      command.split('"').length,
      3,
      "one quoted command, no embedded CMD quotes",
    );
    assert.equal(launcher.replaceAll("\r\n", "").includes("\n"), false);
  }
  for (const role of ["desktop", "widget"]) {
    const launcher = createWindowsLauncher(role);
    assert(
      launcher.includes(
        "-ArgumentList @('-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',([char]34+$helper+[char]34))",
      ),
      "the sibling helper file runs directly, so its size is not bound by the command line",
    );
    assert.equal(launcher.includes("-EncodedCommand"), false);
  }
});

test("native helper only settles newly identified ODAK roles and releases later manual resizing", () => {
  // Structural native-boundary checks; these do not execute Windows PowerShell.
  const compile = helper.indexOf("Add-Type -TypeDefinition");
  const baseline = helper.indexOf(
    "$seen=[Collections.Generic.HashSet[IntPtr]]::new()",
  );
  const ready = helper.indexOf("$ready.Set()");
  assert(compile >= 0 && compile < baseline && baseline < ready);
  assert(helper.includes("[OdakMainBounds]::Windows($false)"));
  assert(
    helper.includes(
      "if ($seen.Add($h)) { $settling[$h]=@{ Role='main'; Until=$now+2500 } }",
    ),
  );
  assert(
    helper.includes(
      "if ($seen.Add($h)) { $settling[$h]=@{ Role='widget'; Until=$now+2500 } }",
    ),
  );
  assert(helper.includes("$now -ge $entry.Until"));
  assert(
    helper.includes(
      "if ([OdakWidgetBounds]::Fit($h,$now,($now -ge $entry.Until))) { $settling.Remove($h); [OdakWidgetBounds]::Forget($h) }",
    ),
    "completed widget sizing is removed instead of corrected again on the next poll",
  );
  assert(
    helper.includes(
      "if (!$alive.Contains($h)) { $settling.Remove($h); [OdakMainBounds]::Forget($h); [OdakWidgetBounds]::Forget($h); continue }",
    ),
  );
  assert(
    helper.includes(
      "[void]$seen.Remove($h); $settling.Remove($h); [OdakMainBounds]::Forget($h); [OdakWidgetBounds]::Forget($h); [OdakWidgetBounds]::ForgetPin($h)",
    ),
    "closed HWND state cannot leak into a later window reusing the handle",
  );
  assert(
    helper.includes(
      'return title=="ODAK · Özet" || title=="ODAK · Özet · Üstte";',
    ),
    "both widget titles retain the same native sizing role",
  );
  const titles = JSON.parse(
    `[${helper.match(/static readonly string\[\] Titles=new string\[\]\{([^}]+)\};/)[1]}]`,
  );
  for (const title of [
    "Dashboard · Odak",
    "Genel bakış · Odak",
    "Toplantı aksiyon · Odak",
    "Toplantı aksiyonları · Odak",
  ]) {
    assert(
      titles.includes(title),
      `new and legacy main title remains recognized: ${title}`,
    );
  }
  assert.equal(
    titles.includes("ODAK · Özet"),
    false,
    "widget stays a separate native window role",
  );
  assert.equal(titles.includes("ODAK · Özet · Üstte"), false);
  assert(helper.includes("Array.IndexOf(Titles,t.ToString())>=0"));
  assert(
    helper.includes("if(Prepared.ContainsKey(h)) return true;"),
    "each main HWND is prepared once; later restores and resizing stay manual",
  );
  assert(
    helper.includes(
      "} elseif ([OdakMainBounds]::Arrange($h) -or $now -ge $entry.Until) { $settling.Remove($h) }",
    ),
  );
  assert(helper.includes('Class(h).StartsWith("Chrome_WidgetWin_")'));
  assert(helper.includes("if(h==IntPtr.Zero || !Widget(h)) return true"));
});

test("native main windows open normal at the recommended size and maximize only when it does not fit", () => {
  const arrange = helper.slice(
    helper.indexOf("public static bool Arrange(IntPtr h)"),
  );
  assert(
    arrange.includes(
      "int targetWidth=(int)Math.Round(1440*dpi/96.0),targetHeight=(int)Math.Round(900*dpi/96.0);",
    ),
  );
  assert(arrange.includes("placement.Flags=0; placement.Show=fits?1:3;"));
  // Width and height are clamped separately: a short screen keeps 1440 wide.
  assert(
    arrange.includes(
      "int fitWidth=Math.Min(targetWidth,Math.Max(1,monitor.Work.W-frameWidth)),fitHeight=Math.Min(targetHeight,Math.Max(1,monitor.Work.H-frameHeight));",
    ),
  );
  assert.doesNotMatch(arrange, /targetWidth\*fit/);
  assert.doesNotMatch(arrange, /placement\.Show=3;/);
});

test("native widget observes stable bounds before one size change and reserves fallback for the deadline", () => {
  // The Linux suite inspects the generated native boundary, not live Win32 calls.
  const start = helper.indexOf(
    "public static bool Fit(IntPtr h,long now,bool expired)",
  );
  const fit = helper.slice(
    start,
    helper.indexOf("public static class OdakMainBounds"),
  );
  assert(start >= 0);
  assert(fit.includes("if(!PendingWindows.TryGetValue(h,out pending))"));
  assert(
    fit.includes(
      'string sample=dpi+":"+outer.L+":"+outer.T+":"+outer.W+":"+outer.H+":"+view.W+":"+view.H;',
    ),
    "monitor DPI and both outer and renderer bounds must settle together",
  );
  assert(
    fit.includes(
      "if(pending.Sample!=sample) { pending.Sample=sample; pending.StableSince=now; return expired; }",
    ),
  );
  assert(fit.includes("if(now-pending.StableSince<200) return expired;"));
  assert(
    fit.includes(
      "if(!pending.Restored) { pending.Restored=true; pending.Sample=null; ShowWindow(h,9); }",
    ),
    "a minimized or maximized new widget is restored at most once",
  );
  assert(
    fit.includes("Math.Abs(view.W-targetW)<=1 && Math.Abs(view.H-targetH)<=1"),
  );
  assert(fit.includes("w=outer.W+targetW-view.W; z=outer.H+targetH-view.H;"));
  assert.equal((fit.match(/SetWindowPos\(/g) || []).length, 1);
  assert(
    fit.includes(
      "if(w>0 && z>0) SetWindowPos(h,IntPtr.Zero,0,0,w,z,0x0002|0x0004|0x0010);\n    return true;",
    ),
    "one size application completes the operation without moving or activating it",
  );
  const fallbackStart = fit.indexOf("} else {\n      pending.Sample=null;");
  assert(fallbackStart >= 0);
  const fallback = fit.slice(fallbackStart);
  const waitForDeadline = fallback.indexOf("if(!expired) return false;");
  assert(
    waitForDeadline >= 0 &&
      waitForDeadline <
        fallback.indexOf("if(outer.W>500*scale || outer.H>600*scale)"),
    "renderer absence cannot cause an early fallback followed by another correction",
  );
  assert(fit.includes("finally { SetThreadDpiAwarenessContext(previous); }"));
});

test("native pinning changes only widget z-order once per requested state transition", () => {
  // Native calls are inspected here; this suite does not run on Windows.
  const start = helper.indexOf("public static void SyncPin(IntPtr h)");
  const pin = helper.slice(start, helper.indexOf("static bool Renderer("));
  assert(start >= 0);
  assert(
    pin.includes(
      'if(h==IntPtr.Zero || !IsWindowVisible(h) || !Class(h).StartsWith("Chrome_WidgetWin_")) return;',
    ),
  );
  assert(
    pin.includes("string title=Title(h); if(!WidgetTitle(title)) return;"),
  );
  assert(
    pin.includes(
      'bool requested=title=="ODAK · Özet · Üstte",previous; if(!PinStates.TryGetValue(h,out previous)) previous=false;',
    ),
    "the base title starts unpinned without a native operation",
  );
  const transition = pin.indexOf(
    "PinStates[h]=requested; if(previous==requested) return;",
  );
  const apply = pin.indexOf(
    "SetWindowPos(h,new IntPtr(requested?-1:-2),0,0,0,0,0x0001|0x0002|0x0010);",
  );
  assert(transition >= 0 && apply > transition);
  assert.equal((pin.match(/SetWindowPos\(/g) || []).length, 1);
  assert.doesNotMatch(pin, /ShowWindow|PendingWindows|resize|Maximize|Arrange/);
  assert(
    helper.includes(
      "foreach ($h in $widgets) {\n      [OdakWidgetBounds]::SyncPin($h)",
    ),
    "pin changes remain available after startup fitting has finished",
  );
  const forget = helper.slice(
    helper.indexOf("public static void Forget(IntPtr h)"),
    helper.indexOf("public static bool Fit("),
  );
  assert.doesNotMatch(forget, /PinStates/);
});

test("pin capability is advertised only by a ready helper that supports it", () => {
  const owned = helper.indexOf("if (!$owned) { return }");
  assert(owned < helper.indexOf("$pinReady.Reset()"));
  assert(helper.indexOf("$pinReady.Set()") < helper.indexOf("$ready.Set()"));
  assert(
    helper.includes(
      "if ($owned) { $ready.Reset(); $pinReady.Reset(); $worker.ReleaseMutex() }",
    ),
    "a losing helper instance cannot reset another worker's readiness",
  );
  assert(helper.includes("$pinReady.Dispose()"));
  for (const role of ["desktop", "widget"]) {
    const launcher = createWindowsLauncher(role);
    assert(
      launcher.includes(
        "$pinReady=[Threading.EventWaitHandle]::new($false,[Threading.EventResetMode]::ManualReset,$prefix+'.PinReady')",
      ),
    );
    assert(
      launcher.includes(
        "if ($sizingReady) { $url+='?windowSizing=native'; if ($pinReady -and $pinReady.WaitOne(0)) { $url+='&windowPin=native' } }",
      ),
      "an older sizing-only worker leaves pinning unavailable",
    );
    assert(launcher.includes("if ($pinReady) { $pinReady.Dispose() }"));
  }
});

test("native pin ownership is released when a live window leaves the widget role", () => {
  const start = helper.indexOf("public static void ReleasePins()");
  const release = helper.slice(
    start,
    helper.indexOf("public static void SyncPin("),
  );
  assert(start >= 0);
  assert(
    release.includes("foreach(IntPtr h in new List<IntPtr>(PinStates.Keys))"),
    "only windows previously observed by pin handling are inspected",
  );
  const previouslyPinned = release.indexOf("if(!PinStates[h]) continue;");
  const destroyed = release.indexOf(
    "if(!IsWindow(h)) { PinStates.Remove(h); continue; }",
  );
  const stillWidget = release.indexOf("if(Widget(h)) continue;");
  const unpin = release.indexOf(
    "SetWindowPos(h,new IntPtr(-2),0,0,0,0,0x0001|0x0002|0x0010);",
  );
  assert(
    previouslyPinned >= 0 &&
      previouslyPinned < destroyed &&
      destroyed < stillWidget &&
      stillWidget < unpin,
    "destroyed windows and unowned pin states never receive native calls",
  );
  assert(unpin < release.lastIndexOf("PinStates.Remove(h);"));
  assert.equal((release.match(/SetWindowPos\(/g) || []).length, 1);
  assert.doesNotMatch(
    release,
    /ShowWindow|PendingWindows|Maximize|Arrange|new IntPtr\(-1\)/,
  );
  const sweep = helper.indexOf("[OdakWidgetBounds]::ReleasePins()");
  assert(
    helper.indexOf("while ($true)") < sweep &&
      sweep < helper.indexOf("$mains=@([OdakMainBounds]::Windows($true))"),
    "role loss is checked every loop even after a HWND leaves the widget list",
  );
});

test("helper startup and idle shutdown share a per-user lock without changing Chrome or record storage", () => {
  assert(helper.includes("$prefix='Local\\ODAK.WindowSizing.'+$sid"));
  assert(helper.includes("$owned=$worker.WaitOne(0)"));
  assert(helper.includes("if (!$owned) { return }"));
  assert(helper.includes("$idleGrace=30000"));
  assert(helper.includes("$idleGrace=5000"));
  assert(helper.includes("$exitLock=$launch.WaitOne(0)"));
  assert(helper.includes("else { $ready.Reset(); break }"));
  const finalizer = helper.slice(helper.lastIndexOf("} finally {"));
  assert(
    finalizer.indexOf("$worker.ReleaseMutex()") <
      finalizer.indexOf("$launch.ReleaseMutex()"),
  );
  for (const source of [
    helper,
    createWindowsLauncher("desktop"),
    createWindowsLauncher("widget"),
  ]) {
    assert.doesNotMatch(
      source,
      /--(?:user-data-dir|profile-directory|remote-debugging)|Set-ExecutionPolicy|Stop-Process|taskkill|Set-ItemProperty|is-takip-v1/i,
    );
    // Bypass is allowed only as a per-process argument for the sibling helper.
    assert.equal(
      source.match(/ExecutionPolicy/gi)?.length ?? 0,
      source === helper ? 0 : 1,
    );
  }
});

test("missing sizing helper keeps app access available and reports the required sibling file", () => {
  const launcher = createWindowsLauncher("desktop");
  assert(launcher.includes("'ODAK-Pencere.ps1'"));
  assert(
    launcher.includes(
      "catch { $sizingReady=$false; $sizingError=$_.Exception.Message }",
    ),
  );
  assert(launcher.includes("ODAK-Pencere.ps1 bulunamadi."));
  assert(launcher.includes("Write-Host $sizingError; pause"));
  const open = launcher.indexOf("Start-Process -FilePath $chrome");
  const warning = launcher.indexOf(
    "if (!$sizingReady) { Write-Host 'ODAK acildi;",
  );
  assert(
    open >= 0 && warning > open,
    "app launch precedes the nonfatal sizing warning",
  );
  assert(launcher.includes("-WindowStyle Hidden"));
  assert(launcher.includes("'-File'"));
});
