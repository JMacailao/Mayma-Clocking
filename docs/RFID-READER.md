# AvilonX loft RFID reader (ESP8266 or ESP32)

The sketch is `tools/rfid-reader/avilonx-rfid-reader/avilonx-rfid-reader.ino`.
The same file works on an **ESP8266** (NodeMCU, Wemos D1 mini) and an **ESP32**
(ESP32 DevKit): choose the board in the Arduino IDE and the sketch picks the
right pins and libraries.

## Parts

| Part | Notes |
|---|---|
| ESP8266 NodeMCU / Wemos D1 mini, **or** ESP32 DevKit | |
| RC522 RFID reader (13.56 MHz) | **3.3 V only** |
| OLED 128×64, I2C, 4 pins (GND, VCC, SCL, SDA) | 0.96" SSD1306 or 1.3" SH1106. Optional |
| DS1302 clock module with a CR2032 coin cell | Keeps tap times when switched off. Optional but recommended |
| Push button | Holding it 10 s resets the reader's hotspot name/password |

## Arduino IDE

1. Boards: install **esp8266** (by ESP8266 Community) or **esp32** (by Espressif).
2. Libraries (Sketch → Include Library → Manage Libraries): **MFRC522** and **U8g2**.
3. Board: *NodeMCU 1.0 (ESP-12E Module)* or *ESP32 Dev Module*. Upload.
4. For a 1.3" OLED (SH1106) set `#define OLED_SH1106 1` at the top of the sketch.

## Wiring: ESP8266

Everything on **3.3 V** (3V3 pin).

| Module | Module pin | ESP8266 pin |
|---|---|---|
| RC522 | SDA | **D8** (GPIO15) |
| | SCK | **D5** (GPIO14) |
| | MOSI | **D7** (GPIO13) |
| | MISO | **D6** (GPIO12) |
| | RST | **3V3** (not to a pin) |
| | IRQ | not connected |
| | 3.3V / GND | 3V3 / GND |
| OLED | SDA | **D2** (GPIO4) |
| | SCL | **D1** (GPIO5) |
| | VCC / GND | 3V3 / GND |
| DS1302 | CLK | **D3** (GPIO0) |
| | DAT | **D4** (GPIO2) |
| | RST | **D0** (GPIO16) |
| | VCC / GND | 3V3 / GND |
| Button | one leg | **RX** (GPIO3) |
| | other leg | GND |

- The ESP8266 has no free pin left for the RC522's RST, so it goes to 3.3 V and
  the reader is reset by a command when it stops answering.
- The button needs no resistor. The Serial Monitor still works (it uses TX only).
- If the board sometimes does not start, add 4.7 kΩ resistors from D3 to 3.3 V
  and from D4 to 3.3 V. Don't press the board's FLASH button while it runs.

**Built before the OLED?** (RC522 SDA on D2, RST on D1, DS1302 RST on D8, button on
D0 with a 10 kΩ pull-up.) Set `#define LEGACY_WIRING 1` at the top of the sketch:
that wiring keeps working, without the OLED. To add the OLED, rewire as above.

## Wiring: ESP32

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
| DS1302 | CLK | **GPIO25** |
| | DAT | **GPIO26** |
| | RST | **GPIO33** |
| | VCC / GND | 3V3 / GND |
| Button | one leg | **GPIO32** |
| | other leg | GND |

The blue LED (GPIO2) blinks once for a clocked tap and 3 times for a refusal.

## What the OLED shows

1. **At start-up (5 s): which modules were found.**
   `RFID RC522: OK / NOT FOUND`, `DS1302 clock: OK / not set / MISSING`,
   `Storage: OK / ERROR`, the Wi-Fi name (or `not set`) and `Device key: saved /
   NOT SET`.
2. **On a tap: TAG TAPPED**, the tag in large letters, and whether it was saved:
   *Saved. Sending to AvilonX…*, *Saved. No internet: sent later*, *Already saved*
   or *NOT SAVED*.
3. **AvilonX's reply** (5 s): for example *Clocked …*, *Already clocked*, or a
   refusal such as *Reader not registered* (marked `!!`).
4. **Otherwise, two pages in turn (4 s each):**
   - **Status:** the mode (CLOCKING / REGISTER), the RFID reader, Wi-Fi,
     AvilonX (online / no reply / no key), taps waiting to send (also `Q:` at the
     top right) and the Philippine time.
   - **WHAT IS NEEDED**, only when something is missing: check the RC522 wiring,
     set the Wi-Fi or device key (join the reader's hotspot, open
     `192.168.4.1`), no Wi-Fi, no reply from AvilonX, clock not set (needs
     internet once), no DS1302, saved taps nearly full.

Without an OLED the reader works the same; everything is also on its page at
`http://192.168.4.1` and in the Serial Monitor (115200 baud).
