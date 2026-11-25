/*
  AvilonX Clocking - loft reader: ESP32-S3 + USB 125 kHz reader ONLY

  The simplest AvilonX loft reader: an ESP32-S3 board and a USB 125 kHz
  desktop reader (the kind that types the tag number and Enter, like a
  keyboard). Nothing else to wire. (For an RC522, OLED, clock module or an
  ESP8266, use ../avilonx-rfid-reader instead.)

  Each tag tapped is saved in the board's flash with its time, then sent to
  AvilonX over Wi-Fi. Without internet the taps stay saved (up to 300, kept
  through a power cut) and are sent when it is back; AvilonX clocks each
  pigeon at its tap time. Tap times come from internet time, set after the
  board is switched on: switch it on with internet before the race.

  Connect
    125 kHz reader -> USB-A to USB-C OTG adapter -> the board's port marked
    "USB" (or OTG). Power and upload through the other port ("COM"/"UART").
    If the reader's light stays off, the board gives no 5 V to that port:
    bridge the small "USB-OTG" (IN-OUT) pads near the ports, or use an OTG
    adapter with its own power.

  Arduino IDE (nothing extra to install besides the board package)
    Tools > Board > ESP32S3 Dev Module ("esp32" by Espressif in Boards Manager)
    USB Mode: Hardware CDC and JTAG      USB CDC On Boot: Disabled
    Flash Size: as on the board (N16 = 16MB, N8 = 8MB)
    PSRAM: OPI PSRAM (boards marked R8)  Partition Scheme: Huge APP (3MB No OTA/1MB SPIFFS)
    Upload through the COM/UART port. Serial Monitor: 115200.

  Set up
    1. Join the Wi-Fi "RFID-READER" (password RFID12345), open http://192.168.4.1
    2. Copy the Device serial; the Super Admin registers it (Register RFID
       reader) and gives you a device key.
    3. Enter your 2.4 GHz Wi-Fi and the device key on that page, Save.
    4. Register the 125 kHz tags in AvilonX with the same reader on a computer
       (Super Admin > Register NFC): the numbers then match.
    Once on your Wi-Fi, open the page at the address shown in the Serial
    Monitor or http://avilonx-XXXX.local. The reader's own hotspot turns off
    10 minutes after joining your Wi-Fi and comes back if the Wi-Fi is lost.

  BOOT button: a short press turns the hotspot on for 10 minutes. Hold it 10
  seconds: the Wi-Fi is forgotten and the hotspot goes back to RFID-READER /
  RFID12345 (the device key and saved taps are kept).
*/

#include <Arduino.h>
#if !defined(CONFIG_IDF_TARGET_ESP32S3)
  #error "This sketch is for an ESP32-S3 (Tools > Board > ESP32S3 Dev Module)."
#endif
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <time.h>
#include <esp_system.h>
#if __has_include(<esp_mac.h>)
  #include <esp_mac.h>
#endif
#include <usb/usb_host.h>

// AvilonX's Supabase project (the publishable key is public; the reader proves
// who it is with its serial and device key).
const char *SUPABASE_URL = "https://utfxtwgqdbjkbxlooolr.supabase.co";
const char *SUPABASE_KEY = "sb_publishable_bUkPWYhRAP0nYd9yL01ObA__PJ3Q4v3";
const char *FIRMWARE = "avilonx-usbreader-2026.11";
const char *DEFAULT_AP = "RFID-READER";
const char *DEFAULT_AP_PASSWORD = "RFID12345";
const int BUTTON_PIN = 0;               // the board's BOOT button
const int MAX_SAVED = 300;              // saved taps waiting to send
const char *QUEUE = "/queue.txt";       // one tap per line: "UID UTC-seconds"

Preferences prefs;
WebServer server(80);
String wifiSsid, wifiPassword, deviceKey, apSsid, apPassword;
String deviceSerial, hostName = "avilonx-reader";
String lastTag = "-", lastReply = "No tags yet", mode = "";
bool avilonxOnline = false, hotspotOn = false, storageOk = false;
volatile bool readerConnected = false;
int pending = 0;
unsigned long lastTapMs = 0, lastSendMs = 0, sendWaitMs = 0, lastHeartbeatMs = 0;
unsigned long lastReconnectMs = 0, wifiUpAt = 0, wifiLostAt = 0, hotspotUntilMs = 0, buttonDownAt = 0;
bool mdnsStarted = false;

// ---- Saved taps (LittleFS) -------------------------------------------------
int countSaved() {
  File f = LittleFS.open(QUEUE, "r"); if (!f) return 0;
  int n = 0; while (f.available()) { if (f.readStringUntil('\n').length() > 4) n++; }
  f.close(); return n;
}
bool isSaved(const String &uid) {
  File f = LittleFS.open(QUEUE, "r"); if (!f) return false;
  bool found = false;
  while (f.available() && !found) { String line = f.readStringUntil('\n'); found = line.startsWith(uid + " "); }
  f.close(); return found;
}
bool saveTap(const String &uid, uint32_t at) {
  if (!storageOk || pending >= MAX_SAVED) return false;
  File f = LittleFS.open(QUEUE, "a"); if (!f) return false;
  bool ok = f.printf("%s %lu\n", uid.c_str(), (unsigned long)at) > 0;
  f.close(); if (ok) pending++; return ok;
}
bool oldestTap(String &uid, uint32_t &at) {
  File f = LittleFS.open(QUEUE, "r"); if (!f) return false;
  String line; while (f.available() && line.length() < 5) { line = f.readStringUntil('\n'); line.trim(); }
  f.close();
  int space = line.indexOf(' '); if (space < 1) return false;
  uid = line.substring(0, space); at = (uint32_t)strtoul(line.substring(space + 1).c_str(), nullptr, 10);
  return true;
}
// Removes the oldest tap (written to a new file first, so a power cut never loses the others).
void dropOldestTap() {
  File in = LittleFS.open(QUEUE, "r"); if (!in) return;
  File out = LittleFS.open("/queue.tmp", "w"); if (!out) { in.close(); return; }
  bool skipped = false;
  while (in.available()) {
    String line = in.readStringUntil('\n'); String trimmed = line; trimmed.trim();
    if (trimmed.length() < 5) continue;
    if (!skipped) { skipped = true; continue; }
    out.print(trimmed); out.print('\n');
  }
  in.close(); out.close();
  LittleFS.remove(QUEUE); LittleFS.rename("/queue.tmp", QUEUE);
  pending = countSaved();
}

// ---- Time ------------------------------------------------------------------
uint32_t nowUtc() { time_t t = time(nullptr); return t >= 1700000000 ? (uint32_t)t : 0; }
String phTime(uint32_t utc) {
  if (!utc) return "clock not set";
  time_t t = (time_t)utc + 8 * 3600; struct tm *x = gmtime(&t);
  char s[32]; strftime(s, sizeof(s), "%b %d, %Y %I:%M:%S %p", x); return String(s);
}

// ---- The USB 125 kHz reader (the ESP32-S3 is the USB host) -------------------
// The reader "types" the tag number and Enter; the key presses are read here.
struct TapItem { char uid[21]; uint32_t atMs; };
QueueHandle_t tapQueue;
usb_host_client_handle_t usbClient = nullptr;
usb_device_handle_t usbDevice = nullptr;
usb_transfer_t *usbReport = nullptr;
volatile uint8_t usbNewAddress = 0;
volatile bool usbGone = false, usbReportBusy = false;
uint8_t usbInterface = 0, usbLastKeys[6] = {0};
String usbTyped;
unsigned long usbLastKeyMs = 0;

// The typed number as AvilonX stores it (the same as the website does with a
// USB reader): 8-10 digits -> 8 hex characters (0012345678 -> 00BC614E); a hex
// ID of 8, 14 or 20 characters stays. Anything else: "".
String tagFromTyped(const String &typed) {
  String raw;
  for (size_t i = 0; i < typed.length(); i++) { char c = toupper(typed[i]); if (isalnum((unsigned char)c)) raw += c; }
  bool digits = raw.length() >= 8 && raw.length() <= 10;
  for (size_t i = 0; digits && i < raw.length(); i++) if (!isdigit((unsigned char)raw[i])) digits = false;
  if (digits) {
    unsigned long long value = strtoull(raw.c_str(), nullptr, 10);
    if (value <= 0xFFFFFFFFULL) { char hex[9]; snprintf(hex, sizeof(hex), "%08lX", (unsigned long)value); return String(hex); }
  }
  bool hex = raw.length() == 8 || raw.length() == 14 || raw.length() == 20;
  for (size_t i = 0; hex && i < raw.length(); i++) if (!isxdigit((unsigned char)raw[i])) hex = false;
  return hex ? raw : String("");
}
char usbKeyChar(uint8_t code) {
  if (code >= 0x04 && code <= 0x1D) return 'A' + (code - 0x04);
  if (code >= 0x1E && code <= 0x26) return '1' + (code - 0x1E);
  if (code == 0x27) return '0';
  if (code >= 0x59 && code <= 0x61) return '1' + (code - 0x59);  // number pad
  if (code == 0x62) return '0';
  if (code == 0x28 || code == 0x58 || code == 0x2B) return '\n';  // Enter, pad Enter, Tab
  return 0;
}
void usbFinishTag() {
  if (!usbTyped.length()) return;
  String tag = tagFromTyped(usbTyped);
  if (tag.length()) {
    TapItem item = {}; strncpy(item.uid, tag.c_str(), sizeof(item.uid) - 1); item.atMs = millis();
    xQueueSend(tapQueue, &item, 0);
  } else { Serial.print(F("The reader typed something that is not a tag ID: ")); Serial.println(usbTyped); }
  usbTyped = "";
}
void usbOnReport(usb_transfer_t *transfer) {
  usbReportBusy = false;
  if (transfer->status == USB_TRANSFER_STATUS_COMPLETED && transfer->actual_num_bytes >= 8) {
    const uint8_t *d = transfer->data_buffer;
    if (transfer->actual_num_bytes == 9) d++;  // a report ID first: skip it
    for (int k = 2; k < 8; k++) {
      uint8_t code = d[k]; if (code < 0x04) continue;
      bool held = false; for (int j = 0; j < 6; j++) if (usbLastKeys[j] == code) held = true;
      if (held) continue;  // only new key presses
      char c = usbKeyChar(code);
      if (c == '\n') usbFinishTag();
      else if (c && usbTyped.length() < 24) { usbTyped += c; usbLastKeyMs = millis(); }
    }
    memcpy(usbLastKeys, d + 2, 6);
  }
  if (!usbGone && usbDevice && usb_host_transfer_submit(transfer) == ESP_OK) usbReportBusy = true;
}
void usbOnEvent(const usb_host_client_event_msg_t *msg, void *) {
  if (msg->event == USB_HOST_CLIENT_EVENT_NEW_DEV) usbNewAddress = msg->new_dev.address;
  else if (msg->event == USB_HOST_CLIENT_EVENT_DEV_GONE) usbGone = true;
}
void usbOnControlDone(usb_transfer_t *transfer) { usb_host_transfer_free(transfer); }
void usbOpen(uint8_t address) {
  if (usb_host_device_open(usbClient, address, &usbDevice) != ESP_OK) { usbDevice = nullptr; return; }
  const usb_config_desc_t *config = nullptr;
  if (usb_host_get_active_config_descriptor(usbDevice, &config) != ESP_OK) return;
  const uint8_t *p = (const uint8_t *)config;
  int total = config->wTotalLength, i = 0, current = -1, alt = 0, chosen = -1, chosenAlt = 0;
  bool hid = false, keyboard = false, chosenKeyboard = false; uint8_t endpoint = 0; uint16_t size = 8;
  while (i + 2 <= total && p[i] >= 2) {
    if (p[i + 1] == 0x04 && i + 8 <= total) { current = p[i + 2]; alt = p[i + 3]; hid = p[i + 5] == 0x03; keyboard = hid && p[i + 7] == 0x01; }
    else if (p[i + 1] == 0x05 && hid && i + 7 <= total && (p[i + 2] & 0x80) && (p[i + 3] & 0x03) == 0x03) {
      if (chosen < 0 || (keyboard && !chosenKeyboard)) { chosen = current; chosenAlt = alt; chosenKeyboard = keyboard; endpoint = p[i + 2]; size = p[i + 4] | (p[i + 5] << 8); }
    }
    i += p[i];
  }
  if (chosen < 0 || usb_host_interface_claim(usbClient, usbDevice, chosen, chosenAlt) != ESP_OK) {
    Serial.println(F("This USB device is not a keyboard-type reader."));
    usb_host_device_close(usbClient, usbDevice); usbDevice = nullptr; return;
  }
  usbInterface = chosen;
  usb_transfer_t *control = nullptr;   // ask for the simple keyboard report format
  if (usb_host_transfer_alloc(8, 0, &control) == ESP_OK) {
    const uint8_t setProtocol[8] = {0x21, 0x0B, 0x00, 0x00, (uint8_t)chosen, 0x00, 0x00, 0x00};
    memcpy(control->data_buffer, setProtocol, 8);
    control->num_bytes = 8; control->device_handle = usbDevice; control->bEndpointAddress = 0;
    control->callback = usbOnControlDone; control->context = nullptr;
    if (usb_host_transfer_submit_control(usbClient, control) != ESP_OK) usb_host_transfer_free(control);
  }
  if (usb_host_transfer_alloc(size < 8 ? 8 : size, 0, &usbReport) != ESP_OK) return;
  usbReport->device_handle = usbDevice; usbReport->bEndpointAddress = endpoint;
  usbReport->callback = usbOnReport; usbReport->context = nullptr; usbReport->num_bytes = size < 8 ? 8 : size;
  memset(usbLastKeys, 0, sizeof(usbLastKeys)); usbTyped = "";
  if (usb_host_transfer_submit(usbReport) == ESP_OK) usbReportBusy = true;
  readerConnected = true;
  Serial.println(F("USB 125 kHz reader connected."));
}
void usbClose() {
  if (usbReportBusy) return;   // wait until the last report has come back
  if (usbReport) { usb_host_transfer_free(usbReport); usbReport = nullptr; }
  if (usbDevice) { usb_host_interface_release(usbClient, usbDevice, usbInterface); usb_host_device_close(usbClient, usbDevice); usbDevice = nullptr; }
  usbGone = false; readerConnected = false;
  Serial.println(F("USB reader unplugged."));
}
void usbLibraryTask(void *) { for (;;) { uint32_t flags = 0; usb_host_lib_handle_events(portMAX_DELAY, &flags); } }
void usbClientTask(void *) {
  usb_host_client_config_t config = {};
  config.is_synchronous = false; config.max_num_event_msg = 5;
  config.async.client_event_callback = usbOnEvent; config.async.callback_arg = nullptr;
  if (usb_host_client_register(&config, &usbClient) != ESP_OK) { Serial.println(F("USB host could not start.")); vTaskDelete(nullptr); }
  for (;;) {
    usb_host_client_handle_events(usbClient, pdMS_TO_TICKS(50));
    if (usbNewAddress && !usbDevice) { uint8_t address = usbNewAddress; usbNewAddress = 0; usbOpen(address); }
    if (usbGone) usbClose();
    if (usbTyped.length() >= 8 && (unsigned long)(millis() - usbLastKeyMs) > 300UL) usbFinishTag();  // no Enter
  }
}
void startUsbReader() {
  usb_host_config_t config = {};
  config.skip_phy_setup = false; config.intr_flags = ESP_INTR_FLAG_LEVEL1;
  if (usb_host_install(&config) != ESP_OK) { Serial.println(F("USB host could not start: check Tools > USB Mode.")); return; }
  xTaskCreatePinnedToCore(usbLibraryTask, "usblib", 4096, nullptr, 3, nullptr, 0);
  xTaskCreatePinnedToCore(usbClientTask, "usbreader", 5120, nullptr, 3, nullptr, 0);
}

// ---- A tag was tapped: save it with its time --------------------------------
void handleTap(const String &uid, unsigned long agoMs) {
  lastTapMs = millis(); lastTag = uid;
  uint32_t at = nowUtc(); if (at) at -= (uint32_t)((agoMs + 500UL) / 1000UL);
  Serial.printf("Tag %s at %s\n", uid.c_str(), phTime(at).c_str());
  if (isSaved(uid)) { lastReply = "Already saved; waiting to send."; return; }
  if (saveTap(uid, at)) { lastReply = WiFi.status() == WL_CONNECTED ? "Saved; sending to AvilonX" : "Saved; will send when the internet is back"; lastSendMs = 0; sendWaitMs = 0; }
  else lastReply = "NOT SAVED: storage full or error";
}

// ---- AvilonX -----------------------------------------------------------------
// One call to AvilonX (Supabase RPC). The connection is kept open between calls
// (faster); a call that fails on a closed connection is tried once more at once.
WiFiClientSecure tls;
HTTPClient http;
bool httpReady = false;
int postAvilonX(const char *function, const String &body, String &reply) {
  if (!httpReady) { tls.setInsecure(); http.setReuse(true); httpReady = true; }
  int code = -1;
  for (int attempt = 0; attempt < 2 && code <= 0; attempt++) {
    http.setTimeout(8000);
    if (!http.begin(tls, String(SUPABASE_URL) + "/rest/v1/rpc/" + function)) { tls.stop(); continue; }
    http.addHeader("Content-Type", "application/json");
    http.addHeader("apikey", SUPABASE_KEY);
    code = http.POST(body);
    reply = code > 0 ? http.getString() : "";
    http.end();
    if (code <= 0) tls.stop();
  }
  return code;
}
// A text field from AvilonX's small JSON reply, e.g. "message".
String jsonText(const String &body, const char *name) {
  int at = body.indexOf(String("\"") + name + "\""); if (at < 0) return "";
  at = body.indexOf(':', at); if (at < 0) return "";
  at = body.indexOf('"', at); if (at < 0) return "";
  String out;
  for (int i = at + 1; i < (int)body.length(); i++) { char c = body[i]; if (c == '\\' && i + 1 < (int)body.length()) { out += body[++i]; continue; } if (c == '"') break; out += c; }
  return out;
}
String jsonEscape(const String &s) { String o; for (size_t i = 0; i < s.length(); i++) { char c = s[i]; if (c == '"' || c == '\\') o += '\\'; if ((uint8_t)c >= 32) o += c; } return o; }

void sendSaved() {
  if (!pending || !deviceKey.length() || WiFi.status() != WL_CONNECTED) return;
  if ((unsigned long)(millis() - lastTapMs) < 1500UL && lastTapMs) return;          // birds arriving together: read them first
  if (lastSendMs && (unsigned long)(millis() - lastSendMs) < sendWaitMs) return;
  lastSendMs = millis();
  String uid; uint32_t at = 0;
  if (!oldestTap(uid, at)) { pending = countSaved(); sendWaitMs = 10000; return; }
  String body = "{\"p_serial\":\"" + deviceSerial + "\",\"p_key\":\"" + deviceKey + "\",\"p_tag\":\"" + uid + "\"";
  if (at) { time_t t = at; char stamp[26]; strftime(stamp, sizeof(stamp), "%Y-%m-%dT%H:%M:%SZ", gmtime(&t)); body += String(",\"p_scanned_at\":\"") + stamp + "\""; }
  body += "}";
  String reply; int code = postAvilonX("device_rfid_scan", body, reply);
  if (code <= 0 || code >= 500 || code == 404 || code == 408 || code == 429) { lastReply = code <= 0 ? "No internet. Taps are saved." : "AvilonX is busy (" + String(code) + "). Will retry."; sendWaitMs = 10000; return; }
  String message = jsonText(reply, "message"); if (!message.length()) message = "AvilonX replied " + String(code);
  if (code == 401 || code == 403) { lastReply = message + " Taps are kept."; sendWaitMs = 30000; return; }
  String m = jsonText(reply, "mode"); if (m.length()) mode = m;
  lastReply = uid + ": " + message; avilonxOnline = true; lastHeartbeatMs = millis();
  Serial.print(F("AvilonX: ")); Serial.println(message);
  dropOldestTap(); sendWaitMs = 300;
}
void heartbeat() {
  if (!deviceKey.length() || WiFi.status() != WL_CONNECTED) { avilonxOnline = false; return; }
  if (lastTapMs && (unsigned long)(millis() - lastTapMs) < 5000UL) return;
  if (lastHeartbeatMs && (unsigned long)(millis() - lastHeartbeatMs) < 60000UL) return;
  lastHeartbeatMs = millis();
  String body = "{\"p_serial\":\"" + deviceSerial + "\",\"p_key\":\"" + deviceKey + "\",\"p_pending\":" + String(pending) +
                ",\"p_clock\":\"" + (nowUtc() ? "internet" : "none") + "\",\"p_firmware\":\"" + FIRMWARE + "\"}";
  String reply; int code = postAvilonX("device_rfid_heartbeat", body, reply);
  avilonxOnline = code >= 200 && code < 300;
  if (avilonxOnline) { String m = jsonText(reply, "mode"); if (m.length()) mode = m; }
  else if (code == 401 || code == 403) { String m = jsonText(reply, "message"); if (m.length()) lastReply = m; }
}

// ---- Wi-Fi and the reader's own hotspot ----------------------------------------
void startHotspot() {
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0));
  hotspotOn = WiFi.softAP(apSsid.c_str(), apPassword.c_str());
  Serial.printf("Hotspot %s on: http://192.168.4.1\n", apSsid.c_str());
}
void stopHotspot() {
  WiFi.softAPdisconnect(true); WiFi.mode(WIFI_STA); hotspotOn = false;
  Serial.printf("Hotspot off. Open http://%s or http://%s.local\n", WiFi.localIP().toString().c_str(), hostName.c_str());
}
void manageWifi() {
  bool up = WiFi.status() == WL_CONNECTED;
  if (up) {
    if (!wifiUpAt) { wifiUpAt = millis(); wifiLostAt = 0; Serial.printf("Wi-Fi connected: http://%s\n", WiFi.localIP().toString().c_str()); }
    if (!mdnsStarted && MDNS.begin(hostName.c_str())) { MDNS.addService("http", "tcp", 80); mdnsStarted = true; }
  } else {
    if (wifiUpAt || (!wifiLostAt && millis() > 60000UL)) { wifiLostAt = millis(); wifiUpAt = 0; }
    if (wifiSsid.length() && (unsigned long)(millis() - lastReconnectMs) > 30000UL) { lastReconnectMs = millis(); WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str()); }
  }
  bool pressed = hotspotUntilMs && (int32_t)(millis() - hotspotUntilMs) < 0;
  bool want = pressed || !wifiSsid.length() || (!up && wifiLostAt && (unsigned long)(millis() - wifiLostAt) > 60000UL) ||
              (up && (unsigned long)(millis() - wifiUpAt) < 600000UL) || WiFi.softAPgetStationNum() > 0 || (!up && hotspotOn);
  if (want && !hotspotOn) startHotspot(); else if (!want && hotspotOn) stopHotspot();
}

// ---- The reader's page -----------------------------------------------------------
const char PAGE[] PROGMEM = R"HTML(<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AvilonX USB reader</title>
<style>body{font-family:system-ui,sans-serif;margin:0;background:#f0f5fb;color:#102745}header{background:#0b2345;color:#fff;padding:16px 18px;border-bottom:4px solid #ff8319}h1{margin:0;font-size:20px}main{padding:14px;max-width:640px;margin:auto}.card{background:#fff;border:1px solid #dce6f1;border-radius:12px;padding:14px;margin-bottom:14px}.row{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid #eef2f6;font-size:14px}.row b{text-align:right;overflow-wrap:anywhere}label{display:block;font-size:13px;font-weight:700;margin:10px 0 4px}input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #b9cada;border-radius:8px;font:inherit}button{margin-top:12px;padding:10px 14px;border:0;border-radius:8px;background:#f97316;color:#fff;font-weight:700;font:inherit}.alt{background:#eaf2fa;color:#194a78}.msg{font-size:13px;color:#1b6f62;min-height:18px;margin-top:8px}</style></head><body>
<header><h1>AvilonX USB 125 kHz reader</h1></header><main>
<div class="card" id="status">Loading...</div>
<div class="card"><form id="f"><label>Wi-Fi name (2.4 GHz)</label><input name="ssid" autocomplete="off"><label>Wi-Fi password</label><input name="password" type="password" autocomplete="new-password"><label>Device key from AvilonX (32 characters)</label><input name="key" autocomplete="off" autocapitalize="characters"><button>Save</button> <button type="button" class="alt" id="forget">Forget Wi-Fi</button><div class="msg" id="m"></div></form></div></main>
<script>
const $=id=>document.getElementById(id);
async function update(){try{const s=await (await fetch('/api/status',{cache:'no-store'})).json();const rows=[['Device serial',s.serial],['USB reader',s.reader?'Connected':'Not connected: plug it into the USB (OTG) port'],['Wi-Fi',s.wifi?s.ssid+' ('+s.ip+')':(s.ssid?'Not connected to '+s.ssid:'Not set')],['Open on your Wi-Fi',s.ip?'http://'+s.ip+' or http://'+s.host+'.local':'-'],['AvilonX',s.key?(s.online?'Online':'No reply yet'):'Enter the device key'],['Mode',s.mode||'-'],['Last tag',s.tag],['Reply',s.reply],['Waiting to send',s.pending],['Clock (PH)',s.time],['Hotspot',s.hotspot?s.ap+' on (192.168.4.1)':'Off (press BOOT once to turn on)']];$('status').innerHTML='';rows.forEach(([k,v])=>{const d=document.createElement('div');d.className='row';const a=document.createElement('span');a.textContent=k;const b=document.createElement('b');b.textContent=v;d.append(a,b);$('status').append(d);});}catch(e){$('status').textContent='Reader not reachable.';}}
$('f').onsubmit=async e=>{e.preventDefault();$('m').textContent='Saving...';const r=await fetch('/save',{method:'POST',body:new URLSearchParams(new FormData(e.target))});$('m').textContent=await r.text();e.target.reset();update();};
$('forget').onclick=async()=>{if(!confirm('Forget the saved Wi-Fi? The reader restarts with only its hotspot.'))return;const r=await fetch('/forget',{method:'POST'});$('m').textContent=await r.text();};
update();setInterval(update,2000);
</script></body></html>)HTML";

void handleStatus() {
  String j = "{\"serial\":\"" + deviceSerial + "\",\"host\":\"" + hostName + "\",\"reader\":" + (readerConnected ? "true" : "false") +
             ",\"wifi\":" + (WiFi.status() == WL_CONNECTED ? "true" : "false") + ",\"ssid\":\"" + jsonEscape(wifiSsid) +
             "\",\"ip\":\"" + (WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : String("")) + "\",\"key\":" + (deviceKey.length() ? "true" : "false") +
             ",\"online\":" + (avilonxOnline ? "true" : "false") + ",\"mode\":\"" + jsonEscape(mode) + "\",\"tag\":\"" + jsonEscape(lastTag) +
             "\",\"reply\":\"" + jsonEscape(lastReply) + "\",\"pending\":" + String(pending) + ",\"time\":\"" + phTime(nowUtc()) +
             "\",\"hotspot\":" + (hotspotOn ? "true" : "false") + ",\"ap\":\"" + jsonEscape(apSsid) + "\"}";
  server.send(200, "application/json", j);
}
void handleSave() {
  String ssid = server.arg("ssid"), password = server.arg("password"), key;
  String typedKey = server.arg("key");
  for (size_t i = 0; i < typedKey.length(); i++) { char c = toupper(typedKey[i]); if (isxdigit((unsigned char)c)) key += c; }
  String said;
  if (ssid.length()) {
    if (ssid.length() > 32 || (password.length() && password.length() < 8)) { server.send(400, "text/plain", "Check the Wi-Fi name and password (at least 8 characters)."); return; }
    wifiSsid = ssid; wifiPassword = password; prefs.putString("ssid", ssid); prefs.putString("pass", password);
    WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str()); lastReconnectMs = millis(); said += "Wi-Fi saved, connecting to " + ssid + ". ";
  }
  if (server.arg("key").length()) {
    if (key.length() != 32) { server.send(400, "text/plain", said + "The device key has 32 letters and numbers: copy it again from AvilonX."); return; }
    deviceKey = key; prefs.putString("key", key); lastHeartbeatMs = 0; said += "Device key saved. Tap a tag to test.";
  }
  server.send(200, "text/plain", said.length() ? said : String("Nothing to save."));
}
void forgetWifi() {
  prefs.remove("ssid"); prefs.remove("pass"); prefs.putString("ap", DEFAULT_AP); prefs.putString("appass", DEFAULT_AP_PASSWORD);
}
void handleForget() {
  forgetWifi();
  server.send(200, "text/plain", "Wi-Fi forgotten. Restarting: join RFID-READER (password RFID12345) and open http://192.168.4.1.");
  delay(1500); ESP.restart();
}

// ---- BOOT button -------------------------------------------------------------
void checkButton() {
  bool down = digitalRead(BUTTON_PIN) == LOW;
  if (down && !buttonDownAt) buttonDownAt = millis();
  if (down && buttonDownAt && (unsigned long)(millis() - buttonDownAt) >= 10000UL) {
    Serial.println(F("BOOT held 10 s: forgetting the Wi-Fi, hotspot back to RFID-READER / RFID12345."));
    forgetWifi(); delay(300); ESP.restart();
  }
  if (!down && buttonDownAt) {
    unsigned long held = millis() - buttonDownAt; buttonDownAt = 0;
    if (held >= 50 && held < 3000) { hotspotUntilMs = millis() + 600000UL; Serial.println(F("Hotspot on for 10 minutes.")); }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  prefs.begin("avilonx", false);
  wifiSsid = prefs.getString("ssid", ""); wifiPassword = prefs.getString("pass", ""); deviceKey = prefs.getString("key", "");
  apSsid = prefs.getString("ap", DEFAULT_AP); apPassword = prefs.getString("appass", DEFAULT_AP_PASSWORD);
  if (apPassword.length() < 8) apPassword = DEFAULT_AP_PASSWORD;
  storageOk = LittleFS.begin(true);
  if (!storageOk) Serial.println(F("ERROR: storage not available: check Tools > Partition Scheme (Huge APP)."));
  pending = storageOk ? countSaved() : 0;

  uint8_t mac[6] = {0};
  if (esp_read_mac(mac, ESP_MAC_WIFI_STA) != ESP_OK) { uint64_t fused = ESP.getEfuseMac(); for (int i = 0; i < 6; i++) mac[i] = (uint8_t)(fused >> (8 * i)); }
  char text[18]; snprintf(text, sizeof(text), "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  deviceSerial = text;
  char name[20]; snprintf(name, sizeof(name), "avilonx-%02x%02x", mac[4], mac[5]); hostName = name;

  WiFi.persistent(false);
  WiFi.setHostname(hostName.c_str());
  startHotspot();
  WiFi.setSleep(false);
  if (wifiSsid.length()) { WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str()); lastReconnectMs = millis(); }
  configTime(0, 0, "pool.ntp.org", "time.google.com");

  server.on("/", HTTP_GET, []() { server.send_P(200, "text/html", PAGE); });
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/save", HTTP_POST, handleSave);
  server.on("/forget", HTTP_POST, handleForget);
  server.onNotFound([]() { server.sendHeader("Location", "/"); server.send(302, "text/plain", ""); });
  server.begin();

  tapQueue = xQueueCreate(32, sizeof(TapItem));
  startUsbReader();
  Serial.printf("AvilonX USB reader. Device serial: %s\nTaps waiting to send: %d\n", deviceSerial.c_str(), pending);
}

void loop() {
  server.handleClient();
  checkButton();
  TapItem item;
  while (xQueueReceive(tapQueue, &item, 0) == pdTRUE) handleTap(String(item.uid), millis() - item.atMs);
  manageWifi();
  sendSaved();
  heartbeat();
  delay(2);
}
