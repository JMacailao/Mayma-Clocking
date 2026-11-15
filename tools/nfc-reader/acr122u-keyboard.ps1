<#
  Mayma Clocking - NFC reader helper for the ACS ACR122U (and other PC/SC readers).

  Browsers cannot talk to the ACR122U directly. This helper reads each tag you tap
  on the reader and types its ID followed by Enter into whatever field has focus,
  like a keyboard. Use it with the Register NFC, Race entries and Clocking pages.

  How to run (Windows 10 or 11, nothing to install):
    1. Plug in the ACR122U.
    2. Right-click this file and choose "Run with PowerShell". Keep the window open.
    3. In the browser, click the NFC reader field, then tap tags on the reader.

  The tag ID is typed as uppercase hex, for example 04A23B1C5D8000, which matches
  what Android phones read. Press Ctrl+C in this window to stop.
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class MaymaPcsc {
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

  // Returns the names of connected PC/SC readers (empty when none).
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

  // Returns the UID of the tag on the reader as uppercase hex, or null when no tag is present.
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

Write-Host ''
Write-Host 'Mayma Clocking - NFC reader helper' -ForegroundColor Green
Write-Host 'Click the NFC reader field in the browser, then tap tags on the reader.'
Write-Host 'Keep this window open. Press Ctrl+C to stop.'
Write-Host ''

$lastUid = $null
$reader = $null
$warned = $false

while ($true) {
  try {
    if (-not $reader) {
      $readers = [MaymaPcsc]::Readers()
      $reader = $readers | Where-Object { $_ -match 'ACR122|PICC|NFC|Contactless' } | Select-Object -First 1
      if (-not $reader) { $reader = $readers | Select-Object -First 1 }
      if ($reader) {
        Write-Host "Reader ready: $reader" -ForegroundColor Green
        $warned = $false
      } elseif (-not $warned) {
        Write-Host 'No NFC reader found. Plug in the ACR122U; this window will pick it up.' -ForegroundColor Yellow
        $warned = $true
      }
    }

    if ($reader) {
      $uid = [MaymaPcsc]::ReadUid($reader)
      if ($uid -and $uid -ne $lastUid) {
        if (@(8, 14, 20) -contains $uid.Length) {
          [System.Windows.Forms.SendKeys]::SendWait($uid + '{ENTER}')
          Write-Host ("{0}  Tag {1} sent" -f (Get-Date -Format 'HH:mm:ss'), $uid)
        } else {
          Write-Host "Tag $uid has an unusual ID length and was not sent." -ForegroundColor Yellow
        }
      }
      # Remember the tag until it is lifted off the reader, so it is sent once per tap.
      $lastUid = $uid
      if (-not ([MaymaPcsc]::Readers() -contains $reader)) {
        Write-Host 'Reader unplugged. Waiting for it to come back...' -ForegroundColor Yellow
        $reader = $null
        $lastUid = $null
      }
    }
  } catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    [MaymaPcsc]::Close()
    $reader = $null
    $lastUid = $null
    Start-Sleep -Seconds 2
  }
  Start-Sleep -Milliseconds 250
}
