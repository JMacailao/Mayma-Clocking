# Removes the AvilonX ACR122U helper installed by install-avilonx-helper.ps1.
$ErrorActionPreference = 'Continue'
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'acr122u-avilonx\.ps1' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
foreach ($folder in @([Environment]::GetFolderPath('Startup'), [Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  Remove-Item (Join-Path $folder 'AvilonX ACR122U.lnk') -ErrorAction SilentlyContinue
}
Remove-Item (Join-Path $env:LOCALAPPDATA 'AvilonX\acr122u-avilonx.ps1') -ErrorAction SilentlyContinue
Write-Host 'AvilonX ACR122U helper removed.' -ForegroundColor Green
Read-Host 'Press Enter to close'
