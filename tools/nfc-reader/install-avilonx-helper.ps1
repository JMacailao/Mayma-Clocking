<#
  Installs the AvilonX ACR122U helper on this Windows computer:
  - copies it to %LOCALAPPDATA%\AvilonX
  - starts it automatically (minimized) every time you sign in to Windows
  - adds "AvilonX ACR122U" to the Desktop and Start menu
  - starts it now
  Run "Install AvilonX ACR122U helper.cmd" (next to this file). Nothing else to set up.
  To remove it, run "Uninstall AvilonX ACR122U helper.cmd".
#>
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'acr122u-avilonx.ps1'
if (-not (Test-Path $source)) { Write-Host 'acr122u-avilonx.ps1 was not found next to the installer. Unzip the whole folder first.' -ForegroundColor Red; Read-Host 'Press Enter to close'; exit 1 }

$target = Join-Path $env:LOCALAPPDATA 'AvilonX'
New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item $source (Join-Path $target 'acr122u-avilonx.ps1') -Force

# Stop a helper that is already running, so the new copy can use the port.
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'acr122u-avilonx\.ps1' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File "' + (Join-Path $target 'acr122u-avilonx.ps1') + '"'
$shell = New-Object -ComObject WScript.Shell
$places = @(
  [Environment]::GetFolderPath('Startup'),
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('Programs')
)
foreach ($folder in $places) {
  $link = $shell.CreateShortcut((Join-Path $folder 'AvilonX ACR122U.lnk'))
  $link.TargetPath = $powershell
  $link.Arguments = $arguments
  $link.WorkingDirectory = $target
  $link.WindowStyle = 7   # minimized
  $link.Description = 'AvilonX: hands ACR122U taps to the AvilonX page'
  $link.Save()
}

Start-Process -FilePath $powershell -ArgumentList $arguments -WindowStyle Minimized
Write-Host ''
Write-Host 'AvilonX ACR122U helper installed.' -ForegroundColor Green
Write-Host 'It is running now (minimized on the taskbar) and starts by itself when you sign in to Windows.'
Write-Host 'In AvilonX choose "Wired" as the reader, then tap tags.'
Write-Host ''
Read-Host 'Press Enter to close'
