import test from "node:test";
import assert from "node:assert/strict";
import {
  TASKBAR_IDS,
  taskbarIdentityType,
} from "../scripts/taskbar-identity.js";
import { windowHelperSource } from "../scripts/window-launcher.js";
import { createWindowsShortcutSetup } from "../scripts/windows-shortcuts.js";

const helper = windowHelperSource();
const shortcuts = createWindowsShortcutSetup();
const native = taskbarIdentityType();

test("main and widget windows get separate valid AppUserModelIDs", () => {
  assert.notEqual(TASKBAR_IDS.main, TASKBAR_IDS.widget);
  for (const id of Object.values(TASKBAR_IDS)) {
    assert.match(id, /^[A-Za-z0-9]+(\.[A-Za-z0-9]+){1,3}$/);
    assert(id.length <= 128);
  }
});

test("the native type stays within the C# 5 compiler of Windows PowerShell", () => {
  // Windows PowerShell 5.1 compiles Add-Type with C# 5.
  assert.doesNotMatch(native, /=>|\$"|\?\.|\bout var\b|\bnameof\(/);
  assert(native.includes("SHGetPropertyStoreForWindow"));
  assert(native.includes("SHGetPropertyStoreFromParsingName"));
  // PKEY_AppUserModel_* share one format ID; property IDs follow propkey.h.
  assert(native.includes('new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3")'));
  assert(
    native.includes(
      "Set(store,5,appId); Set(store,3,icon); Set(store,2,command); Set(store,4,name); store.Commit();",
    ),
    "ID, relaunch icon, command and display name are written together",
  );
  assert(native.includes("value.Type=31;"), "strings are VT_LPWSTR values");
  assert(native.includes("Marshal.FreeCoTaskMem(value.Text)"));
});

test("window tagging never blocks sizing and is repeated only for new HWNDs", () => {
  const tag = native.slice(native.indexOf("public static bool Tag("));
  assert(
    tag.includes("if(h==IntPtr.Zero || Tagged.Contains(h)) return false;"),
  );
  assert(tag.includes("} catch { return false; }"));
  assert(helper.includes(taskbarIdentityType()));
  assert(
    helper.includes(
      "[OdakWidgetBounds]::ForgetPin($h); [OdakTaskbar]::Forget($h) } }",
    ),
    "a closed HWND can be tagged again if Windows reuses its handle",
  );
});

test("each running window role relaunches its own packaged launcher", () => {
  assert(helper.includes("$folder=$PSScriptRoot"));
  assert(
    helper.includes(
      `@{ Key='main'; Id='${TASKBAR_IDS.main}'; File='ODAK.cmd'; Icon='ODAK.ico'; Name='ODAK' }`,
    ),
  );
  assert(
    helper.includes(
      `@{ Key='widget'; Id='${TASKBAR_IDS.widget}'; File='ODAK-Widget.cmd'; Icon='ODAK-Widget.ico'; Name='ODAK Widget' }`,
    ),
  );
  assert(
    helper.includes(
      "Command=([char]34+$command+[char]34+' /d /s /c '+[char]34+[char]34+$file+[char]34+[char]34)",
    ),
    "the pinned button runs the same cmd.exe command as the installed shortcut",
  );
  assert(
    helper.includes(
      "if (Test-Path -LiteralPath $file -PathType Leaf) { $identity[$role.Key]=",
    ),
    "a missing launcher leaves Chrome's default identity in place",
  );
  const mains = helper.slice(helper.indexOf("foreach ($h in $mains) {"));
  assert(
    mains.startsWith(
      "foreach ($h in $mains) {\n      if ($identity.main) { [void][OdakTaskbar]::Tag($h,$identity.main.Id,",
    ),
  );
  const widgets = helper.slice(helper.indexOf("foreach ($h in $widgets) {"));
  assert(
    widgets.includes(
      "if ($identity.widget) { [void][OdakTaskbar]::Tag($h,$identity.widget.Id,",
    ),
  );
});

test("installed shortcuts share the window IDs without failing the setup", () => {
  assert(shortcuts.includes(taskbarIdentityType()));
  assert(shortcuts.includes(`AppId = '${TASKBAR_IDS.main}'`));
  assert(shortcuts.includes(`AppId = '${TASKBAR_IDS.widget}'`));
  const save = shortcuts.indexOf("$shortcut.Save()");
  const release = shortcuts.indexOf("FinalReleaseComObject($shortcut)");
  const tag = shortcuts.indexOf(
    "try { [OdakTaskbar]::TagShortcut($path, $entry.AppId) } catch { $identityFailed = $true }",
  );
  assert(
    save > 0 && release > save && tag > release,
    "the saved and released .lnk receives the ID",
  );
  assert(shortcuts.includes("if ($identityFailed) {"));
  assert(shortcuts.includes('"Görev çubuğuna sabitle"'));
});
