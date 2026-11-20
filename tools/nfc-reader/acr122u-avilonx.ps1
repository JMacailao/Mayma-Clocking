<#
  AvilonX Clocking - ACS ACR122U helper for a Windows laptop or PC.

  Reads each tag tapped on the ACR122U (or another PC/SC NFC reader) and hands
  it to the AvilonX page open in the browser on this same computer. Nothing to
  register and no key: just keep this window open.

  1. Plug in the ACR122U and double-click "Start ACR122U for AvilonX.cmd".
  2. In AvilonX (Race entries, Bird bonding, Show up) choose "Wired" as the
     reader. The page shows "ACR122U helper connected".
     If the browser asks to allow access to devices on your network, choose Allow.
  3. Tap tags on the reader. Press Ctrl+C or close this window to stop.

  Two tags on the reader at the same time are both read (the reader's chip is
  asked for up to 2 tags); each tag counts once until it is lifted off.

  Taps are shared only on this computer (127.0.0.1) and only with AvilonX pages.
#>

$ErrorActionPreference = 'Stop'
$Port = 47321

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

  // The UIDs of the tags on the reader (uppercase hex): up to 2 at once, or an
  // empty list when none is present.
  public static string[] ReadUids(string reader) {
    Open();
    IntPtr card; uint protocol;
    int rc = SCardConnectW(context, reader, 2 /* shared */, 3 /* T0 | T1 */, out card, out protocol);
    if (rc != 0) return new string[0];
    try {
      IoRequest pci = new IoRequest { Protocol = protocol, PciLength = 8 };
      // The reader's chip (PN532) lists up to 2 tags: InListPassiveTarget, 106 kbps type A.
      byte[] listTwo = { 0xFF, 0x00, 0x00, 0x00, 0x04, 0xD4, 0x4A, 0x02, 0x00 };
      byte[] response = new byte[258];
      int responseLength = response.Length;
      rc = SCardTransmit(card, ref pci, listTwo, listTwo.Length, IntPtr.Zero, response, ref responseLength);
      string[] both = rc == 0 ? ParseTargets(response, responseLength) : new string[0];
      if (both.Length > 0) return both;
      // Not supported here: the one tag the reader chose, as before.
      byte[] getUid = { 0xFF, 0xCA, 0x00, 0x00, 0x00 };
      responseLength = response.Length;
      rc = SCardTransmit(card, ref pci, getUid, getUid.Length, IntPtr.Zero, response, ref responseLength);
      if (rc != 0 || responseLength < 3 || response[responseLength - 2] != 0x90 || response[responseLength - 1] != 0x00) return new string[0];
      StringBuilder hex = new StringBuilder();
      for (int i = 0; i < responseLength - 2; i++) hex.Append(response[i].ToString("X2"));
      return new[] { hex.ToString() };
    } finally {
      SCardDisconnect(card, 0 /* leave card */);
    }
  }

  // The tags in an InListPassiveTarget answer: D5 4B count, then for each tag
  // its number, SENS_RES (2), SEL_RES (1), UID length, UID, and an ATS when
  // SEL_RES says so; then 90 00. Anything unexpected gives an empty list.
  public static string[] ParseTargets(byte[] r, int length) {
    var found = new System.Collections.Generic.List<string>();
    if (length < 5 || r[length - 2] != 0x90 || r[length - 1] != 0x00 || r[0] != 0xD5 || r[1] != 0x4B) return new string[0];
    int end = length - 2, count = r[2], at = 3;
    for (int t = 0; t < count; t++) {
      if (at + 5 > end) return new string[0];
      int selRes = r[at + 3], uidLength = r[at + 4];
      at += 5;
      if (uidLength != 4 && uidLength != 7 && uidLength != 10) return new string[0];
      if (at + uidLength > end) return new string[0];
      StringBuilder hex = new StringBuilder();
      for (int i = 0; i < uidLength; i++) hex.Append(r[at + i].ToString("X2"));
      at += uidLength;
      if ((selRes & 0x20) != 0) { if (at >= end) return new string[0]; at += Math.Max(1, (int)r[at]); }
      if (!found.Contains(hex.ToString())) found.Add(hex.ToString());
    }
    return found.ToArray();
  }
}
'@

# AvilonX pages that may read the taps (the browser sends the page's origin).
function Test-AllowedOrigin([string]$Origin) {
  if (-not $Origin) { return $false }
  return $Origin -match '^https://(www\.)?avilonx\.site$' -or $Origin -match '^https://[a-z0-9-]+\.github\.io$' -or $Origin -match '^http://(localhost|127\.0\.0\.1)(:\d+)?$'
}

$tags = New-Object System.Collections.ArrayList   # recent taps: @{ seq; uid }
$seq = 0
$readerName = ''

function Send-Response($Client, [string]$Origin, [int]$Code, [string]$Body) {
  $status = @{ 200 = 'OK'; 204 = 'No Content'; 404 = 'Not Found' }[$Code]
  $lines = @("HTTP/1.1 $Code $status", 'Content-Type: application/json', 'Cache-Control: no-store', 'Connection: close')
  if (Test-AllowedOrigin $Origin) {
    $lines += "Access-Control-Allow-Origin: $Origin"
    $lines += 'Vary: Origin'
    $lines += 'Access-Control-Allow-Methods: GET, OPTIONS'
    $lines += 'Access-Control-Allow-Headers: *'
    $lines += 'Access-Control-Allow-Private-Network: true'
  }
  $bodyBytes = [Text.Encoding]::UTF8.GetBytes($Body)
  $lines += "Content-Length: $($bodyBytes.Length)"
  $headBytes = [Text.Encoding]::ASCII.GetBytes(($lines -join "`r`n") + "`r`n`r`n")
  $stream = $Client.GetStream()
  $stream.Write($headBytes, 0, $headBytes.Length)
  if ($bodyBytes.Length) { $stream.Write($bodyBytes, 0, $bodyBytes.Length) }
  $stream.Flush()
}

function Get-TagsJson([int]$After) {
  $items = @($script:tags | Where-Object { $After -ge 0 -and $_.seq -gt $After } | ForEach-Object { '{"seq":' + $_.seq + ',"uid":"' + $_.uid + '"}' })
  return '{"ok":true,"app":"avilonx-acr122u","reader":' + (ConvertTo-Json ([string]$script:readerName)) + ',"seq":' + $script:seq + ',"tags":[' + ($items -join ',') + ']}'
}

# Pages waiting for the next tap (?wait=1): answered the moment a tag is read,
# or after 20 seconds with no tap, so each tap reaches the page at once.
$waiting = New-Object System.Collections.ArrayList

function Close-Waiter($Waiter) {
  try { Send-Response $Waiter.client $Waiter.origin 200 (Get-TagsJson $Waiter.after) } catch { } finally { $Waiter.client.Close() }
}

function Update-Waiters {
  $now = Get-Date
  foreach ($waiter in @($script:waiting)) {
    if ($script:seq -gt $waiter.after -or $now -ge $waiter.until -or -not $waiter.client.Connected) {
      [void]$script:waiting.Remove($waiter); Close-Waiter $waiter
    }
  }
}

function Invoke-Request($Client) {
  $keep = $false
  try {
    $Client.ReceiveTimeout = 1000; $Client.SendTimeout = 1000; $Client.NoDelay = $true
    $stream = $Client.GetStream()
    $buffer = New-Object byte[] 8192; $read = 0; $text = ''
    while ($read -lt $buffer.Length -and -not $text.Contains("`r`n`r`n")) {
      $n = $stream.Read($buffer, $read, $buffer.Length - $read)
      if ($n -le 0) { break }
      $read += $n; $text = [Text.Encoding]::ASCII.GetString($buffer, 0, $read)
    }
    $requestLines = $text -split "`r`n"
    $parts = $requestLines[0] -split ' '
    $method = $parts[0]; $path = if ($parts.Length -gt 1) { $parts[1] } else { '/' }
    $origin = ($requestLines | Where-Object { $_ -match '^Origin:\s*' } | Select-Object -First 1) -replace '^Origin:\s*', ''
    if ($method -eq 'OPTIONS') { Send-Response $Client $origin 204 ''; return }
    if (-not ($path -match '^/tag(\?|$)')) { Send-Response $Client $origin 404 '{"ok":false}'; return }
    $after = -1
    if ($path -match 'after=(\d+)') { $after = [int]$Matches[1] }
    if ($after -ge 0 -and $path -match 'wait=1' -and $script:seq -le $after -and $script:waiting.Count -lt 8) {
      [void]$script:waiting.Add(@{ client = $Client; origin = $origin; after = $after; until = (Get-Date).AddSeconds(20) })
      $keep = $true
      return
    }
    Send-Response $Client $origin 200 (Get-TagsJson $after)
  } catch {
    # A page that went away mid-request: nothing to do.
  } finally {
    if (-not $keep) { $Client.Close() }
  }
}

try {
  $listener = New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $Port)
  $listener.Start()
} catch {
  Write-Host "Could not start on port $Port. Is the helper already open in another window? Close it and try again." -ForegroundColor Red
  Read-Host 'Press Enter to close'
  exit 1
}

Write-Host ''
Write-Host 'AvilonX Clocking - ACR122U helper' -ForegroundColor Green
Write-Host 'Keep this window open. In AvilonX choose "Wired" as the reader, then tap tags.'
Write-Host 'Nothing to register. Press Ctrl+C or close this window to stop.'
Write-Host ''

$onReader = New-Object 'System.Collections.Generic.HashSet[string]'   # tags on the reader now
$lastSeen = @{}                                                        # tag -> when last seen
$reader = $null
$warned = $false
$nextRead = [DateTime]::MinValue
$nextReaderCheck = [DateTime]::MinValue

try {
  while ($true) {
    # Answer the AvilonX page quickly, then check the reader every 80 ms.
    while ($listener.Pending()) { Invoke-Request ($listener.AcceptTcpClient()) }
    if ((Get-Date) -ge $nextRead) {
      $nextRead = (Get-Date).AddMilliseconds(80)
      try {
        if (-not $reader) {
          $readers = [AvilonXPcsc]::Readers()
          $reader = $readers | Where-Object { $_ -match 'ACR122|PICC|NFC|Contactless' } | Select-Object -First 1
          if (-not $reader) { $reader = $readers | Select-Object -First 1 }
          if ($reader) { Write-Host "Reader ready: $reader" -ForegroundColor Green; $warned = $false; $script:readerName = $reader }
          elseif (-not $warned) { Write-Host 'No NFC reader found. Plug in the ACR122U; this window will pick it up.' -ForegroundColor Yellow; $warned = $true; $script:readerName = '' }
        }
        if ($reader) {
          $uids = @([AvilonXPcsc]::ReadUids($reader))
          $now = Get-Date
          foreach ($uid in $uids) {
            # Each tag counts once: not again while it stays on the reader, nor
            # for 1.5 seconds after it was last seen (a moment the reader loses it).
            $fresh = -not $onReader.Contains($uid) -and (-not $lastSeen.ContainsKey($uid) -or ($now - $lastSeen[$uid]).TotalMilliseconds -gt 1500)
            $lastSeen[$uid] = $now
            if (-not $fresh) { continue }
            if (@(8, 14, 20) -contains $uid.Length) {
              $script:seq++
              [void]$script:tags.Add(@{ seq = $script:seq; uid = $uid })
              while ($script:tags.Count -gt 20) { $script:tags.RemoveAt(0) }
              Update-Waiters
              Write-Host ("{0}  Tag {1}{2}" -f (Get-Date -Format 'HH:mm:ss'), $uid, $(if ($uids.Count -gt 1) { '  (2 tags on the reader)' } else { '' })) -ForegroundColor Cyan
            } else { Write-Host "Tag $uid has an unusual ID length and was ignored." -ForegroundColor Yellow }
          }
          $onReader = New-Object 'System.Collections.Generic.HashSet[string]'
          foreach ($uid in $uids) { [void]$onReader.Add($uid) }
          foreach ($old in @($lastSeen.Keys)) { if (($now - $lastSeen[$old]).TotalSeconds -gt 10) { $lastSeen.Remove($old) } }
          # Unplugged? Checked every 2 seconds (listing readers is slow).
          if ((Get-Date) -ge $nextReaderCheck) { $nextReaderCheck = (Get-Date).AddSeconds(2); $present = [AvilonXPcsc]::Readers() -contains $reader } else { $present = $true }
          if (-not $present) {
            Write-Host 'Reader unplugged. Waiting for it to come back...' -ForegroundColor Yellow
            $reader = $null; $onReader.Clear(); $script:readerName = ''
          }
        }
      } catch {
        Write-Host $_.Exception.Message -ForegroundColor Red
        [AvilonXPcsc]::Close()
        $reader = $null; $onReader.Clear(); $script:readerName = ''
        $nextRead = (Get-Date).AddSeconds(2)
      }
    }
    Update-Waiters
    Start-Sleep -Milliseconds 20
  }
} finally {
  foreach ($waiter in @($waiting)) { try { $waiter.client.Close() } catch { } }
  $listener.Stop()
}
