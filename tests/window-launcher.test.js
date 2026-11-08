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
  const encoded = Buffer.from(helper, "utf16le").toString("base64");
  assert(
    encoded.length < 30000,
    "leave room for powershell.exe arguments below 32767",
  );
  assert.equal(Buffer.from(encoded, "base64").toString("utf16le"), helper);
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
  assert(helper.includes("$settling.Remove($h); continue"));
  assert(helper.includes('t.ToString()=="ODAK · Özet"'));
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
  assert(
    helper.includes("Array.IndexOf(Titles,t.ToString())>=0 && !IsZoomed(h)"),
  );
  assert(helper.includes('Class(h).StartsWith("Chrome_WidgetWin_")'));
  assert(helper.includes("if(h==IntPtr.Zero || !Widget(h)) return"));
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
      /--(?:user-data-dir|profile-directory|remote-debugging)|ExecutionPolicy|Stop-Process|taskkill|Set-ItemProperty|is-takip-v1/i,
    );
  }
});

test("missing sizing helper keeps app access available and reports the required sibling file", () => {
  const launcher = createWindowsLauncher("desktop");
  assert(launcher.includes("'ODAK-Pencere.ps1'"));
  assert(launcher.includes("catch { $sizingReady=$false }"));
  const open = launcher.indexOf("Start-Process -FilePath $chrome");
  const warning = launcher.indexOf(
    "if (!$sizingReady) { Write-Host 'ODAK acildi;",
  );
  assert(
    open >= 0 && warning > open,
    "app launch precedes the nonfatal sizing warning",
  );
  assert(launcher.includes("-WindowStyle Hidden"));
  assert(launcher.includes("-EncodedCommand"));
});
