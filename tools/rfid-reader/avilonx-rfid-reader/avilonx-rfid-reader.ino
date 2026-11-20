/*
  AvilonX Clocking - external RFID reader (ESP8266 or ESP32 + RC522 + OLED)

  Every tag tapped on the RC522 is saved in the board's flash first, with the
  time it was tapped, and then sent to AvilonX over Wi-Fi. A tag is saved once:
  tapping it again while it is still waiting to send does not save it again. When there is no
  Wi-Fi or no internet the taps stay saved (up to 150, kept through a power
  cut) and are sent as soon as the internet is back. AvilonX clocks a pigeon at
  the time its tag was tapped, not the time it arrived.

  The same sketch runs on an ESP8266 (NodeMCU / Wemos D1 mini) and on an ESP32
  (ESP32 DevKit): choose the board in the Arduino IDE, the sketch picks the
  right pins and libraries by itself.

  OLED display (optional, 0.96" SSD1306 or 1.3" SH1106, 128x64, I2C):
    at start-up  which modules were found: RFID reader, DS1302 clock, storage,
                 Wi-Fi and device key ("NOT FOUND" when one is missing)
    on a tap     the tag and whether it was saved
    then         AvilonX's reply (clocked, already clocked, refused...)
    otherwise    status: reader, Wi-Fi, AvilonX, taps waiting to send, time;
                 and, in turn, WHAT IS NEEDED (wiring to check, Wi-Fi or
                 device key to set at 192.168.4.1, clock not set...)
  Without an OLED connected the reader works exactly the same.

  The Super Admin must first register this reader for a club (Register RFID
  reader page, using the Device serial below) and give you a device key to
  enter on this reader's page. Readers that are not registered are refused.

  The club admin chooses the reader's mode on Admin > RFID readers:
    Register  each tap fills the NFC tag field on the Race entries and
              Register NFC pages that are open in the club's browser
              (taps sent late, after being offline, are not filled in).
    Clocking  each tap clocks that tag's pigeon in an open race.

  Tap times come from a DS1302 clock module (CLK/DAT/RST pins, with its
  coin-cell battery), so they stay accurate even when the board is switched
  off or has no internet. Whenever the reader is online it corrects the DS1302
  from internet time (a DS1302 drifts a few seconds a day on its own).
  Set it once: power the reader on with internet (the page shows "DS1302").
  Without a DS1302 the sketch still works, using internet time kept while the
  board stays powered; a tap made before the clock was ever set is clocked at
  the time AvilonX receives it.

  Setup
    1. Arduino IDE: install the boards package ("esp8266" by ESP8266 Community,
       or "esp32" by Espressif) and the libraries "MFRC522" and "U8g2"
       (Sketch > Include Library > Manage Libraries). Board: e.g. "NodeMCU 1.0
       (ESP-12E Module)" or "ESP32 Dev Module". Upload this sketch.
    2. Join the Wi-Fi "RFID-READER" (password RFID12345), open http://192.168.4.1
    3. The Super Admin registers the Device serial (Register RFID reader).
    4. On http://192.168.4.1 enter the device key, then pick your 2.4 GHz Wi-Fi
       and press Save & Connect. Tap a tag: the page (and the OLED) shows
       AvilonX's reply.

  Wiring - everything runs on 3.3 V (never 5 V on the RC522)

  ESP8266 (NodeMCU / Wemos D1 mini)
    RC522:   SDA->D8(GPIO15)  SCK->D5(GPIO14)  MOSI->D7(GPIO13)
             MISO->D6(GPIO12) RST->3V3 (not to a pin)  IRQ not connected
             3.3V->3V3  GND->GND
    OLED:    SDA->D2(GPIO4)  SCL->D1(GPIO5)  VCC->3V3  GND->GND
    DS1302:  CLK->D3(GPIO0)  DAT->D4(GPIO2)  RST->D0(GPIO16)
             VCC->3V3  GND->GND, with a CR2032 coin cell in the module
    Reset button: RX(GPIO3) -> button -> GND (no resistor needed). The Serial
             Monitor still works (it only uses TX).
    D3 and D4 must be high while the board starts, and the DS1302 inputs pull
    down a little. If the reader sometimes does not start, add a 4.7k resistor
    from D3 to 3.3V and one from D4 to 3.3V. Do not press the board's FLASH
    button while it runs (it shares D3 with the DS1302 clock line).
    The ESP8266 has no free pin for the RC522's RST: the reader is reset with a
    command instead (and checked every 5 seconds, as before).
    Built before the OLED (RC522 SDA on D2, RST on D1, DS1302 RST on D8, button
    on D0)? Set LEGACY_WIRING to 1 below: the old wiring works, without OLED.

  ESP32 (ESP32 DevKit, 30 or 38 pins)
    RC522:   SDA->GPIO5  SCK->GPIO18  MOSI->GPIO23  MISO->GPIO19  RST->GPIO27
             3.3V->3V3  GND->GND
    OLED:    SDA->GPIO21  SCL->GPIO22  VCC->3V3  GND->GND
    DS1302:  CLK->GPIO25  DAT->GPIO26  RST->GPIO33  VCC->3V3  GND->GND
    Reset button: GPIO32 -> button -> GND (no resistor needed)
    The blue LED on GPIO2 blinks once for a clocked tap, 3 times for a refusal.

  Holding the reset button 10 seconds restores ONLY the reader's own hotspot
  name/password to RFID-READER / RFID12345 and restarts. The saved router
  Wi-Fi, device key and saved taps are kept.
*/

// ---- Options ---------------------------------------------------------------
#define LEGACY_WIRING 0   // ESP8266 only: 1 = the wiring from before the OLED (no OLED)
#define OLED_SH1106 0     // 0 = 0.96" SSD1306 OLED, 1 = 1.3" SH1106 OLED

#include <Arduino.h>
#if defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <ESP8266WebServer.h>
  #include <ESP8266HTTPClient.h>
  #include <WiFiClientSecureBearSSL.h>
  #include <coredecls.h>   // settimeofday_cb: told when internet time arrives
  typedef ESP8266WebServer WebServerType;
  typedef BearSSL::WiFiClientSecure SecureClient;
  #define BOARD_NAME "ESP8266"
#elif defined(ESP32)
  #include <WiFi.h>
  #include <WebServer.h>
  #include <HTTPClient.h>
  #include <WiFiClientSecure.h>
  #include <esp_sntp.h>    // sntp_set_time_sync_notification_cb
  typedef WebServer WebServerType;
  typedef WiFiClientSecure SecureClient;
  #define BOARD_NAME "ESP32"
#else
  #error "Choose an ESP8266 or ESP32 board (Tools > Board)."
#endif
#include <EEPROM.h>
#include <LittleFS.h>
#include <time.h>
#include <sys/time.h>
#include <functional>
#include <SPI.h>
#include <MFRC522.h>

#define NO_PIN 255        // not connected
#if defined(ESP32)
  #define RFID_SS_PIN  5      // RC522 SDA
  #define RFID_RST_PIN 27     // RC522 RST
  #define RTC_CLK_PIN 25      // DS1302 CLK
  #define RTC_DAT_PIN 26      // DS1302 DAT
  #define RTC_RST_PIN 33      // DS1302 RST (CE)
  #define RESET_BUTTON_PIN 32 // button to GND (internal pull-up)
  #define RESET_BUTTON_PULLUP 1
  #define OLED_SDA_PIN 21
  #define OLED_SCL_PIN 22
  #define USE_OLED 1
  #define STATUS_LED_PIN 2    // built-in blue LED, lit when HIGH
  #define STATUS_LED_ON HIGH
  #define USE_STATUS_LED 1
  #define RFID_WIRING_HINT "SDA GPIO5, SCK GPIO18, MOSI GPIO23, MISO GPIO19, RST GPIO27, 3.3V, GND"
#elif LEGACY_WIRING
  #define RFID_SS_PIN  4      // D2 -> RC522 SDA
  #define RFID_RST_PIN 5      // D1 -> RC522 RST
  #define RTC_CLK_PIN 0       // D3 -> DS1302 CLK
  #define RTC_DAT_PIN 2       // D4 -> DS1302 DAT
  #define RTC_RST_PIN 15      // D8 -> DS1302 RST (CE)
  #define RESET_BUTTON_PIN 16 // D0 -> button to GND, 10k pull-up to 3.3V
  #define RESET_BUTTON_PULLUP 0
  #define USE_OLED 0          // no pins left for it in this wiring
  #define STATUS_LED_PIN 2    // built-in LED (shares D4 with the DS1302)
  #define STATUS_LED_ON LOW
  #define USE_STATUS_LED 0    // off: blinking it would disturb the DS1302 data line
  #define RFID_WIRING_HINT "SDA D2, SCK D5, MOSI D7, MISO D6, RST D1, 3.3V, GND"
#else
  #define RFID_SS_PIN  15     // D8 -> RC522 SDA
  #define RFID_RST_PIN NO_PIN // RC522 RST to 3.3V: reset by command
  #define RTC_CLK_PIN 0       // D3 -> DS1302 CLK
  #define RTC_DAT_PIN 2       // D4 -> DS1302 DAT
  #define RTC_RST_PIN 16      // D0 -> DS1302 RST (CE)
  #define RESET_BUTTON_PIN 3  // RX -> button to GND (internal pull-up)
  #define RESET_BUTTON_PULLUP 1
  #define OLED_SDA_PIN 4      // D2
  #define OLED_SCL_PIN 5      // D1
  #define USE_OLED 1
  #define STATUS_LED_PIN 2    // built-in LED (shares D4 with the DS1302)
  #define STATUS_LED_ON LOW
  #define USE_STATUS_LED 0    // off: blinking it would disturb the DS1302 data line
  #define RFID_WIRING_HINT "SDA D8, SCK D5, MOSI D7, MISO D6, RST to 3.3V, 3.3V, GND"
#endif
#define RESET_HOLD_MS 10000UL

#if USE_OLED
  #include <Wire.h>
  #include <U8g2lib.h>
#endif

// Factory defaults for the reader hotspot; users can change these on the local website.
const char* DEFAULT_AP_NAME = "RFID-READER";
const char* DEFAULT_AP_PASSWORD = "RFID12345";

// AvilonX's Supabase project. The publishable key is public (it is in the web app too);
// the reader proves who it is with its serial and device key.
const char* SUPABASE_URL = "https://utfxtwgqdbjkbxlooolr.supabase.co";
const char* SUPABASE_KEY = "sb_publishable_bUkPWYhRAP0nYd9yL01ObA__PJ3Q4v3";

WebServerType server(80);
MFRC522 reader(RFID_SS_PIN, RFID_RST_PIN);  // NO_PIN (255): reset by command

// Saved in flash. Fields are only ever appended, so older settings carry over.
struct Settings {
  uint32_t magic;
  char ssid[33];
  char password[65];
  char deviceKey[41];
  char apSsid[33];       // local access-point name
  char apPassword[65];   // local access-point password
};
Settings config;
const uint32_t SETTINGS_MAGIC_V1 = 0x52464944UL; // first sketch: Wi-Fi only
const uint32_t SETTINGS_MAGIC_V2 = 0x52464945UL; // adds the device key
const uint32_t SETTINGS_MAGIC = 0x52464946UL;    // v3 adds hotspot name/password
const size_t EEPROM_BYTES = 256;

String deviceSerial;  // the Wi-Fi MAC address, e.g. 5C:CF:7F:12:34:56

const int HISTORY_SIZE = 20;
String history[HISTORY_SIZE];
int historyNext = 0;
int historyCount = 0;
unsigned long totalScans = 0;
String lastUID = "Waiting for card";
String lastReply = "No tags sent yet";
String lastMode = "";
String lastSeenUID = "";
unsigned long lastSeenMs = 0;
// RC522 watchdog: if the reader stops answering (power dip), it is reset on its
// own every few seconds until it answers again; the board keeps running.
unsigned long lastRfidCheckMs = 0;
unsigned long lastRfidActivityMs = 0;
uint32_t rfidRestarts = 0;
bool rfidOk = false;
const unsigned long RFID_CHECK_MS = 5000UL;      // check the reader every 5 seconds
unsigned long buttonPressedAt = 0;
bool resetAlreadyHandled = false;
bool restartAfterResetBlinks = false;
bool restartAfterApChange = false;
unsigned long apChangeRestartAt = 0;
unsigned long lastReconnectAttempt = 0;
unsigned long wifiLostAt = 0;        // when the router Wi-Fi went away (0 = connected)
unsigned long lastWifiNoticeMs = 0;  // last "no Wi-Fi" line in the Serial Monitor

// Saved taps: one small file per tap in LittleFS (/q), removed once AvilonX
// has answered it. The limit keeps the flash from filling up.
const unsigned int MAX_SAVED_SCANS = 150;
const char* QUEUE_DIR = "/q";
uint32_t nextScanId = 1;
unsigned int pendingCount = 0;
bool storageReady = false;
// AvilonX (rfid-devices.sql) accepts the tap time as p_scanned_at.
const bool RPC_SUPPORTS_SCANNED_AT = true;
struct StoredScan {
  uint32_t magic;
  uint32_t id;
  uint32_t scannedAtUtc; // 0 = clock not set yet; never invent a time
  char uid[25];
  uint32_t checksum;
};
const uint32_t SCAN_MAGIC = 0x53434131UL;
// Declared up here because the Arduino IDE adds function declarations near the
// top of the sketch, and sendTag() returns this type.
enum SendResult { SEND_ANSWERED, SEND_RETRY };
unsigned long lastSendAttempt = 0;
// Online signal to AvilonX about every minute, so the club admin and Super
// Admin can see the reader is online and how many taps it still holds.
const char* FIRMWARE_VERSION = "avilonx-reader-2026.11.2-" BOARD_NAME;
const unsigned long HEARTBEAT_MS = 60000UL;
unsigned long lastHeartbeatMs = 0;
bool avilonxReachable = false;
bool wasWifiConnected = false;
unsigned long sendWaitMs = 0;
const unsigned long SEND_NEXT_MS = 300UL;      // after an answer, send the next tap soon
const unsigned long SEND_RETRY_MS = 10000UL;   // after no internet, wait before trying again
const unsigned long SAME_TAG_GUARD_MS = 350UL;
// The LED uses a timer rather than delay(), so the web page and button keep working.
unsigned long ledNextMs = 0;
uint8_t ledTogglesRemaining = 0;
bool ledIsOn = false;

const char PAGE[] PROGMEM = R"HTML(
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b2345"><title>AvilonX | RFID Reader</title>
<style>
:root{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#102745;background:#f0f5fb}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0}button,input,select{font:inherit}button{cursor:pointer}.layout{display:grid;grid-template-columns:232px minmax(0,1fr);min-height:100vh}.side{background:linear-gradient(165deg,#091b35,#123765);color:#fff;padding:25px 14px;position:sticky;top:0;height:100vh}.brand{font-size:29px;font-weight:850;letter-spacing:-1.4px;margin:0 12px 36px}.brand span{color:#ff8119}.nav{display:block;color:#cbdaf0;text-decoration:none;padding:13px 15px;border-radius:11px;margin:5px 0;font-size:14px;font-weight:600}.nav.active,.nav:hover{color:white;background:#f97316}.nav small{font-size:17px;margin-right:11px}.sidefoot{position:absolute;bottom:24px;left:28px;right:16px;color:#a8c6e4;font-size:12px;line-height:1.6}.content{min-width:0}.top{background:linear-gradient(120deg,#0b2345,#173e72);color:white;display:flex;align-items:center;justify-content:space-between;gap:15px;padding:22px 28px;border-bottom:5px solid #ff8319}.top h1{font-size:25px;margin:0;letter-spacing:-.5px}.top p{font-size:13px;opacity:.78;margin:5px 0 0}.topright{display:flex;align-items:center;gap:14px}.online{border:1px solid #4b748a;border-radius:24px;padding:8px 14px;white-space:nowrap;font-weight:700;font-size:13px;background:#0e3e4b}.dot{display:inline-block;width:9px;height:9px;background:#f9b64b;border-radius:100%;margin-right:7px}.dot.on{background:#20d88a}.serialtop{font-size:11px;color:#c8dbec}.serialtop strong{display:block;color:white;font-size:13px;letter-spacing:.3px;margin-top:3px}.page{padding:24px;max-width:1450px;margin:auto}.grid{display:grid;grid-template-columns:minmax(0,1.06fr) minmax(0,1fr);gap:18px}.card{background:#fff;border:1px solid #dce6f1;border-radius:14px;box-shadow:0 4px 17px #183e6510;overflow:hidden;margin-bottom:18px;min-width:0}.cardhead{background:#173961;color:white;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:750;font-size:16px}.cardbody{padding:18px}.scanner{background:radial-gradient(circle at 50% 35%,#184e89,#0b274d 75%);min-height:250px;display:flex;flex-direction:column;justify-content:center;align-items:center;color:#fff;text-align:center;padding:25px}.waves{display:grid;place-items:center;border-radius:50%;border:1px solid #4ea9e585;width:125px;height:125px;background:radial-gradient(circle,#245d99,#0c3769);box-shadow:0 0 0 12px #2374b21a,0 0 0 24px #2374b20c;font-size:50px;margin-bottom:18px}.scanner h2{margin:0 0 7px;font-size:24px}.scanner p{color:#bcd7f1;margin:0;font-size:13px}.taginfo{display:grid;grid-template-columns:1fr 1fr;gap:12px}.smalllabel{color:#667b91;font-size:12px;font-weight:700;display:block;margin-bottom:7px}.uid{font-size:clamp(20px,3vw,30px);font-weight:850;letter-spacing:1px;word-break:break-word}.reply{font-weight:750;color:#0c8457;overflow-wrap:anywhere}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:15px}.stat{border:1px solid #d7e2f0;border-radius:12px;padding:15px;background:#fbfdff;min-width:0}.stat strong{font-size:25px;display:block;overflow-wrap:anywhere}.stat .smalllabel{margin-bottom:6px}.orange{color:#f36a07}.green{color:#0f8758}.muted{color:#697e95;font-size:12px;line-height:1.6}.status{font-size:12px;font-weight:750;padding:7px 10px;border-radius:20px;background:#eaf0f7;color:#345575;display:inline-block}.status.good{color:#087c50;background:#e0f6eb}.status.bad{color:#ab5e02;background:#fff0d8}.tablewrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px}th{text-align:left;color:#61758d;font-size:11px;letter-spacing:.6px;padding:12px;border-bottom:1px solid #dbe5ee;white-space:nowrap}td{padding:13px 12px;border-bottom:1px solid #ebf0f5;vertical-align:top}tr:last-child td{border-bottom:0}.num{background:#fff1e4;color:#e66e13;border-radius:7px;font-weight:800;padding:4px 8px}.tagcode{font-family:ui-monospace,Consolas,monospace;font-weight:700;white-space:nowrap}.record{overflow-wrap:anywhere;max-width:290px}.panelrow{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}.deviceid{font-family:ui-monospace,Consolas,monospace;font-weight:800;word-break:break-word;font-size:16px}.field{margin-top:14px}label{display:block;font-size:13px;font-weight:750;margin-bottom:7px;color:#1e3a57}input,select{width:100%;background:white;color:#193756;padding:11px 12px;border:1px solid #b9cada;border-radius:9px;outline:none;min-height:44px}input:focus,select:focus{border-color:#f97316;box-shadow:0 0 0 3px #f9731620}.buttons{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}.btn{border:0;border-radius:9px;padding:11px 16px;font-weight:750;color:white;background:#f97316;min-height:42px}.btn.alt{background:#eaf2fa;color:#194a78;border:1px solid #c6d8eb}.btn:disabled{opacity:.6;cursor:wait}.divider{height:1px;background:#e7edf3;margin:14px 0}.notice{font-size:12px;color:#667e94;line-height:1.55}.message{min-height:19px;margin-top:9px;color:#1b6f62;font-size:12px}.info{padding:10px 12px;border-radius:9px;background:#f0f6fc;margin:10px 0;font-size:12px;overflow-wrap:anywhere}.navmini{display:none}.scanpulse{animation:flash .65s ease}@keyframes flash{50%{box-shadow:inset 0 0 0 3px #ff8725}}@media(max-width:1060px){.layout{grid-template-columns:190px minmax(0,1fr)}.side{padding:18px 9px}.brand{font-size:24px}.grid{grid-template-columns:1fr}.page{max-width:850px}}@media(max-width:690px){.layout{display:block}.side{display:none}.top{padding:17px}.top h1{font-size:19px}.topright{gap:8px}.serialtop{display:none}.page{padding:12px}.navmini{display:flex;overflow:auto;gap:8px;padding:11px 12px;background:#09284d;position:sticky;top:0;z-index:2}.navmini a{color:white;text-decoration:none;white-space:nowrap;font-size:12px;border:1px solid #45617e;padding:8px 10px;border-radius:8px}.cardbody{padding:14px}.scanner{min-height:210px}.taginfo{grid-template-columns:1fr}.stats{grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.stat{padding:10px}.stat strong{font-size:20px}.stat .smalllabel{font-size:10px}}@media(max-width:380px){.stats{grid-template-columns:1fr 1fr}.topright{display:none}}
</style></head><body><div class="layout">
<aside class="side"><div class="brand">Avilon<span>X</span></div><nav><a class="nav active" href="#dashboard"><small>⌂</small> Dashboard</a><a class="nav" href="#wifi"><small>◉</small> Wi-Fi Connection</a><a class="nav" href="#registration"><small>◇</small> Device Registration</a><a class="nav" href="#historyCard"><small>☷</small> Scan History</a><a class="nav" href="#about"><small>ⓘ</small> About</a></nav><div class="sidefoot">ESP8266 / ESP32 + RC522<br>Local dashboard · 192.168.4.1</div></aside>
<div class="content"><header class="top"><div><h1>Avilon<span style="color:#ff8319">X</span> RFID Reader</h1><p>ESP8266 / ESP32 + RC522 &nbsp;·&nbsp; External RFID Reader</p></div><div class="topright"><span class="online"><span id="dot" class="dot"></span><span id="topOnline">Checking</span></span><div class="serialtop">DEVICE SERIAL<strong id="topSerial">—</strong></div></div></header>
<nav class="navmini"><a href="#dashboard">Dashboard</a><a href="#historyCard">Recent taps</a><a href="#registration">Device</a><a href="#wifi">Wi-Fi</a></nav>
<main class="page" id="dashboard"><div class="grid"><div>
<section class="card" id="scannerCard"><div class="cardhead"><span>◉ &nbsp; Live Scan</span><span class="status good" id="readyBadge">Reader active</span></div><div class="scanner"><div class="waves">◉</div><h2>Ready to Scan</h2><p>Tap an RFID tag on the RC522 reader</p></div></section>
<section class="card" id="historyCard"><div class="cardhead"><span>◷ &nbsp; Recent Taps</span><span class="status" id="recentCount">Last 20</span></div><div class="tablewrap"><div id="waitingBox" hidden><h3 style="margin:4px 0 6px;font-size:15px">Waiting to send (saved with their tap time)</h3><table><thead><tr><th>#</th><th>Tag (UID)</th><th>Tapped at (PH time)</th></tr></thead><tbody id="waiting"></tbody></table><br></div><table><thead><tr><th>Recent #</th><th>Tag (UID)</th><th>AvilonX reply</th></tr></thead><tbody id="history"><tr><td colspan="3" class="muted">No scans yet</td></tr></tbody></table></div></section>
<section class="card" id="about"><div class="cardhead">Reader information</div><div class="cardbody"><div class="muted">Every tap is saved in the reader's flash with the time it was tapped, then sent to AvilonX. Without internet the taps wait here (up to 150, kept through a power cut) and are sent when the internet is back; AvilonX clocks them at their tap time. Tap times need the reader's clock, which it sets from the internet once it has been online since power-up: <b id="clockState">checking…</b>. The reader always runs its own hotspot at <b>192.168.4.1</b>, also while connected to your Wi-Fi. Your club admin chooses Register or Clocking mode in AvilonX.</div></div></section>
</div><div>
<section class="card"><div class="cardbody"><div class="taginfo"><div><span class="smalllabel">RFID READER: <b id="rfidState">Checking...</b></span><br><span class="smalllabel">LAST TAG (UID)</span><div class="uid" id="uid">Waiting for card</div></div><div><span class="smalllabel">AVILONX REPLY</span><div class="reply" id="reply">No tags sent yet</div></div></div><div class="stats"><div class="stat"><span class="smalllabel">MODE</span><strong class="orange" id="mode">—</strong></div><div class="stat"><span class="smalllabel">TOTAL SCANS</span><strong id="count">0</strong></div><div class="stat"><span class="smalllabel">WAITING TO SEND</span><strong id="pending">0</strong></div></div></div></section>
<section class="card" id="registration"><div class="cardhead">◇ &nbsp; Device Registration</div><div class="cardbody"><div class="panelrow"><span class="smalllabel">DEVICE SERIAL</span><button class="btn alt" type="button" id="copySerial">Copy serial</button></div><div class="deviceid" id="serial">—</div><div class="divider"></div><div class="panelrow"><b style="font-size:13px">Device Key</b><span class="status" id="keyStatus">Checking...</span></div><form id="keyForm"><div class="field"><label for="key">Device key from the AvilonX Super Admin</label><input id="key" name="key" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Paste 32-character device key" required></div><div class="buttons"><button class="btn" type="submit">Save Device Key</button></div></form><div id="keyMessage" class="message" role="status"></div><p class="notice">Send this device serial to the AvilonX Super Admin first. They register it for your club and give you the device key, which is saved inside the reader.</p></div></section>
<section class="card" id="wifi"><div class="cardhead"><span>◉ &nbsp; Wi-Fi Connection</span><span class="status" id="wifiStatus">Checking...</span></div><div class="cardbody"><div class="info"><b>Current network:</b> <span id="ssid">—</span><br><b>Router IP:</b> <span id="ip">—</span><br><b>AvilonX:</b> <span id="avilonxState">—</span><br><b>Device AP:</b> <span id="apName">RFID-READER</span> · 192.168.4.1</div><form id="wifiForm"><div class="field"><label for="network">Select a 2.4 GHz Wi-Fi network</label><select id="network" name="ssid" required><option value="">Scanning networks...</option></select></div><div class="field"><label for="password">Wi-Fi password</label><input id="password" name="password" type="password" autocomplete="new-password" placeholder="Password (blank for open Wi-Fi)"></div><div class="buttons"><button class="btn alt" type="button" id="scanBtn">↻ Scan Networks</button><button class="btn" type="submit">Save &amp; Connect</button></div></form><div class="message" id="message" role="status"></div><div class="divider"></div><h3 style="margin:12px 0 4px;font-size:16px">Reader hotspot settings</h3><p class="notice">Change the reader's own Wi-Fi name and password. This does not change the internet router connection or AvilonX registration.</p><form id="apForm"><div class="field"><label for="apSsidInput">Reader Wi-Fi name (SSID)</label><input id="apSsidInput" name="ap_ssid" maxlength="32" required placeholder="RFID-READER"></div><div class="field"><label for="apPasswordInput">New reader Wi-Fi password</label><input id="apPasswordInput" name="ap_password" type="password" minlength="8" maxlength="63" required autocomplete="new-password" placeholder="8–63 characters"></div><div class="field"><label for="apConfirmInput">Confirm new password</label><input id="apConfirmInput" type="password" minlength="8" maxlength="63" required autocomplete="new-password" placeholder="Repeat new password"></div><div class="buttons"><button class="btn" type="submit">Update Reader Hotspot</button></div></form><div class="message" id="apMessage" role="status"></div><p class="notice">After saving, the reader will restart. Reconnect your phone to the new hotspot name; the website address stays 192.168.4.1.</p><p class="notice">Forgot the reader hotspot name or password? Hold the reset button on D0 for 10 seconds. The reader restarts and the hotspot returns to RFID-READER / RFID12345. The saved router connection, AvilonX key and saved taps are kept.</p></div></section>
</div></div></main></div></div>
<script>
const $=id=>document.getElementById(id);let previousUID='',updating=false,scanning=false;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function statusBadge(el,label,good){el.textContent=label;el.className='status '+(good?'good':'bad');}
async function update(){if(updating)return;updating=true;try{const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)throw Error('offline');const s=await r.json();$('uid').textContent=s.last_uid;if($('rfidState')){$('rfidState').textContent=s.rfid_ok?('OK'+(s.rfid_restarts?' (restarted '+s.rfid_restarts+'x)':'')):'Not answering: check RC522 wiring and 3.3V';$('rfidState').className=s.rfid_ok?'ok':'bad';}$('reply').textContent=s.last_reply;$('mode').textContent=s.mode||'—';$('count').textContent=s.total_scans;$('pending').textContent=s.pending;$('serial').textContent=s.serial;$('topSerial').textContent=s.serial;$('clockState').textContent=(s.clock_synced?'clock is set from '+(s.clock_source==='ds1302'?'the DS1302 battery clock':'internet time')+', Philippine time '+s.reader_time:'clock NOT set yet (connect to the internet once)')+(s.clock_source==='ds1302_unset'?'. The DS1302 needs internet once to set its time':'')+(s.clock_source==='internet'?'. No DS1302 found: the time is lost if the reader is switched off':'');statusBadge($('keyStatus'),s.key_saved?'Key saved':'Not saved',s.key_saved);$('ssid').textContent=s.saved_ssid||'Not set';$('apName').textContent=s.ap_ssid||'RFID-READER';if(!document.activeElement||document.activeElement!==$('apSsidInput'))$('apSsidInput').placeholder=s.ap_ssid||'RFID-READER';$('ip').textContent=s.router_ip||'—';$('avilonxState').textContent=s.avilonx_online?'Online (the club can see this reader)':(s.wifi_connected?'Not reachable yet':'Offline (no internet)');statusBadge($('wifiStatus'),s.wifi_connected?'Connected':'Disconnected',s.wifi_connected);$('topOnline').textContent=s.wifi_connected?'Online':'Local only';$('dot').className='dot'+(s.wifi_connected?' on':'');if(!s.storage_ready)statusBadge($('readyBadge'),'Storage error',false);if(s.last_uid!==previousUID){previousUID=s.last_uid;const el=$('scannerCard');el.classList.remove('scanpulse');void el.offsetWidth;el.classList.add('scanpulse');}const wb=$('waiting');if(wb){const w=s.waiting||[];$('waitingBox').hidden=!w.length;wb.replaceChildren();w.forEach((x,i)=>{const tr=document.createElement('tr');[String(i+1),x.uid,x.time].forEach((v,k)=>{const td=document.createElement('td');td.textContent=v;if(k===1)td.className='tagcode';tr.appendChild(td);});wb.appendChild(tr);});}const body=$('history');body.replaceChildren();const items=s.history||[];$('recentCount').textContent='Latest '+items.length;if(!items.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=3;td.textContent='No scans yet';td.className='muted';tr.appendChild(td);body.appendChild(tr);}else{items.forEach((line,i)=>{const match=line.match(/^([^ ]+)\s+-\s+(.*)$/);const uid=match?match[1]:line;const reply=match?match[2]:'Pending';const tr=document.createElement('tr');[String(i+1),uid,reply].forEach((val,k)=>{const td=document.createElement('td');td.textContent=val;if(k===0){const span=document.createElement('span');span.className='num';span.textContent=val;td.replaceChildren(span);}if(k===1)td.className='tagcode';if(k===2)td.className='record';tr.appendChild(td);});body.appendChild(tr);});}}catch(e){$('topOnline').textContent='Offline';$('dot').className='dot';statusBadge($('wifiStatus'),'Reader unreachable',false);}finally{updating=false;}}
async function scanNetworks(){if(scanning)return;scanning=true;const btn=$('scanBtn'),select=$('network');btn.disabled=true;select.replaceChildren(new Option('Scanning networks...',''));try{let items=null;for(let i=0;i<15&&!items;i++){const r=await fetch('/api/networks',{cache:'no-store'});if(r.status===202){await wait(1000);continue;}if(!r.ok)throw Error('scan failed');items=await r.json();}if(!items)throw Error('scan timed out');select.replaceChildren(new Option('Choose a Wi-Fi network',''));items.forEach(n=>select.add(new Option(n.ssid+' ('+n.rssi+' dBm)'+(n.open?' - Open':''),n.ssid)));$('message').textContent=items.length?'':'No Wi-Fi networks found. Try again.';}catch(e){select.replaceChildren(new Option('Could not scan',''));$('message').textContent='Wi-Fi scan failed. Try again.';}finally{scanning=false;btn.disabled=false;}}
async function post(url,form,output){output.textContent='Saving...';try{const r=await fetch(url,{method:'POST',body:new URLSearchParams(new FormData(form))});output.textContent=await r.text();if(r.ok)update();}catch(e){output.textContent='Could not save. Check that you are connected to the reader hotspot.';}}
$('scanBtn').addEventListener('click',scanNetworks);$('copySerial').addEventListener('click',()=>{const text=$('serial').textContent;if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(()=>{$('copySerial').textContent='Copied';});else window.prompt('Copy device serial',text);});$('wifiForm').addEventListener('submit',e=>{e.preventDefault();post('/wifi/save',e.target,$('message')).then(()=>$('password').value='');});$('keyForm').addEventListener('submit',e=>{e.preventDefault();post('/device/save',e.target,$('keyMessage')).then(()=>$('key').value='');});$('apForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.target,output=$('apMessage'),pw=$('apPasswordInput').value;if(pw!==$('apConfirmInput').value){output.textContent='Passwords do not match.';return;}output.textContent='Saving hotspot credentials...';try{const r=await fetch('/ap/save',{method:'POST',body:new URLSearchParams(new FormData(form))});output.textContent=await r.text();if(r.ok){$('apPasswordInput').value='';$('apConfirmInput').value='';}}catch(err){output.textContent='Could not save; check your connection.';}});update();setInterval(update,1000);scanNetworks();
</script></body></html>
)HTML";

void addHistory(const String &line);
uint32_t readScanTime();
const char* clockSource();

// ---- OLED display -----------------------------------------------------------
// 128x64, 21 characters x 5 lines under a title bar. Found by itself at
// start-up (I2C address 0x3C or 0x3D); without one, nothing below does anything.
#if USE_OLED
  #if OLED_SH1106
    U8G2_SH1106_128X64_NONAME_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE, OLED_SCL_PIN, OLED_SDA_PIN);
  #else
    U8G2_SSD1306_128X64_NONAME_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE, OLED_SCL_PIN, OLED_SDA_PIN);
  #endif
#endif
bool oledOk = false;
enum ScreenEvent { EVENT_NONE, EVENT_TAP, EVENT_REPLY };
ScreenEvent screenEvent = EVENT_NONE;
String eventTag, eventNote, eventText;
bool eventGood = false;
unsigned long eventUntilMs = 0;
unsigned long bootScreenUntilMs = 0;
unsigned long lastDrawMs = 0;
bool screenDirty = true;
String lastShownProblem;
const unsigned long TAP_SCREEN_MS = 2500UL;
const unsigned long REPLY_SCREEN_MS = 5000UL;
const unsigned long PAGE_MS = 4000UL;   // status and "what is needed" take turns
bool rtcPresent = false;     // a DS1302 answered (set by beginRtc)
bool rtcValid = false;       // its time can be trusted (set by this sketch, still running)

void beginDisplay() {
#if USE_OLED
  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  uint8_t address = 0;
  for (uint8_t candidate : {0x3C, 0x3D}) {
    Wire.beginTransmission(candidate);
    if (Wire.endTransmission() == 0) { address = candidate; break; }
  }
  if (!address) { Serial.println(F("No OLED display found (optional): check SDA/SCL if you connected one.")); return; }
  oled.setI2CAddress(address * 2);
  oled.begin();
  oled.setBusClock(400000);
  oled.setFont(u8g2_font_6x10_tf);
  oledOk = true;
  Serial.printf("OLED display found at 0x%02X\n", address);
#endif
}

// A tag was tapped: show it (and whether it was saved) for a moment.
void showTap(const String &uid, const String &note) {
  eventTag = uid; eventNote = note; screenEvent = EVENT_TAP;
  eventUntilMs = millis() + TAP_SCREEN_MS; screenDirty = true;
}
// AvilonX answered (or refused): show its reply for a moment.
void showReply(const String &text, bool good) {
  eventText = text; eventGood = good; screenEvent = EVENT_REPLY;
  eventUntilMs = millis() + REPLY_SCREEN_MS; screenDirty = true;
}

#if USE_OLED
// Title bar: dark text on a light bar, with a short note on the right.
void drawTitle(const String &title, const String &right) {
  oled.setDrawColor(1); oled.drawBox(0, 0, 128, 12);
  oled.setDrawColor(0); oled.setFont(u8g2_font_6x10_tf);
  oled.drawStr(2, 10, title.substring(0, 21 - right.length()).c_str());
  if (right.length()) oled.drawStr(126 - oled.getStrWidth(right.c_str()), 10, right.c_str());
  oled.setDrawColor(1);
}
// One of the 5 lines under the title (0-4), cut to fit.
void drawLine(uint8_t line, const String &text) {
  oled.setFont(u8g2_font_6x10_tf);
  oled.drawStr(0, 23 + line * 10, text.substring(0, 21).c_str());
}
// Text wrapped on words over lines `first`..4.
void drawWrapped(uint8_t first, const String &text) {
  String rest = text; rest.trim();
  for (uint8_t line = first; line <= 4 && rest.length(); line++) {
    int cut = rest.length() <= 21 ? rest.length() : rest.lastIndexOf(' ', 21);
    if (cut <= 0) cut = min((int)rest.length(), 21);
    if (line == 4 && (int)rest.length() > cut) { drawLine(line, rest.substring(0, 20) + "~"); break; }
    drawLine(line, rest.substring(0, cut)); rest = rest.substring(cut); rest.trim();
  }
}
#endif

// What still needs doing, most important first (each 21 characters at most).
int neededItems(String *items, int room) {
  int n = 0;
  auto add = [&](const String &text) { if (n < room) items[n++] = text; };
  if (!rfidOk) { add(F("RFID reader NOT FOUND")); add(F(" check RC522 wiring")); }
  if (!storageReady) add(F("Storage error!"));
  if (!config.deviceKey[0]) { add(F("Device key: join")); add(String(" ") + config.apSsid); add(F(" open 192.168.4.1")); }
  if (!config.ssid[0]) { add(F("Wi-Fi not set: join")); add(String(" ") + config.apSsid); add(F(" open 192.168.4.1")); }
  else if (WiFi.status() != WL_CONNECTED) { add(F("No Wi-Fi: check the")); add(String(" router ") + config.ssid); }
  else if (config.deviceKey[0] && !avilonxReachable) add(F("AvilonX: no reply yet"));
  if (!readScanTime()) { add(F("Clock not set: needs")); add(F(" internet once")); }
  if (!rtcPresent) add(F("No DS1302 (optional)"));
  if (pendingCount + 10 >= MAX_SAVED_SCANS) add(F("Taps memory near full"));
  return n;
}

// Short Philippine time for the screen, e.g. "05:21:07 PM".
String shortTime(uint32_t utcSeconds) {
  time_t t = (time_t)utcSeconds + 8L * 3600L;
  struct tm *local = gmtime(&t);
  if (!local) return "";
  char label[16];
  strftime(label, sizeof(label), "%I:%M:%S %p", local);
  return String(label);
}

void updateDisplay() {
#if USE_OLED
  if (!oledOk) return;
  unsigned long now = millis();
  if (!screenDirty && (unsigned long)(now - lastDrawMs) < 500UL) return;  // redraw twice a second
  lastDrawMs = now; screenDirty = false;
  if (screenEvent != EVENT_NONE && (int32_t)(now - eventUntilMs) >= 0) screenEvent = EVENT_NONE;
  String waiting = "Q:" + String(pendingCount);
  oled.clearBuffer();
  if ((int32_t)(now - bootScreenUntilMs) < 0) {
    // Start-up: which modules were found.
    drawTitle(F("AvilonX " BOARD_NAME), F("CHECK"));
    drawLine(0, rfidOk ? F("RFID RC522: OK") : F("RFID RC522: NOT FOUND"));
    drawLine(1, !rtcPresent ? F("DS1302 clock: MISSING") : rtcValid ? F("DS1302 clock: OK") : F("DS1302 clock: not set"));
    drawLine(2, storageReady ? F("Storage   : OK") : F("Storage   : ERROR"));
    drawLine(3, config.ssid[0] ? String("Wi-Fi: ") + config.ssid : String(F("Wi-Fi     : not set")));
    drawLine(4, config.deviceKey[0] ? F("Device key: saved") : F("Device key: NOT SET"));
  } else if (screenEvent == EVENT_TAP) {
    drawTitle(F("TAG TAPPED"), waiting);
    oled.setFont(eventTag.length() <= 14 ? u8g2_font_9x15B_tf : u8g2_font_6x10_tf);
    oled.drawStr((128 - oled.getStrWidth(eventTag.c_str())) / 2, 32, eventTag.c_str());
    oled.setFont(u8g2_font_6x10_tf);
    String rest = eventNote;
    drawWrapped(3, rest);
  } else if (screenEvent == EVENT_REPLY) {
    drawTitle(F("AVILONX REPLY"), eventGood ? F("OK") : F("!!"));
    drawWrapped(0, eventText);
  } else {
    String found[10], items[14];
    int count = neededItems(found, 10), needed = 0;
    // Keep each message on one page: a message's next lines start with a space.
    for (int i = 0; i < count; i++) {
      int length = 1; while (i + length < count && found[i + length][0] == ' ') length++;
      if (needed % 5 + length > 5) while (needed % 5) items[needed++] = "";
      for (int k = 0; k < length; k++) items[needed++] = found[i + k];
      i += length - 1;
    }
    // Status and "what is needed" take turns (needed pages only when something is missing).
    int pages = 1 + (needed + 4) / 5, page = (now / PAGE_MS) % pages;
    if (page == 0) {
      String mode = lastMode == "clock" ? F("CLOCKING") : lastMode == "register" ? F("REGISTER") : F("AvilonX");
      drawTitle(mode, waiting);
      drawLine(0, rfidOk ? F("RFID   : ready, tap") : F("RFID   : NOT FOUND"));
      drawLine(1, !config.ssid[0] ? String(F("Wi-Fi  : not set")) : WiFi.status() == WL_CONNECTED ? String("Wi-Fi  : ") + config.ssid : String(F("Wi-Fi  : offline")));
      drawLine(2, !config.deviceKey[0] ? F("AvilonX: no key") : WiFi.status() != WL_CONNECTED ? F("AvilonX: waiting") : avilonxReachable ? F("AvilonX: online") : F("AvilonX: no reply"));
      drawLine(3, String("Waiting: ") + pendingCount + (pendingCount == 1 ? " tap" : " taps"));
      uint32_t t = readScanTime();
      drawLine(4, t ? shortTime(t) + " PHT" : String(F("Clock not set")));
    } else {
      drawTitle(F("WHAT IS NEEDED"), String(page) + "/" + String(pages - 1));
      for (int i = 0; i < 5; i++) { int at = (page - 1) * 5 + i; if (at < needed) drawLine(i, items[at]); }
    }
  }
  oled.sendBuffer();
#endif
}

// Each saved tap is written to a temporary file and then renamed, so a power
// cut while saving never damages taps saved earlier.
uint32_t scanChecksum(const StoredScan &item) {
  uint32_t h = 2166136261UL;
  const uint8_t *p = reinterpret_cast<const uint8_t *>(&item);
  for (size_t i = 0; i < offsetof(StoredScan, checksum); ++i) {
    h ^= p[i]; h *= 16777619UL;
  }
  return h;
}

String scanFile(uint32_t id) {
  char path[27];
  snprintf(path, sizeof(path), "/q/%010lu.bin", (unsigned long)id);
  return String(path);
}

// LittleFS lists only the file name, so add the folder back.
String queuePath(const String &name) {
  return name.startsWith("/") ? name : String(QUEUE_DIR) + "/" + name;
}

// Calls visit(path) for each file in the saved-taps folder (ESP8266 and ESP32
// list folders differently). visit returns false to stop early.
void eachQueueFile(std::function<bool(const String &)> visit) {
#if defined(ESP8266)
  Dir dir = LittleFS.openDir(QUEUE_DIR);
  while (dir.next()) { if (!visit(queuePath(dir.fileName()))) return; }
#else
  File root = LittleFS.open(QUEUE_DIR);
  if (!root || !root.isDirectory()) return;
  for (File f = root.openNextFile(); f; f = root.openNextFile()) {
    String name = f.name();
    bool folder = f.isDirectory();
    f.close();
    if (!folder && !visit(queuePath(name))) return;
  }
#endif
}

bool loadScanFile(const String &path, StoredScan &item) {
  File f = LittleFS.open(path, "r");
  if (!f) return false;
  bool good = f.size() == sizeof(item) && f.readBytes(
      reinterpret_cast<char *>(&item), sizeof(item)) == sizeof(item);
  f.close();
  return good && item.magic == SCAN_MAGIC && item.uid[24] == '\0' &&
         item.checksum == scanChecksum(item);
}

void initializeQueue() {
#if defined(ESP32)
  storageReady = LittleFS.begin(true);  // formats the first time
#else
  storageReady = LittleFS.begin();
#endif
  if (!storageReady) {
    Serial.println(F("ERROR: LittleFS unavailable. Cannot save taps."));
    lastReply = "STORAGE ERROR: taps cannot be saved";
    return;
  }
  if (!LittleFS.exists(QUEUE_DIR)) LittleFS.mkdir(QUEUE_DIR);
  // Keep the tap numbers increasing across restarts, also after the queue empties.
  File seq = LittleFS.open("/nextid", "r");
  if (seq) {
    String n = seq.readStringUntil('\n');
    uint32_t stored = (uint32_t)strtoul(n.c_str(), nullptr, 10);
    if (stored > 0) nextScanId = stored;
    seq.close();
  }
  pendingCount = 0;
  String unfinished[8];  // removed after the walk (not while listing the folder)
  int unfinishedCount = 0;
  eachQueueFile([&](const String &path) {
    if (path.endsWith(".tmp")) { if (unfinishedCount < 8) unfinished[unfinishedCount++] = path; return true; }  // unfinished save from a power cut
    StoredScan item;
    if (loadScanFile(path, item)) {
      ++pendingCount;
      if (item.id >= nextScanId) nextScanId = item.id + 1;
    } else {
      Serial.print(F("Warning: unreadable saved tap: ")); Serial.println(path);
    }
    return true;
  });
  for (int i = 0; i < unfinishedCount; i++) LittleFS.remove(unfinished[i]);
  Serial.printf("Saved taps waiting to send: %u\n", pendingCount);
}

// Philippine time (Asia/Manila, UTC+8, no daylight saving) for the reader's
// page, e.g. "Nov 18, 2026 11:05:03 AM PHT". Times sent to AvilonX stay in UTC.
const long MANILA_OFFSET_SECONDS = 8L * 3600L;
String manilaTime(uint32_t utcSeconds) {
  time_t t = (time_t)utcSeconds + MANILA_OFFSET_SECONDS;
  struct tm *local = gmtime(&t);
  if (!local) return "";
  char label[32];
  strftime(label, sizeof(label), "%b %d, %Y %I:%M:%S %p PHT", local);
  return String(label);
}

// ---- DS1302 battery-backed clock (3-wire CLK/DAT/RST), kept in UTC --------
bool settingClockFromRtc = false;
volatile bool internetTimeArrived = false;
const uint8_t RTC_RAM_MARK = 0xA5;  // stored in DS1302 RAM once its time is set

uint8_t bcdToDec(uint8_t v) { return (v >> 4) * 10 + (v & 0x0F); }
uint8_t decToBcd(uint8_t v) { return ((v / 10) << 4) | (v % 10); }

// Days since 1970-01-01 for a calendar date, and back (no time zones involved).
int32_t daysFromCivil(int y, unsigned m, unsigned d) {
  y -= m <= 2;
  const int era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = (unsigned)(y - era * 400);
  const unsigned doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + (int32_t)doe - 719468;
}
void civilFromDays(int32_t z, int &y, unsigned &m, unsigned &d) {
  z += 719468;
  const int32_t era = (z >= 0 ? z : z - 146096) / 146097;
  const unsigned doe = (unsigned)(z - era * 146097);
  const unsigned yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  const unsigned doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  const unsigned mp = (5 * doy + 2) / 153;
  d = doy - (153 * mp + 2) / 5 + 1;
  m = mp < 10 ? mp + 3 : mp - 9;
  y = (int)yoe + era * 400 + (m <= 2);
}

// DS1302 3-wire bus: bytes go least-significant bit first, written on the
// rising clock edge; when reading, the chip puts each bit out on the falling edge.
void ds1302Begin() { digitalWrite(RTC_CLK_PIN, LOW); digitalWrite(RTC_RST_PIN, HIGH); delayMicroseconds(4); }
void ds1302End() { digitalWrite(RTC_RST_PIN, LOW); delayMicroseconds(4); }
void ds1302WriteByte(uint8_t value) {
  pinMode(RTC_DAT_PIN, OUTPUT);
  for (uint8_t i = 0; i < 8; i++) {
    digitalWrite(RTC_DAT_PIN, value & 1); value >>= 1;
    delayMicroseconds(1); digitalWrite(RTC_CLK_PIN, HIGH);
    delayMicroseconds(1); digitalWrite(RTC_CLK_PIN, LOW);
  }
}
uint8_t ds1302ReadByte() {
  pinMode(RTC_DAT_PIN, INPUT);
  uint8_t value = 0;
  for (uint8_t i = 0; i < 8; i++) {
    delayMicroseconds(1);
    if (digitalRead(RTC_DAT_PIN)) value |= (1 << i);
    digitalWrite(RTC_CLK_PIN, HIGH); delayMicroseconds(1);
    digitalWrite(RTC_CLK_PIN, LOW);
  }
  return value;
}
void ds1302WriteRegister(uint8_t command, uint8_t value) { ds1302Begin(); ds1302WriteByte(command); ds1302WriteByte(value); ds1302End(); }
uint8_t ds1302ReadRegister(uint8_t command) { ds1302Begin(); ds1302WriteByte(command); uint8_t v = ds1302ReadByte(); ds1302End(); return v; }

// Reads the DS1302 as seconds since 1970 (UTC). False when it cannot be read.
bool rtcRead(uint32_t &unixUtc) {
  uint8_t r[7];
  ds1302Begin(); ds1302WriteByte(0xBF);      // clock burst read
  for (uint8_t i = 0; i < 7; i++) r[i] = ds1302ReadByte();
  ds1302End();
  if (r[0] & 0x80) return false;             // clock halted
  uint8_t sec = bcdToDec(r[0] & 0x7F), min = bcdToDec(r[1] & 0x7F), hour;
  if (r[2] & 0x80) hour = bcdToDec(r[2] & 0x1F) % 12 + ((r[2] & 0x20) ? 12 : 0);  // 12-hour mode
  else hour = bcdToDec(r[2] & 0x3F);
  uint8_t day = bcdToDec(r[3] & 0x3F), month = bcdToDec(r[4] & 0x1F);
  int fullYear = 2000 + bcdToDec(r[6]);
  if (sec > 59 || min > 59 || hour > 23 || day < 1 || day > 31 || month < 1 || month > 12 || fullYear < 2024) return false;
  unixUtc = (uint32_t)(daysFromCivil(fullYear, month, day) * 86400L + hour * 3600L + min * 60L + sec);
  return true;
}

// Sets the DS1302 (UTC, 24-hour, clock running) and marks it as set.
void rtcWrite(uint32_t unixUtc) {
  int32_t days = (int32_t)(unixUtc / 86400UL);
  uint32_t rest = unixUtc % 86400UL;
  int y; unsigned m, d;
  civilFromDays(days, y, m, d);
  if (y < 2000 || y > 2099) return;
  ds1302WriteRegister(0x8E, 0x00);           // allow writes
  ds1302WriteRegister(0x90, 0x00);           // trickle charger off (never charge a CR2032)
  ds1302Begin(); ds1302WriteByte(0xBE);      // clock burst write: 7 time registers + control
  ds1302WriteByte(decToBcd(rest % 60));      // seconds, clock-halt bit 0 = running
  ds1302WriteByte(decToBcd((rest / 60) % 60));
  ds1302WriteByte(decToBcd(rest / 3600));
  ds1302WriteByte(decToBcd(d));
  ds1302WriteByte(decToBcd(m));
  ds1302WriteByte(decToBcd(((days + 4) % 7) + 1));  // 1970-01-01 was a Thursday
  ds1302WriteByte(decToBcd(y - 2000));
  ds1302WriteByte(0x00);                     // control: writes stay allowed
  ds1302End();
  ds1302WriteRegister(0xC0, RTC_RAM_MARK);   // RAM byte 0
  uint32_t check = 0;
  rtcValid = rtcRead(check) && (check + 2 >= unixUtc) && (check <= unixUtc + 2);
}

// The DS1302 has no address to ask, so check it is there by writing a test
// value to one of its RAM bytes and reading it back.
bool ds1302Detect() {
  ds1302WriteRegister(0x8E, 0x00);
  ds1302WriteRegister(0xC2, 0x5A);
  if (ds1302ReadRegister(0xC3) != 0x5A) return false;
  ds1302WriteRegister(0xC2, 0xC3);
  return ds1302ReadRegister(0xC3) == 0xC3;
}

// Called whenever the clock is set from the internet (NTP).
void onClockSet() {
  if (!settingClockFromRtc) internetTimeArrived = true;
}
#if defined(ESP32)
void onSntpSync(struct timeval *) { onClockSet(); }
#endif

void beginRtc() {
  pinMode(RTC_RST_PIN, OUTPUT); digitalWrite(RTC_RST_PIN, LOW);
  pinMode(RTC_CLK_PIN, OUTPUT); digitalWrite(RTC_CLK_PIN, LOW);
  pinMode(RTC_DAT_PIN, INPUT);
  rtcPresent = ds1302Detect();
  if (!rtcPresent) { Serial.println(F("No DS1302 found: using internet time only.")); return; }
  uint32_t now = 0;
  // The RAM mark is lost, and the clock halts, when the battery is flat or removed.
  rtcValid = ds1302ReadRegister(0xC1) == RTC_RAM_MARK && rtcRead(now);
  if (rtcValid) {
    timeval tv = { (time_t)now, 0 };
    settingClockFromRtc = true; settimeofday(&tv, nullptr); settingClockFromRtc = false;
    Serial.print(F("Clock set from DS1302: ")); Serial.println(manilaTime(now));
  } else {
    Serial.println(F("DS1302 has no valid time yet: connect to the internet once to set it."));
  }
}

// Copies internet time into the DS1302 after each NTP sync (about hourly).
void keepRtcInStep() {
  if (!internetTimeArrived) return;
  internetTimeArrived = false;
  time_t t = time(nullptr);
  if (rtcPresent && t >= 1700000000) {
    rtcWrite((uint32_t)t);
    Serial.println(F("DS1302 set from internet time."));
  }
}

// Tap time in seconds since 1970 (UTC): from the DS1302 when it is valid,
// otherwise from internet time kept since power-up. 0 = time unknown.
uint32_t readScanTime() {
  uint32_t t = 0;
  if (rtcPresent && rtcValid && rtcRead(t)) return t;
  time_t now = time(nullptr);
  return now >= 1700000000 ? (uint32_t)now : 0;
}

const char* clockSource() {
  if (rtcPresent && rtcValid) return "ds1302";
  if (rtcPresent) return "ds1302_unset";
  return time(nullptr) >= 1700000000 ? "internet" : "none";
}

// True when this tag is already saved and waiting to be sent.
bool isAlreadySaved(const String &uid) {
  if (!storageReady || pendingCount == 0) return false;
  bool found = false;
  eachQueueFile([&](const String &path) {
    if (path.endsWith(".tmp")) return true;
    StoredScan item;
    if (loadScanFile(path, item) && uid == item.uid) { found = true; return false; }
    return true;
  });
  return found;
}

bool saveScan(const String &uid) {
  if (!storageReady || pendingCount >= MAX_SAVED_SCANS) return false;
  StoredScan item = {};
  item.magic = SCAN_MAGIC;
  item.id = nextScanId;
  item.scannedAtUtc = readScanTime();
  uid.toCharArray(item.uid, sizeof(item.uid));
  item.checksum = scanChecksum(item);
  String dest = scanFile(item.id);
  String tmp = dest + ".tmp";
  File file = LittleFS.open(tmp, "w");
  if (!file) return false;
  bool wrote = file.write(reinterpret_cast<const uint8_t *>(&item), sizeof(item)) == sizeof(item);
  file.flush();
  file.close();
  if (!wrote || !LittleFS.rename(tmp, dest)) {
    LittleFS.remove(tmp);
    return false;
  }
  ++nextScanId;
  ++pendingCount;
  File seq = LittleFS.open("/nextid", "w");
  if (seq) { seq.println(nextScanId); seq.close(); }
  if (item.scannedAtUtc) {
    addHistory(uid + " - saved " + manilaTime(item.scannedAtUtc));
  } else {
    addHistory(uid + " - saved (clock not set)");
  }
  return true;
}

// Finds the oldest saved tap, whatever order the folder lists them in.
bool oldestScan(String &path, StoredScan &item) {
  if (!storageReady || pendingCount == 0) return false;
  bool found = false;
  eachQueueFile([&](const String &candidatePath) {
    if (candidatePath.endsWith(".tmp")) return true;
    StoredScan candidate;
    if (loadScanFile(candidatePath, candidate) &&
        (!found || candidate.id < item.id)) {
      found = true; item = candidate; path = candidatePath;
    }
    return true;
  });
  return found;
}

String jsonEscape(const String &source) {
  String out;
  out.reserve(source.length() + 8);
  for (size_t i = 0; i < source.length(); i++) {
    char c = source[i];
    if (c == '"' || c == '\\') { out += '\\'; out += c; }
    else if (c == '\n') out += F("\\n");
    else if (c == '\r') out += F("\\r");
    else if ((uint8_t)c < 32) out += ' ';
    else out += c;
  }
  return out;
}

// Reads a string field from a small JSON reply without a JSON library.
// AvilonX replies like {"status": "accepted", "message": "..."}: spaces may
// follow the colon, so they are skipped.
String jsonField(const String &body, const char *name) {
  String marker = String("\"") + name + "\"";
  int start = body.indexOf(marker);
  if (start < 0) return "";
  start += marker.length();
  while (start < (int)body.length() && (body[start] == ' ' || body[start] == '\t' || body[start] == '\n' || body[start] == '\r')) start++;
  if (start >= (int)body.length() || body[start] != ':') return "";
  start++;
  while (start < (int)body.length() && (body[start] == ' ' || body[start] == '\t' || body[start] == '\n' || body[start] == '\r')) start++;
  if (start >= (int)body.length() || body[start] != '"') return "";
  start++;
  String out;
  for (int i = start; i < (int)body.length(); i++) {
    char c = body[i];
    if (c == '\\' && i + 1 < (int)body.length()) { out += body[++i]; continue; }
    if (c == '"') break;
    out += c;
  }
  return out;
}

// Keeps only hex letters and digits, uppercased (keys may be pasted with spaces).
String cleanHex(const String &value) {
  String out;
  for (size_t i = 0; i < value.length(); i++) {
    char c = toupper(value[i]);
    if ((c >= '0' && c <= '9') || (c >= 'A' && c <= 'F')) out += c;
  }
  return out;
}

void setDefaultApCredentials() {
  memset(config.apSsid, 0, sizeof(config.apSsid));
  memset(config.apPassword, 0, sizeof(config.apPassword));
  strncpy(config.apSsid, DEFAULT_AP_NAME, sizeof(config.apSsid) - 1);
  strncpy(config.apPassword, DEFAULT_AP_PASSWORD, sizeof(config.apPassword) - 1);
}

void loadSettings() {
  EEPROM.get(0, config);
  if (config.magic == SETTINGS_MAGIC_V1) {
    config.deviceKey[0] = '\0'; // the first sketch stored only the router Wi-Fi
    setDefaultApCredentials();
    config.magic = SETTINGS_MAGIC;
  } else if (config.magic == SETTINGS_MAGIC_V2) {
    setDefaultApCredentials(); // keep the router Wi-Fi and the device key
    config.magic = SETTINGS_MAGIC;
  } else if (config.magic != SETTINGS_MAGIC) {
    memset(&config, 0, sizeof(config));
    config.magic = SETTINGS_MAGIC;
    setDefaultApCredentials();
  }
  config.ssid[sizeof(config.ssid) - 1] = '\0';
  config.password[sizeof(config.password) - 1] = '\0';
  config.deviceKey[sizeof(config.deviceKey) - 1] = '\0';
  config.apSsid[sizeof(config.apSsid) - 1] = '\0';
  config.apPassword[sizeof(config.apPassword) - 1] = '\0';
  if (!config.apSsid[0] || strlen(config.apPassword) < 8) setDefaultApCredentials();
}

void storeSettings() {
  config.magic = SETTINGS_MAGIC;
  EEPROM.put(0, config);
  if (!EEPROM.commit()) Serial.println(F("ERROR: Could not save settings"));
}

void restoreDefaultApOnly() {
  // Does not touch config.ssid, config.password or config.deviceKey.
  setDefaultApCredentials();
  storeSettings();
}

void beginRouterConnection() {
  if (config.ssid[0] == '\0') return;
  WiFi.begin(config.ssid, config.password);
  lastReconnectAttempt = millis();
  // Reconnecting runs in the background: tags are read and saved meanwhile.
  // While offline, say so every 5 minutes instead of every 30-second try.
  if (wifiLostAt == 0) {
    Serial.print(F("Connecting to Wi-Fi: ")); Serial.println(config.ssid);
  } else if (lastWifiNoticeMs == 0 || (unsigned long)(millis() - lastWifiNoticeMs) >= 300000UL) {
    lastWifiNoticeMs = millis();
    Serial.print(F("No Wi-Fi \"")); Serial.print(config.ssid); Serial.print(F("\" for "));
    Serial.print((millis() - wifiLostAt) / 60000UL); Serial.print(F(" min. Tags are still read and saved ("));
    Serial.print(pendingCount); Serial.println(F(" waiting to send). Trying again every 30 seconds."));
  }
}

void blink(int times) {
  ledIsOn = false;
  if (USE_STATUS_LED) digitalWrite(STATUS_LED_PIN, !STATUS_LED_ON);
  ledTogglesRemaining = (uint8_t)(times * 2);
  ledNextMs = millis();
}

void updateLED() {
  if (!ledTogglesRemaining || (int32_t)(millis() - ledNextMs) < 0) return;
  ledIsOn = !ledIsOn;
  if (USE_STATUS_LED) digitalWrite(STATUS_LED_PIN, ledIsOn ? STATUS_LED_ON : !STATUS_LED_ON);
  --ledTogglesRemaining;
  ledNextMs = millis() + (ledIsOn ? 65UL : 80UL);
}

void addHistory(const String &line) {
  history[historyNext] = line;
  historyNext = (historyNext + 1) % HISTORY_SIZE;
  if (historyCount < HISTORY_SIZE) historyCount++;
}

void handleStatus() {
  String result = F("{\"last_uid\":\"");
  result += jsonEscape(lastUID);
  result += F("\",\"last_reply\":\"");
  result += jsonEscape(lastReply);
  result += F("\",\"mode\":\"");
  result += lastMode == "clock" ? F("Clocking") : lastMode == "register" ? F("Register") : F("");
  result += F("\",\"total_scans\":");
  result += String(totalScans);
  result += F(",\"rfid_ok\":");
  result += rfidOk ? F("true") : F("false");
  result += F(",\"rfid_restarts\":");
  result += String(rfidRestarts);
  result += F(",\"pending\":");
  result += String(pendingCount);
  result += F(",\"clock_synced\":");
  result += readScanTime() ? F("true") : F("false");
  result += F(",\"clock_source\":\"");
  result += clockSource();
  result += F("\",\"reader_time\":\"");
  if (readScanTime()) result += manilaTime(readScanTime());
  result += F("\",\"storage_ready\":");
  result += storageReady ? F("true") : F("false");
  result += F(",\"serial\":\"");
  result += deviceSerial;
  result += F("\",\"key_saved\":");
  result += (config.deviceKey[0] ? F("true") : F("false"));
  result += F(",\"avilonx_online\":");
  result += avilonxReachable ? F("true") : F("false");
  result += F(",\"wifi_connected\":");
  result += (WiFi.status() == WL_CONNECTED ? F("true") : F("false"));
  result += F(",\"ap_ssid\":\"");
  result += jsonEscape(String(config.apSsid));
  result += F("\",\"saved_ssid\":\"");
  result += jsonEscape(String(config.ssid));
  result += F("\",\"router_ip\":\"");
  if (WiFi.status() == WL_CONNECTED) result += WiFi.localIP().toString();
  // Saved taps still waiting to be sent, read from flash (kept through restarts).
  result += F("\",\"waiting\":[");
  if (storageReady && pendingCount > 0) {
    struct Waiting { uint32_t id; uint32_t at; char uid[25]; } list[20];
    int count = 0;
    eachQueueFile([&](const String &path) {
      if (path.endsWith(".tmp")) return true;
      StoredScan item;
      if (!loadScanFile(path, item)) return true;
      // Keep the 20 oldest (sent first).
      int at = count < 20 ? count++ : -1;
      if (at < 0) { int newest = 0; for (int i = 1; i < 20; i++) if (list[i].id > list[newest].id) newest = i; if (item.id >= list[newest].id) return true; at = newest; }
      list[at].id = item.id; list[at].at = item.scannedAtUtc; strncpy(list[at].uid, item.uid, sizeof(list[at].uid));
      return true;
    });
    for (int i = 0; i < count; i++) for (int j = i + 1; j < count; j++) if (list[j].id < list[i].id) { Waiting t = list[i]; list[i] = list[j]; list[j] = t; }
    for (int i = 0; i < count; i++) {
      if (i) result += ',';
      result += F("{\"uid\":\""); result += jsonEscape(String(list[i].uid));
      result += F("\",\"time\":\""); result += list[i].at ? manilaTime(list[i].at) : String(F("clock not set"));
      result += F("\"}");
    }
  }
  result += F("],\"history\":[");
  for (int i = 0; i < historyCount; i++) {
    if (i) result += ',';
    int pos = (historyNext - 1 - i + HISTORY_SIZE) % HISTORY_SIZE;
    result += '"'; result += jsonEscape(history[pos]); result += '"';
  }
  result += F("]}");
  server.send(200, "application/json", result);
}

bool isOpenNetwork(int i) {
#if defined(ESP8266)
  return WiFi.encryptionType(i) == ENC_TYPE_NONE;
#else
  return WiFi.encryptionType(i) == WIFI_AUTH_OPEN;
#endif
}

void handleNetworks() {
  // The scan runs in the background so RFID reading is not paused. The page
  // asks again while the reply is 202 (still scanning).
  int n = WiFi.scanComplete();
  if (n == WIFI_SCAN_FAILED) {
    WiFi.scanNetworks(true);
    server.send(202, "application/json", "{\"scanning\":true}");
    return;
  }
  if (n == WIFI_SCAN_RUNNING) {
    server.send(202, "application/json", "{\"scanning\":true}");
    return;
  }
  String result = "[";
  int added = 0;
  for (int i = 0; i < n; i++) {
    String ssid = WiFi.SSID(i);
    if (ssid.length() == 0) continue;
    if (added++) result += ',';
    result += F("{\"ssid\":\""); result += jsonEscape(ssid);
    result += F("\",\"rssi\":"); result += String(WiFi.RSSI(i));
    result += F(",\"open\":");
    result += (isOpenNetwork(i) ? F("true}") : F("false}"));
  }
  result += ']';
  WiFi.scanDelete();
  server.send(200, "application/json", result);
}

void handleWifiSave() {
  String ssid = server.arg("ssid");
  String password = server.arg("password");
  if (ssid.isEmpty() || ssid.length() > 32 || password.length() > 64 ||
      (password.length() != 0 && password.length() < 8)) {
    server.send(400, "text/plain", "Invalid Wi-Fi name or password (WPA passwords must be at least 8 characters).");
    return;
  }
  memset(config.ssid, 0, sizeof(config.ssid));
  memset(config.password, 0, sizeof(config.password));
  ssid.toCharArray(config.ssid, sizeof(config.ssid));
  password.toCharArray(config.password, sizeof(config.password));
  storeSettings();
  server.send(200, "text/plain", "Wi-Fi saved. Connecting to " + ssid + ". Check the status in a few seconds.");
  beginRouterConnection();
}

void handleApSave() {
  String ssid = server.arg("ap_ssid");
  String password = server.arg("ap_password");
  // WPA2 hotspot password must be 8-63 characters; SSID up to 32 bytes.
  if (ssid.length() < 1 || ssid.length() > 32 ||
      password.length() < 8 || password.length() > 63) {
    server.send(400, "text/plain", "SSID must be 1-32 bytes; hotspot password must be 8-63 characters.");
    return;
  }
  memset(config.apSsid, 0, sizeof(config.apSsid));
  memset(config.apPassword, 0, sizeof(config.apPassword));
  ssid.toCharArray(config.apSsid, sizeof(config.apSsid));
  password.toCharArray(config.apPassword, sizeof(config.apPassword));
  storeSettings();
  server.send(200, "text/plain", "Reader hotspot saved. Device will restart; reconnect to your new Wi-Fi name. Router and AvilonX settings are kept.");
  restartAfterApChange = true;
  apChangeRestartAt = millis() + 2000UL;
}

void handleDeviceSave() {
  String key = cleanHex(server.arg("key"));
  if (key.length() != 32) {
    server.send(400, "text/plain", "The device key has 32 letters and numbers. Copy it again from AvilonX.");
    return;
  }
  memset(config.deviceKey, 0, sizeof(config.deviceKey));
  key.toCharArray(config.deviceKey, sizeof(config.deviceKey));
  storeSettings();
  lastReply = "Key saved. Tap a tag to test.";
  lastSendAttempt = 0;  // send any saved taps now
  server.send(200, "text/plain", "Device key saved. Tap a tag: the AvilonX reply appears above.");
}

// Sends one saved tap. SEND_ANSWERED means AvilonX gave a definite answer
// (clocked, duplicate, or refused): the tap is then removed so it cannot block
// the taps after it. SEND_RETRY means no internet, server busy or no key yet:
// the tap stays saved and is tried again later.
// Tells AvilonX the reader is online. Returns true when AvilonX answered.
bool sendHeartbeat() {
  if (!config.deviceKey[0] || WiFi.status() != WL_CONNECTED) return false;
  SecureClient client;
  client.setInsecure();  // see sendTag(): the device key proves who is calling
  HTTPClient http;
  http.setTimeout(5000);
  if (!http.begin(client, String(SUPABASE_URL) + "/rest/v1/rpc/device_rfid_heartbeat")) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_KEY);
  String body = String("{\"p_serial\":\"") + deviceSerial + "\",\"p_key\":\"" + config.deviceKey + "\",\"p_pending\":" + String(pendingCount)
              + ",\"p_clock\":\"" + clockSource() + "\",\"p_firmware\":\"" + FIRMWARE_VERSION + "\"}";
  int code = http.POST(body);
  String reply = code > 0 ? http.getString() : "";
  http.end();
  avilonxReachable = code >= 200 && code < 300;
  if (avilonxReachable) {
    String mode = jsonField(reply, "mode");
    if (mode.length()) lastMode = mode;
  } else if (code == 401 || code == 403) {
    String text = jsonField(reply, "message");
    if (text.length()) lastReply = text;
  }
  return avilonxReachable;
}

void keepOnline() {
  bool connected = WiFi.status() == WL_CONNECTED;
  if (!connected) { avilonxReachable = false; wasWifiConnected = false; return; }
  bool justConnected = !wasWifiConnected;
  wasWifiConnected = true;
  if (justConnected || lastHeartbeatMs == 0 || (unsigned long)(millis() - lastHeartbeatMs) >= HEARTBEAT_MS) {
    lastHeartbeatMs = millis();
    sendHeartbeat();
  }
}

SendResult sendTag(const StoredScan &scan) {
  String uid = String(scan.uid);
  if (!config.deviceKey[0]) {
    lastReply = "Save the device key from AvilonX first. Taps are kept until then.";
    return SEND_RETRY;
  }
  SecureClient client;
  // The reader does not check Supabase's certificate (an ESP8266 cannot keep
  // the certificate list up to date). The device key, not the connection,
  // proves which reader is calling.
  client.setInsecure();
  HTTPClient http;
  // Sending pauses tag reading briefly; saved taps are never lost.
  http.setTimeout(5000);
  if (!http.begin(client, String(SUPABASE_URL) + "/rest/v1/rpc/device_rfid_scan")) {
    lastReply = "Could not reach AvilonX. Will retry.";
    return SEND_RETRY;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_KEY);
  String body = String("{\"p_serial\":\"") + deviceSerial + "\",\"p_key\":\"" + config.deviceKey + "\",\"p_tag\":\"" + uid + "\"";
  if (RPC_SUPPORTS_SCANNED_AT && scan.scannedAtUtc) {
    time_t t = scan.scannedAtUtc;
    struct tm *utc = gmtime(&t);
    char stamp[26];
    if (utc) {
      strftime(stamp, sizeof(stamp), "%Y-%m-%dT%H:%M:%SZ", utc);
      body += String(",\"p_scanned_at\":\"") + stamp + "\"";
    }
  }
  body += "}";
  int code = http.POST(body);
  String reply = code > 0 ? http.getString() : "";
  http.end();

  if (code <= 0 || code >= 500 || code == 404 || code == 408 || code == 429) {
    // No internet, server busy or AvilonX not set up yet: keep the tap.
    lastReply = code <= 0 ? "No internet. Taps are saved and will be sent." : "AvilonX is not ready (code " + String(code) + "). Will retry.";
    return SEND_RETRY;
  }
  String text = jsonField(reply, "message");
  if (text.isEmpty()) text = "AvilonX replied with code " + String(code) + ": " + reply.substring(0, 160);
  String status = jsonField(reply, "status");
  String mode = jsonField(reply, "mode");
  if (mode.length()) lastMode = mode;
  bool good = code < 300 && (status == "accepted" || status == "sent");
  // Reader not registered, wrong device key or wrong API key (401/403): keep
  // the taps so they are still sent once the registration is fixed.
  if (code == 401 || code == 403) {
    lastReply = text + " Taps are kept.";
    if (lastShownProblem != text) { lastShownProblem = text; showReply(text + " Taps are kept.", false); }
    return SEND_RETRY;
  }
  lastShownProblem = "";
  lastReply = text;
  showReply(text, good);
  addHistory(uid + "  -  " + text);
  Serial.print(F("AvilonX: ")); Serial.println(text);
  blink(good ? 1 : 3);
  return SEND_ANSWERED;
}

void sendPending() {
  if (pendingCount == 0 || !storageReady || WiFi.status() != WL_CONNECTED) return;
  if (lastSendAttempt && millis() - lastSendAttempt < sendWaitMs) return;
  lastSendAttempt = millis();
  String path;
  StoredScan scan = {};
  if (!oldestScan(path, scan)) {
    lastReply = "Saved taps could not be read; check the Serial Monitor.";
    sendWaitMs = SEND_RETRY_MS;
    return;
  }
  if (sendTag(scan) == SEND_RETRY) {
    sendWaitMs = SEND_RETRY_MS;
    return;
  }
  sendWaitMs = SEND_NEXT_MS;
  avilonxReachable = true;
  lastHeartbeatMs = millis();
  if (LittleFS.remove(path)) {
    --pendingCount;
  } else {
    lastReply = "AvilonX answered, but the saved tap could not be removed.";
  }
}

// True when the RC522 answers with a known chip version (0x00 / 0xFF = no answer).
bool rfidAnswers() {
  byte version = reader.PCD_ReadRegister(MFRC522::VersionReg);
  return version != 0x00 && version != 0xFF;
}

// Hard-resets the RC522 (RST pin) and sets it up again, with the library's
// normal settings. Tries a few times.
bool startRfidReader(const char *why) {
  for (int attempt = 0; attempt < 3; attempt++) {
    if (RFID_RST_PIN != NO_PIN) {
      pinMode(RFID_RST_PIN, OUTPUT);
      digitalWrite(RFID_RST_PIN, LOW);
      delay(10);
      digitalWrite(RFID_RST_PIN, HIGH);
      delay(50);
    }
    reader.PCD_Init();  // without an RST pin: a reset command
    if (rfidAnswers()) {
      rfidOk = true;
      lastRfidActivityMs = millis();
      if (why && why[0]) { Serial.print(F("RFID reader restarted: ")); Serial.println(why); }
      return true;
    }
    delay(100);
  }
  rfidOk = false;
  Serial.println(F("RFID reader is not answering. Check the RC522 wiring and its 3.3V power."));
  lastReply = "RFID reader not answering: check the RC522 wiring and 3.3V power";
  return false;
}

// Keeps the reader working without restarting the board.
void watchRfidReader() {
  unsigned long now = millis();
  if ((unsigned long)(now - lastRfidCheckMs) < RFID_CHECK_MS) return;
  lastRfidCheckMs = now;
  // Only when the reader stopped answering: reset it (the board keeps running).
  if (!rfidAnswers()) {
    rfidRestarts++;
    startRfidReader("it stopped answering");
  } else if (!rfidOk) {
    rfidOk = true;
  }
}

void readRFID() {
  if (!reader.PICC_IsNewCardPresent()) return;
  if (!reader.PICC_ReadCardSerial()) return;
  lastRfidActivityMs = millis();

  String uid;
  for (byte i = 0; i < reader.uid.size; i++) {
    if (reader.uid.uidByte[i] < 0x10) uid += '0';
    uid += String(reader.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();

  // Short guard against the same tag read twice in a row; other tags count at once.
  unsigned long now = millis();
  if (uid != lastSeenUID || (unsigned long)(now - lastSeenMs) >= SAME_TAG_GUARD_MS) {
    lastUID = uid;
    lastSeenUID = uid;
    lastSeenMs = now;
    totalScans++;
    Serial.print(F("Tag: ")); Serial.println(uid);
    if (isAlreadySaved(uid)) {
      // Each tag is saved once: the first tap (and its time) is the one sent.
      lastReply = "Tag already saved; waiting to send. Not saved again.";
      addHistory(uid + " - already saved, not saved again");
      showTap(uid, F("Already saved, waiting to send"));
    } else if (saveScan(uid)) {
      lastSendAttempt = 0;
      lastReply = readScanTime()
          ? (WiFi.status() == WL_CONNECTED ? "Saved; sending to AvilonX" : "Saved; will send when the internet is back")
          : "Saved, but the clock is not set: AvilonX will use the time it receives it";
      showTap(uid, !readScanTime() ? F("Saved. Clock not set!") : WiFi.status() == WL_CONNECTED ? F("Saved. Sending to AvilonX...") : F("Saved. No internet: sent later"));
    } else {
      lastReply = "SAVE FAILED / STORAGE FULL - this tap was not saved";
      addHistory(uid + " - SAVE FAILED");
      showTap(uid, F("NOT SAVED: storage full or error"));
      blink(3);
    }
  }
  reader.PICC_HaltA();
  reader.PCD_StopCrypto1();
}

void checkResetButton() {
  if (digitalRead(RESET_BUTTON_PIN) == LOW) {
    if (buttonPressedAt == 0) buttonPressedAt = millis();
    if (!resetAlreadyHandled && (unsigned long)(millis() - buttonPressedAt) >= RESET_HOLD_MS) {
      resetAlreadyHandled = true;
      Serial.println(F("10-second hold: restoring the default reader hotspot."));
      restoreDefaultApOnly();        // keeps router Wi-Fi, device key and saved taps
      restartAfterResetBlinks = true;
      blink(3);
    }
  } else {
    buttonPressedAt = 0;
    resetAlreadyHandled = false;
  }
}

void setup() {
#if defined(ESP8266) && RESET_BUTTON_PIN == 3
  Serial.begin(115200, SERIAL_8N1, SERIAL_TX_ONLY);  // RX is the reset button
#else
  Serial.begin(115200);
#endif
  pinMode(RESET_BUTTON_PIN, RESET_BUTTON_PULLUP ? INPUT_PULLUP : INPUT);
  beginDisplay();
  if (USE_STATUS_LED) { pinMode(STATUS_LED_PIN, OUTPUT); digitalWrite(STATUS_LED_PIN, !STATUS_LED_ON); }
  EEPROM.begin(EEPROM_BYTES);
  loadSettings();
  initializeQueue();

  WiFi.persistent(false);
  WiFi.mode(WIFI_AP_STA);
  deviceSerial = WiFi.macAddress();
  WiFi.softAPdisconnect(true);
  delay(200);
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPConfig(IPAddress(192,168,4,1), IPAddress(192,168,4,1), IPAddress(255,255,255,0));
  bool apOK = WiFi.softAP(config.apSsid, config.apPassword, 6, false, 4);
  if (!apOK) Serial.println(F("ERROR: Could not start reader hotspot"));
  Serial.print(F("Device serial: ")); Serial.println(deviceSerial);
  Serial.println(F("Reader page: http://192.168.4.1"));
  beginRouterConnection();
  // The clock runs in UTC (what AvilonX expects) and the page shows Philippine
  // time. The DS1302 sets it at power-up; internet time corrects both.
#if defined(ESP8266)
  settimeofday_cb(onClockSet);
#else
  sntp_set_time_sync_notification_cb(onSntpSync);
#endif
  beginRtc();
  configTime(0, 0, "pool.ntp.org", "time.google.com");

  SPI.begin();
  reader.PCD_Init();
  delay(10);
  {
    // Shows which RC522 chip answered (0x91 or 0x92 = genuine, 0x88/0x12/0xB2 = common copies).
    byte version = reader.PCD_ReadRegister(MFRC522::VersionReg);
    rfidOk = version != 0x00 && version != 0xFF;
    lastRfidActivityMs = millis();
    Serial.print(F("RC522 version: 0x")); Serial.println(version, HEX);
    Serial.println(rfidOk ? F("RFID reader ready") : F("RFID reader NOT answering: check the wiring (" RFID_WIRING_HINT ")"));
  }

  server.on("/", HTTP_GET, []() { server.send_P(200, "text/html", PAGE); });
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/networks", HTTP_GET, handleNetworks);
  server.on("/wifi/save", HTTP_POST, handleWifiSave);
  server.on("/ap/save", HTTP_POST, handleApSave);
  server.on("/device/save", HTTP_POST, handleDeviceSave);
  server.onNotFound([]() { server.sendHeader("Location", "/"); server.send(302, "text/plain", ""); });
  server.begin();
  // The OLED shows which modules were found for a few seconds, then the status.
  bootScreenUntilMs = millis() + 5000UL;
  screenDirty = true;
  updateDisplay();
}

void loop() {
  server.handleClient();
  checkResetButton();
  updateLED();
  if (restartAfterResetBlinks) {
    // Wait for all three blinks to finish before restarting.
    if (ledTogglesRemaining == 0 && (int32_t)(millis() - ledNextMs) >= 0) {
      Serial.println(F("Hotspot defaults restored. Restarting; router and AvilonX settings are kept."));
      ESP.restart();
    }
    yield();
    return;
  }
  if (restartAfterApChange && (int32_t)(millis() - apChangeRestartAt) >= 0) ESP.restart();
  watchRfidReader();
  readRFID();
  updateDisplay();
  keepRtcInStep();
  sendPending();
  keepOnline();
  // Note when the Wi-Fi went away / came back (for the messages above).
  static bool wifiUp = false;
  if (WiFi.status() == WL_CONNECTED) {
    if (wifiLostAt != 0) { Serial.print(F("Wi-Fi back after ")); Serial.print((millis() - wifiLostAt) / 1000UL); Serial.println(F(" s: sending saved taps.")); }
    wifiLostAt = 0; lastWifiNoticeMs = 0; wifiUp = true;
  } else if (config.ssid[0] != '\0' && wifiLostAt == 0 && (wifiUp || millis() > 60000UL)) {
    // Lost, or not found within a minute of switching on.
    wifiLostAt = millis(); wifiUp = false;
    Serial.println(F("No Wi-Fi. Tags are still read and saved; they are sent when the Wi-Fi is back."));
  }
  if (config.ssid[0] != '\0' && WiFi.status() != WL_CONNECTED &&
      (unsigned long)(millis() - lastReconnectAttempt) >= 30000UL) {
    beginRouterConnection();
  }
  yield();
}
