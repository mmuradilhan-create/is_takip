import { TASKBAR_IDS, taskbarIdentityType } from "./taskbar-identity.js";

/** Per-user shortcuts reuse the packaged launchers and their existing Chrome data. */
export function createWindowsShortcutSetup() {
  return (
    "\ufeff" +
    String.raw`[CmdletBinding()]
param([switch]$WithoutWidget)

$ErrorActionPreference = 'Stop'
$shell = $null
try {
  $folder = $PSScriptRoot
  $icon = Join-Path $folder 'ODAK.ico'
  $launcher = Join-Path $folder 'ODAK.cmd'
  foreach ($file in @($icon, $launcher, (Join-Path $folder 'TAKIP.html'))) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
      throw ('Paket dosyası bulunamadı: ' + [IO.Path]::GetFileName($file) + '. ZIP içindeki tüm dosyaları aynı klasöre çıkarın.')
    }
  }

  # Special folders follow Windows redirection, including a OneDrive Desktop.
  $desktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
  $programs = [Environment]::GetFolderPath([Environment+SpecialFolder]::Programs)
  if (!$desktop -or !$programs) {
    throw 'Masaüstü veya Başlat menüsü klasörü bulunamadı.'
  }
  $startMenu = Join-Path $programs 'ODAK'
  foreach ($destination in @($desktop, $startMenu)) {
    [void][IO.Directory]::CreateDirectory($destination)
  }

  # The shortcut and ODAK's own window share an AppUserModelID, so the taskbar
  # shows one ODAK button instead of a Chrome button.
  Add-Type -TypeDefinition @'
using System; using System.Collections.Generic; using System.Runtime.InteropServices;
${taskbarIdentityType()}
'@
  $identityFailed = $false
  $command = Join-Path $env:SystemRoot 'System32\cmd.exe'
  $shell = New-Object -ComObject WScript.Shell
  $entries = @(@{ Name = 'ODAK'; File = $launcher; Icon = $icon; Description = 'ODAK · İş ve hedef takibi'; AppId = '${TASKBAR_IDS.main}' })
  $widgetLauncher = Join-Path $folder 'ODAK-Widget.cmd'
  if (!$WithoutWidget -and (Test-Path -LiteralPath $widgetLauncher -PathType Leaf)) {
    $widgetIcon = Join-Path $folder 'ODAK-Widget.ico'
    if (!(Test-Path -LiteralPath $widgetIcon -PathType Leaf)) { $widgetIcon = $icon }
    $entries += @{ Name = 'ODAK Widget'; File = $widgetLauncher; Icon = $widgetIcon; Description = 'ODAK · Küçük özet penceresi'; AppId = '${TASKBAR_IDS.widget}' }
  }

  foreach ($entry in $entries) {
    foreach ($destination in @($desktop, $startMenu)) {
      $path = Join-Path $destination ($entry.Name + '.lnk')
      $shortcut = $shell.CreateShortcut($path)
      try {
        # An executable target allows the Windows shell to offer manual pinning.
        # The existing CMD still chooses Chrome and starts the window helper.
        $shortcut.TargetPath = $command
        $shortcut.Arguments = '/d /s /c ""' + $entry.File + '""'
        $shortcut.WorkingDirectory = $folder
        $shortcut.IconLocation = $entry.Icon + ',0'
        $shortcut.Description = $entry.Description
        $shortcut.WindowStyle = 1
        $shortcut.Save()
      } finally {
        if ($shortcut) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shortcut) }
      }
      try { [OdakTaskbar]::TagShortcut($path, $entry.AppId) } catch { $identityFailed = $true }
    }
  }

  $message = @'
ODAK kısayolları masaüstüne ve Başlat menüsüne eklendi.

Açmak için masaüstündeki ODAK simgesine çift tıklayın.

Görev çubuğuna sabitlemek için ODAK açıkken görev çubuğundaki ODAK simgesine sağ tıklayıp "Görev çubuğuna sabitle"yi seçin. Sabitlenen simge ODAK'ı yeniden açar.

Daha önce ODAK'ı sabitlerken Chrome simgesi sabitlendiyse o simgeye sağ tıklayıp "Görev çubuğundan kaldır"ı seçin ve ODAK'ı yeniden sabitleyin.

Kısayollar bu paket klasörünü kullanır. Klasörü taşır veya yeniden adlandırırsanız bu kurulumu tekrar çalıştırın.
'@
  if ($identityFailed) {
    $message += [Environment]::NewLine + [Environment]::NewLine + 'Not: Kısayollara görev çubuğu kimliği yazılamadı. Kısayollar çalışır; açık ODAK penceresinden sabitleme yine kullanılabilir.'
  }
  [void]$shell.Popup($message, 0, 'ODAK · Kısayollar hazır', 64)
} catch {
  $message = 'Kısayollar oluşturulamadı.' + [Environment]::NewLine + [Environment]::NewLine + $_.Exception.Message
  if (!$shell) { $shell = New-Object -ComObject WScript.Shell }
  [void]$shell.Popup($message, 0, 'ODAK', 16)
  exit 1
} finally {
  if ($shell) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) }
}
`
  );
}

/** Keep the entry point ASCII; Windows PowerShell reads the BOM in the PS1. */
export function createWindowsShortcutSetupLauncher() {
  return [
    "@echo off",
    "setlocal DisableDelayedExpansion",
    'if not exist "%~dp0ODAK-Kisayol-Kur.ps1" (',
    "  echo ODAK-Kisayol-Kur.ps1 bulunamadi. Tum paket dosyalarini ayni klasore cikarin.",
    "  pause",
    "  exit /b 1",
    ")",
    'powershell.exe -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0ODAK-Kisayol-Kur.ps1" %*',
    "if errorlevel 1 (",
    "  echo Kisayol kurulumu tamamlanamadi.",
    "  pause",
    "  exit /b 1",
    ")",
    "endlocal",
    "",
  ].join("\r\n");
}
