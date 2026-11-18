<#
  AvilonX Clocking - ACS ACR122U as an AvilonX reader (Windows).

  Reads each tag tapped on the ACR122U (or another PC/SC reader) and sends it
  straight to AvilonX over the internet, the same way the ESP8266 reader does.
  Nothing is typed into the browser, so it works whatever window is in front.

  On Race entries (RFID entries), Bird bonding and Show up, choose
  "Wireless" as the reader: taps from this computer appear there.

  First time:
    1. Plug in the ACR122U. Double-click "Start ACR122U for AvilonX.cmd"
       (next to this file). This window shows the computer's Device serial.
    2. The AvilonX Super Admin registers that serial on Register RFID reader
       for your club, Used by: Club admin (registering pigeons), and gives
       you a device key.
    3. Paste the device key into this window and press Enter. It is saved,
       so next time the helper starts straight away.
  Keep this window open while tapping tags. Press Ctrl+C to stop.
  To use another key, delete the file shown at start-up ("Settings file").
#>

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

# AvilonX's Supabase project. The publishable key is public (it is in the web
# app too); the reader proves who it is with its serial and device key.
$SupabaseUrl = 'https://utfxtwgqdbjkbxlooolr.supabase.co'
$SupabaseKey = 'sb_publishable_bUkPWYhRAP0nYd9yL01ObA__PJ3Q4v3'
$Firmware    = 'acr122u-avilonx-2026.11'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class AvilonXPcsc {
  [StructLayout(LayoutKind.Sequential)]
  public struct IoRequest { public uint Protocol; public uint PciLength; }

  [DllImport("winscard.dll")] static extern int SCardEstablishContext(uint scope, IntPtr r1, IntPtr r2, out IntPtr context);
  [DllImport("winscard.dll")] static extern int SCardReleaseContext(IntPtr context);
  [DllImport("winscard.dll", CharSet = CharSet.Unicode)] static extern int SCardListReadersW(IntPtr context, string groups, char[] readers, ref int length);
  [DllImport("winscard.dll", CharSet = CharSet.Unicode)] static extern int SCardConnectW(IntPtr context, string reader, uint share, uint protocols, out IntPtr card, out uint activeProtocol);
  [DllImport("winscard.dll")] static extern int SCardDisconnect(IntPtr card, uint disposition);
  [DllImport("winscard.dll")] static extern int SCardTransmit(IntPtr card, ref IoRequest sendPci, byte[] send, int sendLength, IntPtr recvPci, byte[] recv, ref int recvLength);

  static IntPtr context = IntPtr.Zero;

  public static void Open() {
    if (context != IntPtr.Zero) return;
    int rc = SCardEstablishContext(0, IntPtr.Zero, IntPtr.Zero, out context);
    if (rc != 0) { context = IntPtr.Zero; throw new Exception("Smart card service is not available (code 0x" + rc.ToString("X8") + ")."); }
  }

  public static void Close() {
    if (context != IntPtr.Zero) { SCardReleaseContext(context); context = IntPtr.Zero; }
  }

  public static string[] Readers() {
    Open();
    int length = 0;
    int rc = SCardListReadersW(context, null, null, ref length);
    if (rc != 0 || length <= 2) { if (rc == unchecked((int)0x8010001D) || rc == unchecked((int)0x80100006)) Close(); return new string[0]; }
    char[] buffer = new char[length];
    rc = SCardListReadersW(context, null, buffer, ref length);
    if (rc != 0) return new string[0];
    return new string(buffer, 0, length).Split(new[] { '\0' }, StringSplitOptions.RemoveEmptyEntries);
  }

  // The UID of the tag on the reader as uppercase hex, or null when no tag is present.
  public static string ReadUid(string reader) {
    Open();
    IntPtr card; uint protocol;
    int rc = SCardConnectW(context, reader, 2 /* shared */, 3 /* T0 | T1 */, out card, out protocol);
    if (rc != 0) return null;
    try {
      IoRequest pci = new IoRequest { Protocol = protocol, PciLength = 8 };
      byte[] getUid = { 0xFF, 0xCA, 0x00, 0x00, 0x00 };
      byte[] response = new byte[258];
      int responseLength = response.Length;
      rc = SCardTransmit(card, ref pci, getUid, getUid.Length, IntPtr.Zero, response, ref responseLength);
      if (rc != 0 || responseLength < 3 || response[responseLength - 2] != 0x90 || response[responseLength - 1] != 0x00) return null;
      StringBuilder hex = new StringBuilder();
      for (int i = 0; i < responseLength - 2; i++) hex.Append(response[i].ToString("X2"));
      return hex.ToString();
    } finally {
      SCardDisconnect(card, 0 /* leave card */);
    }
  }
}
'@

# ---- Settings: this computer's serial and its device key -------------------
$SettingsDir  = Join-Path $env:APPDATA 'AvilonX'
$SettingsFile = Join-Path $SettingsDir 'acr122u-reader.json'
$settings = $null
if (Test-Path $SettingsFile) {
  try { $settings = Get-Content $SettingsFile -Raw | ConvertFrom-Json } catch { $settings = $null }
}
if (-not $settings -or -not $settings.serial) {
  # The serial is the network card's MAC address, saved so it never changes.
  $mac = $null
  try {
    $mac = Get-CimInstance Win32_NetworkAdapter -Filter 'PhysicalAdapter=True' |
      Where-Object { $_.MACAddress } | Sort-Object DeviceID | Select-Object -First 1 -ExpandProperty MACAddress
  } catch { $mac = $null }
  if (-not $mac) {
    $bytes = New-Object byte[] 6; (New-Object Random).NextBytes($bytes); $bytes[0] = $bytes[0] -bor 2
    $mac = ($bytes | ForEach-Object { $_.ToString('X2') }) -join ':'
  }
  $settings = [pscustomobject]@{ serial = ($mac -replace '[^0-9A-Fa-f]', '').ToUpper(); key = '' }
}
$serial = $settings.serial
$serialShown = ($serial -split '(..)' | Where-Object { $_ }) -join ':'

function Save-Settings {
  if (-not (Test-Path $SettingsDir)) { New-Item -ItemType Directory -Path $SettingsDir | Out-Null }
  $settings | ConvertTo-Json | Set-Content -Path $SettingsFile -Encoding UTF8
}

Write-Host ''
Write-Host 'AvilonX Clocking - ACR122U reader (sends taps to AvilonX)' -ForegroundColor Green
Write-Host ("Device serial: {0}" -f $serialShown) -ForegroundColor Cyan
Write-Host ("Settings file: {0}" -f $SettingsFile)
Write-Host ''

if (-not $settings.key) {
  Write-Host 'Ask the AvilonX Super Admin to register the Device serial above on'
  Write-Host '"Register RFID reader" for your club (Used by: Club admin), then paste'
  Write-Host 'the 32-character device key they give you.'
  while (-not $settings.key) {
    $typed = (Read-Host 'Device key') -replace '[^0-9A-Fa-f]', ''
    if ($typed.Length -eq 32) { $settings.key = $typed.ToUpper(); Save-Settings; Write-Host 'Device key saved.' -ForegroundColor Green }
    else { Write-Host 'The device key has 32 letters and numbers. Copy it again from AvilonX.' -ForegroundColor Yellow }
  }
} else {
  Save-Settings
}

# ---- AvilonX calls -------------------------------------------------------------
function Invoke-AvilonX([string]$Function, $Body) {
  $json = $Body | ConvertTo-Json -Compress
  try {
    $reply = Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/rest/v1/rpc/$Function" -Headers @{ apikey = $SupabaseKey } -ContentType 'application/json' -Body $json -TimeoutSec 10
    return @{ ok = $true; reply = $reply }
  } catch {
    $text = $null
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      try { $text = ($_.ErrorDetails.Message | ConvertFrom-Json).message } catch { $text = $_.ErrorDetails.Message }
    }
    $status = $null
    try { $status = [int]$_.Exception.Response.StatusCode } catch { $status = $null }
    return @{ ok = $false; message = $(if ($text) { $text } else { $_.Exception.Message }); status = $status }
  }
}

function Send-Tag([string]$Uid) {
  $result = Invoke-AvilonX 'device_rfid_scan' @{ p_serial = $serial; p_key = $settings.key; p_tag = $Uid; p_scanned_at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }
  $time = Get-Date -Format 'HH:mm:ss'
  if ($result.ok) {
    $color = 'Green'; if ($result.reply.status -ne 'sent' -and $result.reply.status -ne 'accepted') { $color = 'Yellow' }
    Write-Host ("{0}  Tag {1}: {2}" -f $time, $Uid, $result.reply.message) -ForegroundColor $color
    return $true
  }
  Write-Host ("{0}  Tag {1} not sent: {2}" -f $time, $Uid, $result.message) -ForegroundColor Red
  # Retry later only when AvilonX could not be reached (not when it refused the tag).
  return ($result.status -ge 400 -and $result.status -lt 500)
}

function Send-Heartbeat {
  $result = Invoke-AvilonX 'device_rfid_heartbeat' @{ p_serial = $serial; p_key = $settings.key; p_pending = $script:pending.Count; p_clock = 'internet'; p_firmware = $Firmware }
  if ($result.ok) { return $true }
  Write-Host ("AvilonX: {0}" -f $result.message) -ForegroundColor Yellow
  return $false
}

# ---- Main loop -------------------------------------------------------------------
$script:pending = New-Object System.Collections.ArrayList
$lastUid = $null
$reader = $null
$warned = $false
$lastHeartbeat = [DateTime]::MinValue

if (Send-Heartbeat) { Write-Host 'Connected to AvilonX. On Race entries choose "Wireless", then tap tags here.' -ForegroundColor Green }
$lastHeartbeat = Get-Date

while ($true) {
  try {
    if (-not $reader) {
      $readers = [AvilonXPcsc]::Readers()
      $reader = $readers | Where-Object { $_ -match 'ACR122|PICC|NFC|Contactless' } | Select-Object -First 1
      if (-not $reader) { $reader = $readers | Select-Object -First 1 }
      if ($reader) { Write-Host "Reader ready: $reader" -ForegroundColor Green; $warned = $false }
      elseif (-not $warned) { Write-Host 'No NFC reader found. Plug in the ACR122U; this window will pick it up.' -ForegroundColor Yellow; $warned = $true }
    }

    if ($reader) {
      $uid = [AvilonXPcsc]::ReadUid($reader)
      if ($uid -and $uid -ne $lastUid) {
        if (@(8, 14, 20) -contains $uid.Length) { [void]$script:pending.Add($uid) }
        else { Write-Host "Tag $uid has an unusual ID length and was not sent." -ForegroundColor Yellow }
      }
      # Remember the tag until it is lifted off, so each tap is sent once.
      $lastUid = $uid
      if (-not ([AvilonXPcsc]::Readers() -contains $reader)) {
        Write-Host 'Reader unplugged. Waiting for it to come back...' -ForegroundColor Yellow
        $reader = $null; $lastUid = $null
      }
    }

    # Send waiting taps, oldest first; keep them when AvilonX cannot be reached.
    while ($script:pending.Count -gt 0) {
      if (Send-Tag $script:pending[0]) { $script:pending.RemoveAt(0); $lastHeartbeat = Get-Date } else { break }
    }

    if (((Get-Date) - $lastHeartbeat).TotalSeconds -ge 60) { [void](Send-Heartbeat); $lastHeartbeat = Get-Date }
  } catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    [AvilonXPcsc]::Close()
    $reader = $null; $lastUid = $null
    Start-Sleep -Seconds 2
  }
  Start-Sleep -Milliseconds 250
}
