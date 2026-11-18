/*
  AvilonX Clocking - external RFID reader (ESP8266 + RC522)

  Every tag tapped on the RC522 is sent to AvilonX over Wi-Fi. The Super Admin
  must first register this reader for a club (Register RFID reader page, using
  the Device serial below) and the device key it gives is entered on this
  reader's page. Readers that are not
  registered are refused by AvilonX.

  The club admin chooses the reader's mode on Admin > RFID readers:
    Register  each tap fills the NFC tag field on the Race entries and
              Register NFC pages that are open in the club's browser.
    Clocking  each tap clocks that tag's pigeon in an open race, at
              Supabase server time.

  Setup
    1. Arduino IDE: install the "ESP8266" boards package and the "MFRC522"
       library (Sketch > Include Library > Manage Libraries). Board: your
       ESP8266 board, e.g. "NodeMCU 1.0 (ESP-12E Module)". Upload this sketch.
    2. Join the Wi-Fi "RFID-READER" (password below) and open http://192.168.4.1
    3. The Super Admin registers the Device serial (Register RFID reader).
    4. On http://192.168.4.1 enter the device key, then pick your 2.4 GHz Wi-Fi
       and press Save & Connect. Tap a tag: the page shows AvilonX's reply.

  Wiring (RC522 runs on 3.3 V only)
    SDA->D2(GPIO4), RST->D1(GPIO5), SCK->D5(GPIO14), MISO->D6(GPIO12),
    MOSI->D7(GPIO13), 3.3V->3V3, GND->GND.
    Wi-Fi reset button: D0(GPIO16) -> button -> GND, with a 10k resistor from
    D0 to 3.3V. Hold 10 seconds to erase the saved Wi-Fi (the key is kept).
    The board's blue LED (D4) blinks once for a good tap and three times for a
    refused one.
*/

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <EEPROM.h>
#include <SPI.h>
#include <MFRC522.h>

#define RFID_SS_PIN  4
#define RFID_RST_PIN 5
#define RESET_BUTTON_PIN 16
#define RESET_HOLD_MS 10000UL
#define STATUS_LED_PIN 2   // built-in LED, lit when LOW

// The reader's own Wi-Fi. Change the password (8+ characters) before using it at a race.
const char* AP_NAME = "RFID-READER";
const char* AP_PASSWORD = "RFID12345";

// AvilonX's Supabase project. The publishable key is public (it is in the web app too);
// the reader proves who it is with its serial and device key.
const char* SUPABASE_URL = "https://utfxtwgqdbjkbxlooolr.supabase.co";
const char* SUPABASE_KEY = "sb_publishable_bUkPWYhRAP0nYd9yL01ObA__PJ3Q4v3";

ESP8266WebServer server(80);
MFRC522 reader(RFID_SS_PIN, RFID_RST_PIN);

// Saved in flash. Version 2 adds the device key after the Wi-Fi settings.
struct Settings {
  uint32_t magic;
  char ssid[33];
  char password[65];
  char deviceKey[41];
};
Settings config;
const uint32_t SETTINGS_MAGIC_V1 = 0x52464944UL; // older sketch: Wi-Fi only
const uint32_t SETTINGS_MAGIC = 0x52464945UL;
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
unsigned long buttonPressedAt = 0;
bool resetAlreadyHandled = false;
unsigned long lastReconnectAttempt = 0;

// Tags waiting to be sent (kept while Wi-Fi is down). The receipt time is the
// moment AvilonX receives the tag, so keep the reader online during a race.
const int QUEUE_SIZE = 10;
String pending[QUEUE_SIZE];
int pendingCount = 0;
unsigned long lastSendAttempt = 0;

const char PAGE[] PROGMEM = R"HTML(
<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AvilonX RFID Reader</title>
<style>
:root{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#122f49;background:#f4f7fa}
*{box-sizing:border-box}body{margin:0;padding:20px}main{max-width:760px;margin:auto}
header{background:#00345f;color:white;border-radius:16px;padding:24px;margin-bottom:16px;border-bottom:4px solid #ff6900}
h1{font-size:1.45rem;margin:0 0 5px}.sub{opacity:.85;font-size:.9rem}
.card{background:white;border-radius:16px;padding:20px;margin-bottom:16px;box-shadow:0 3px 18px #00345f12}
h2{font-size:1.1rem;margin:0 0 12px}.stats{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.stat{background:#f1f6fb;border-radius:12px;padding:15px}.stat small{display:block;color:#587089;margin-bottom:6px}
.big{font-size:1.25rem;font-weight:750;overflow-wrap:anywhere}.ok{color:#11835d}.warn{color:#a86600}
.serial{font:700 1.3rem ui-monospace,monospace;letter-spacing:.04em}
label{display:block;font-weight:600;margin:12px 0 6px}input,select{font:inherit;width:100%;padding:12px;border:1px solid #b8c8d7;border-radius:9px;background:#fff}
button{font:inherit;background:#00345f;color:white;border:0;border-radius:9px;padding:12px 16px;cursor:pointer}
button.alt{background:#e7f0f9;color:#15436e}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:15px}
p{line-height:1.5}.muted{color:#5e7184;font-size:.9rem}.msg{min-height:24px;margin-top:12px}
ul{margin:0;padding:0;list-style:none}li{padding:11px 0;border-bottom:1px solid #e8edf3;font-size:.92rem}
li b{font-family:ui-monospace,monospace}li:last-child{border:0}@media(max-width:480px){.stats{grid-template-columns:1fr}body{padding:12px}}
</style></head><body><main>
<header><h1>AvilonX RFID Reader</h1><div class="sub">Sends every tag you tap to AvilonX Clocking</div></header>
<section class="card"><h2>Reader</h2>
<div class="stats"><div class="stat"><small>Last tag</small><div class="big" id="uid">Waiting for card</div></div>
<div class="stat"><small>AvilonX reply</small><div class="big" id="reply">—</div></div>
<div class="stat"><small>Mode</small><div class="big" id="mode">—</div></div>
<div class="stat"><small>Waiting to send / taps since start</small><div class="big"><span id="pending">0</span> / <span id="count">0</span></div></div></div>
<h2 style="margin-top:18px">Recent taps</h2><ul id="history"><li>No taps yet</li></ul></section>
<section class="card"><h2>AvilonX registration</h2>
<p>Device serial: <span class="serial" id="serial">—</span></p>
<p class="muted">The AvilonX Super Admin registers this serial for your club (Register RFID reader) and gives a device key. The reader is refused until it is registered and the key is saved here.</p>
<p>Device key: <b id="keyStatus">Checking...</b></p>
<form id="keyForm"><label for="key">Device key from AvilonX</label>
<input id="key" name="key" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="32 letters and numbers" required>
<div class="actions"><button type="submit">Save key</button></div></form><div id="keyMessage" class="msg muted"></div></section>
<section class="card"><h2>Wi-Fi connection</h2>
<p>Reader's own Wi-Fi: <b>RFID-READER</b> &bull; Address: <b>192.168.4.1</b></p>
<p>Internet Wi-Fi: <b id="wifiStatus">Checking...</b><br>
<span class="muted">Network: <span id="ssid">—</span> | IP: <span id="ip">—</span></span></p>
<form id="wifiForm">
<label for="network">Choose a 2.4 GHz Wi-Fi network with internet</label>
<select id="network" name="ssid" required><option value="">Press Scan Networks</option></select>
<div class="actions"><button class="alt" type="button" onclick="scanNetworks()">Scan Networks</button></div>
<label for="password">Wi-Fi password</label>
<input id="password" name="password" type="password" placeholder="Leave blank for open Wi-Fi" autocomplete="new-password">
<div class="actions"><button type="submit">Save &amp; Connect</button></div>
</form><div id="message" class="msg muted"></div>
<p class="muted">To erase the saved Wi-Fi, hold the button on D0 for 10 seconds.</p>
</section></main>
<script>
const $=id=>document.getElementById(id);
async function update(){
 try{
  const s=await (await fetch('/api/status',{cache:'no-store'})).json();
  $('uid').textContent=s.last_uid;$('reply').textContent=s.last_reply;$('mode').textContent=s.mode||'—';
  $('count').textContent=s.total_scans;$('pending').textContent=s.pending;$('serial').textContent=s.serial;
  const k=$('keyStatus');k.textContent=s.key_saved?'Saved':'Not saved';k.className=s.key_saved?'ok':'warn';
  $('ssid').textContent=s.saved_ssid||'Not set';$('ip').textContent=s.router_ip||'—';
  const w=$('wifiStatus');w.textContent=s.wifi_connected?'Connected':'Not connected';w.className=s.wifi_connected?'ok':'warn';
  const list=$('history');list.replaceChildren();
  if(!s.history.length){const li=document.createElement('li');li.textContent='No taps yet';list.appendChild(li);}
  s.history.forEach(item=>{const li=document.createElement('li');li.textContent=item;list.appendChild(li);});
 }catch(e){$('wifiStatus').textContent='Reader unreachable';}
}
async function scanNetworks(){
 const selector=$('network');selector.replaceChildren(new Option('Scanning...',''));
 try{
  const items=await (await fetch('/api/networks')).json();selector.replaceChildren(new Option('Choose a Wi-Fi network',''));
  items.forEach(n=>selector.add(new Option(n.ssid+' ('+n.rssi+' dBm)'+(n.open?' - Open':''),n.ssid)));
  if(!items.length)$('message').textContent='No networks found. Try again.';
 }catch(e){$('message').textContent='Wi-Fi scan failed.';}
}
async function post(url,form,box){
 box.textContent='Saving...';
 try{const r=await fetch(url,{method:'POST',body:new URLSearchParams(new FormData(form))});box.textContent=await r.text();}
 catch(e){box.textContent='Could not save. Stay connected to RFID-READER and try again.';}
}
$('wifiForm').addEventListener('submit',e=>{e.preventDefault();post('/wifi/save',e.target,$('message')).then(()=>$('password').value='');});
$('keyForm').addEventListener('submit',e=>{e.preventDefault();post('/device/save',e.target,$('keyMessage')).then(()=>$('key').value='');});
update();setInterval(update,1500);scanNetworks();
</script></body></html>
)HTML";

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
String jsonField(const String &body, const char *name) {
  String marker = String("\"") + name + "\":\"";
  int start = body.indexOf(marker);
  if (start < 0) return "";
  start += marker.length();
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

void loadSettings() {
  EEPROM.get(0, config);
  if (config.magic == SETTINGS_MAGIC_V1) {
    config.deviceKey[0] = '\0';          // keep the Wi-Fi saved by the older sketch
    config.magic = SETTINGS_MAGIC;
  } else if (config.magic != SETTINGS_MAGIC) {
    memset(&config, 0, sizeof(config));
    config.magic = SETTINGS_MAGIC;
  }
  config.ssid[sizeof(config.ssid) - 1] = '\0';
  config.password[sizeof(config.password) - 1] = '\0';
  config.deviceKey[sizeof(config.deviceKey) - 1] = '\0';
}

void storeSettings() {
  config.magic = SETTINGS_MAGIC;
  EEPROM.put(0, config);
  if (!EEPROM.commit()) Serial.println(F("ERROR: Could not save settings"));
}

void clearWifiSettings() {
  memset(config.ssid, 0, sizeof(config.ssid));
  memset(config.password, 0, sizeof(config.password));
  storeSettings();
}

void beginRouterConnection() {
  if (config.ssid[0] == '\0') return;
  WiFi.begin(config.ssid, config.password);
  Serial.print(F("Connecting to Wi-Fi: "));
  Serial.println(config.ssid);
  lastReconnectAttempt = millis();
}

void blink(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(STATUS_LED_PIN, LOW); delay(times == 1 ? 250 : 90);
    digitalWrite(STATUS_LED_PIN, HIGH); if (i + 1 < times) delay(90);
  }
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
  result += F(",\"pending\":");
  result += String(pendingCount);
  result += F(",\"serial\":\"");
  result += deviceSerial;
  result += F("\",\"key_saved\":");
  result += (config.deviceKey[0] ? F("true") : F("false"));
  result += F(",\"wifi_connected\":");
  result += (WiFi.status() == WL_CONNECTED ? F("true") : F("false"));
  result += F(",\"saved_ssid\":\"");
  result += jsonEscape(String(config.ssid));
  result += F("\",\"router_ip\":\"");
  if (WiFi.status() == WL_CONNECTED) result += WiFi.localIP().toString();
  result += F("\",\"history\":[");
  for (int i = 0; i < historyCount; i++) {
    if (i) result += ',';
    int pos = (historyNext - 1 - i + HISTORY_SIZE) % HISTORY_SIZE;
    result += '"'; result += jsonEscape(history[pos]); result += '"';
  }
  result += F("]}");
  server.send(200, "application/json", result);
}

void handleNetworks() {
  int n = WiFi.scanNetworks();
  String result = "[";
  int added = 0;
  for (int i = 0; i < n; i++) {
    String ssid = WiFi.SSID(i);
    if (ssid.length() == 0) continue;
    if (added++) result += ',';
    result += F("{\"ssid\":\""); result += jsonEscape(ssid);
    result += F("\",\"rssi\":"); result += String(WiFi.RSSI(i));
    result += F(",\"open\":");
    result += (WiFi.encryptionType(i) == ENC_TYPE_NONE ? F("true}") : F("false}"));
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
  server.send(200, "text/plain", "Device key saved. Tap a tag: the AvilonX reply appears above.");
}

// Sends one tag. Returns false when it should be tried again later (no
// internet or server busy); true when AvilonX answered, accepted or not.
bool sendTag(const String &uid) {
  if (!config.deviceKey[0]) {
    lastReply = "Save the device key from AvilonX first.";
    addHistory(uid + "  -  not sent: no device key");
    blink(3);
    return true;
  }
  BearSSL::WiFiClientSecure client;
  // The reader does not check Supabase's certificate (an ESP8266 cannot keep
  // the certificate list up to date). The device key, not the connection,
  // proves which reader is calling.
  client.setInsecure();
  HTTPClient http;
  http.setTimeout(8000);
  if (!http.begin(client, String(SUPABASE_URL) + "/rest/v1/rpc/device_rfid_scan")) {
    lastReply = "Could not reach AvilonX.";
    return false;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_KEY);
  String body = String("{\"p_serial\":\"") + deviceSerial + "\",\"p_key\":\"" + config.deviceKey + "\",\"p_tag\":\"" + uid + "\"}";
  int code = http.POST(body);
  String reply = code > 0 ? http.getString() : "";
  http.end();

  if (code <= 0 || code >= 500) {
    lastReply = code <= 0 ? "No internet. Will retry." : "AvilonX is busy. Will retry.";
    return false;
  }
  String text = jsonField(reply, "message");
  if (text.isEmpty()) text = "AvilonX replied with code " + String(code) + ".";
  String status = jsonField(reply, "status");
  String mode = jsonField(reply, "mode");
  if (mode.length()) lastMode = mode;
  bool good = code < 300 && (status == "accepted" || status == "sent");
  lastReply = text;
  addHistory(uid + "  -  " + text);
  Serial.print(F("AvilonX: ")); Serial.println(text);
  blink(good ? 1 : 3);
  return true;
}

void sendPending() {
  if (pendingCount == 0 || WiFi.status() != WL_CONNECTED) return;
  if ((unsigned long)(millis() - lastSendAttempt) < 3000UL && lastSendAttempt != 0) return;
  lastSendAttempt = millis();
  while (pendingCount > 0) {
    if (!sendTag(pending[0])) return;      // try again in a few seconds
    for (int i = 1; i < pendingCount; i++) pending[i - 1] = pending[i];
    pendingCount--;
    lastSendAttempt = 0;
    server.handleClient();
  }
}

void readRFID() {
  if (!reader.PICC_IsNewCardPresent()) return;
  if (!reader.PICC_ReadCardSerial()) return;

  String uid;
  for (byte i = 0; i < reader.uid.size; i++) {
    if (reader.uid.uidByte[i] < 0x10) uid += '0';
    uid += String(reader.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();

  // Skip the same tag read again within 2 seconds.
  unsigned long now = millis();
  if (uid != lastSeenUID || (unsigned long)(now - lastSeenMs) >= 2000UL) {
    lastUID = uid;
    lastSeenUID = uid;
    lastSeenMs = now;
    totalScans++;
    Serial.print(F("Tag: ")); Serial.println(uid);
    if (pendingCount < QUEUE_SIZE) {
      pending[pendingCount++] = uid;
      lastSendAttempt = 0;
      if (WiFi.status() != WL_CONNECTED) lastReply = "No internet Wi-Fi. Tag kept and will be sent.";
    } else {
      lastReply = "Too many tags waiting. Connect the reader to the internet.";
      addHistory(uid + "  -  not sent: queue full");
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
      Serial.println(F("10-second button hold: clearing saved Wi-Fi, restarting..."));
      clearWifiSettings();
      delay(200);
      ESP.restart();
    }
  } else {
    buttonPressedAt = 0;
    resetAlreadyHandled = false;
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);
  pinMode(RESET_BUTTON_PIN, INPUT); // needs the external 10k pull-up to 3.3V
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, HIGH);
  EEPROM.begin(EEPROM_BYTES);
  loadSettings();

  WiFi.persistent(false);
  WiFi.mode(WIFI_AP_STA);
  deviceSerial = WiFi.macAddress();
  WiFi.softAPConfig(IPAddress(192,168,4,1), IPAddress(192,168,4,1), IPAddress(255,255,255,0));
  WiFi.softAP(AP_NAME, AP_PASSWORD);
  Serial.print(F("Device serial: ")); Serial.println(deviceSerial);
  Serial.println(F("Reader page: http://192.168.4.1"));
  beginRouterConnection();

  SPI.begin();
  reader.PCD_Init();
  Serial.println(F("RFID reader ready"));

  server.on("/", HTTP_GET, []() { server.send_P(200, "text/html", PAGE); });
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/networks", HTTP_GET, handleNetworks);
  server.on("/wifi/save", HTTP_POST, handleWifiSave);
  server.on("/device/save", HTTP_POST, handleDeviceSave);
  server.onNotFound([]() { server.sendHeader("Location", "/"); server.send(302, "text/plain", ""); });
  server.begin();
}

void loop() {
  server.handleClient();
  readRFID();
  sendPending();
  checkResetButton();
  if (config.ssid[0] != '\0' && WiFi.status() != WL_CONNECTED &&
      (unsigned long)(millis() - lastReconnectAttempt) >= 30000UL) {
    beginRouterConnection();
  }
  yield();
}
