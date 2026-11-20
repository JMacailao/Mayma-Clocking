# AvilonX loft RFID reader (ESP8266 or ESP32)

The sketch is `tools/rfid-reader/avilonx-rfid-reader/avilonx-rfid-reader.ino`.
The same file works on an **ESP8266** (NodeMCU, Wemos D1 mini) and an **ESP32**
(ESP32 DevKit): choose the board in the Arduino IDE and the sketch picks the
right pins and libraries.

## Parts

| Part | Notes |
|---|---|
| ESP32 DevKit (recommended) **or** ESP8266 NodeMCU / Wemos D1 mini | |
| RC522 RFID reader (13.56 MHz) | **3.3 V only** |
| OLED 128×64, I2C, 4 pins (GND, VCC, SCL, SDA) | 0.96" SSD1306 or 1.3" SH1106. Optional |
| **DS3231** clock module with coin cell (recommended) | Keeps tap times when switched off; about 1 minute off per year. Shares the OLED's two wires |
| (or a DS1302 clock module) | Older option, a few seconds off per day, 3 wires |
| Active 3.3 V buzzer module | Optional: beeps on each tap |

No extra button is needed: the board's own **FLASH** (ESP8266) or **BOOT** (ESP32)
button is used.

## Arduino IDE

1. Boards: install **esp8266** (by ESP8266 Community) or **esp32** (by Espressif).
2. Libraries (Sketch → Include Library → Manage Libraries): **MFRC522** and **U8g2**.
3. Board: *NodeMCU 1.0 (ESP-12E Module)* or *ESP32 Dev Module*.
   **ESP32:** also set **Tools → Partition Scheme → "Huge APP (3MB No OTA/1MB
   SPIFFS)"**. With the default the sketch is too big ("Sketch too big … text
   section exceeds available space"). Don't use "Minimal SPIFFS": it leaves too
   little room for saved taps. Then Upload.
4. At the top of the sketch:
   - 1.3" OLED (SH1106): `#define OLED_SH1106 1`
   - a buzzer module that sounds on LOW: `#define BUZZER_ACTIVE_LOW 1`
   - ESP8266 with an older wiring: `#define ESP8266_WIRING 2` or `1` (see below)

## Wiring: ESP32 (recommended)

Everything on **3.3 V** (3V3 pin).

| Module | Module pin | ESP32 pin |
|---|---|---|
| RC522 | SDA | **GPIO5** |
| | SCK | **GPIO18** |
| | MOSI | **GPIO23** |
| | MISO | **GPIO19** |
| | RST | **GPIO27** |
| | 3.3V / GND | 3V3 / GND |
| OLED | SDA | **GPIO21** |
| | SCL | **GPIO22** |
| | VCC / GND | 3V3 / GND |
| DS3231 | SDA | **GPIO21** (same as the OLED) |
| | SCL | **GPIO22** (same as the OLED) |
| | VCC / GND | 3V3 / GND |
| Buzzer (optional) | signal (I/O) | **GPIO4** |
| | VCC / GND | 3V3 / GND |
| Button | | the board's **BOOT** button (or a button from GPIO32 to GND) |
| LED | | the board's blue LED (GPIO2) |

A DS1302 instead of the DS3231: CLK→GPIO25, DAT→GPIO26, RST→GPIO33.

## Wiring: ESP8266 (`ESP8266_WIRING 3`, the default)

| Module | Module pin | ESP8266 pin |
|---|---|---|
| RC522 | SDA | **D8** |
| | SCK | **D5** |
| | MOSI | **D7** |
| | MISO | **D6** |
| | RST | **D0** |
| | IRQ | not connected |
| | 3.3V / GND | 3V3 / GND |
| OLED | SDA | **D2** |
| | SCL | **D1** |
| | VCC / GND | 3V3 / GND |
| DS3231 | SDA | **D2** (same as the OLED) |
| | SCL | **D1** (same as the OLED) |
| | VCC / GND | 3V3 / GND |
| Buzzer (optional) | signal (I/O) | **RX** |
| | VCC / GND | 3V3 / GND |
| Button | | the board's **FLASH** button |
| LED | | the board's blue LED (D4) |

Free pins: **D3** (the FLASH button) and **TX** (Serial Monitor, 115200 baud).

Older wirings still work:

- `ESP8266_WIRING 2` (OLED + DS1302): RC522 SDA D8, RST to 3V3; OLED D2/D1; DS1302
  CLK D3, DAT D4, RST D0; button RX→GND.
- `ESP8266_WIRING 1` (the first wiring, no OLED): RC522 SDA D2, RST D1; DS1302 CLK
  D3, DAT D4, RST D8; button D0 with a 10 kΩ resistor to 3.3 V.

**DS3231 tip:** the common "ZS-042" DS3231 board has a charging circuit meant for a
rechargeable LIR2032 cell. At 3.3 V it hardly charges, so a normal CR2032 is fine.

## Buttons, LED and buzzer

| Action | What happens |
|---|---|
| Short press (under 3 s) | The reader's hotspot turns on for 10 minutes |
| Hold 10 s, then let go (1 beep at 10 s) | Hotspot name/password back to RFID-READER / RFID12345, restart. The router Wi-Fi is kept |
| Hold 20 s | **Forget the router Wi-Fi** too, restart with only the hotspot on |
| Each tap | 1 beep |
| AvilonX refuses a tap | 2 beeps, LED blinks 3 times |
| AvilonX clocks it | LED blinks once |

The device key and saved taps are always kept.

## Forget the Wi-Fi (start again with no Wi-Fi)

Either:

- on the reader's page, **Wi-Fi Connection → Forget Wi-Fi**, or
- hold the board's **FLASH** (ESP8266) or **BOOT** (ESP32) button **20 seconds**.

The reader restarts with only its hotspot. Join **RFID-READER** (password
RFID12345), open **http://192.168.4.1** and choose a Wi-Fi. The device key and the
taps not yet sent are kept. (A full wipe, which also deletes the device key and the
saved taps: upload again with *Tools → Erase Flash → All Flash Contents*.)

## Opening the reader's page

- **Before it's on your Wi-Fi:** join the reader's hotspot **RFID-READER** (password
  RFID12345) and open **http://192.168.4.1**.
- **Once it's on your Wi-Fi:** from any phone or computer on the same Wi-Fi, open the
  address shown on the OLED, e.g. **http://192.168.1.23**, or
  **http://avilonx-XXXX.local** (XXXX = last 4 characters of the device serial;
  `.local` works on Windows 10/11, Mac, iPhone and most Android phones).
- The reader's own hotspot switches **off 10 minutes after** it joins your Wi-Fi:
  the reader's Wi-Fi is faster and steadier without it. It comes back by itself if
  the Wi-Fi is lost for a minute, or with a short button press.

## What the OLED shows

1. **At start-up (5 s): which modules were found.**
   `RFID RC522: OK / NOT FOUND`, `DS3231 clock: OK / not set` (or
   `Clock module: MISSING`), `Storage: OK / ERROR`, the Wi-Fi name (or `not set`)
   and `Device key: saved / NOT SET`.
2. **On a tap: TAG TAPPED**, the tag in large letters, and whether it was saved.
3. **AvilonX's reply** (5 s), marked `OK` or `!!`.
4. **Otherwise, pages in turn (4 s each):**
   - **Status:** mode, RFID reader, Wi-Fi, AvilonX, taps waiting to send (also `Q:`
     at the top right) and the Philippine time.
   - **WHAT IS NEEDED**, only when something is missing: RC522 wiring, Wi-Fi or
     device key to set, no Wi-Fi, no reply from AvilonX, clock not set, no clock
     module, saved taps nearly full.
   - **OPEN READER PAGE** (on your Wi-Fi): its address and `.local` name, and whether
     the hotspot is on.

## Speed

- The reader uses your router's DNS to find AvilonX.
- **ESP32:** keeps its secure connection to AvilonX open between taps, so each tap
  is sent without a new connection.
- **ESP8266:** resumes the last secure session, which makes connecting about a
  second faster.
