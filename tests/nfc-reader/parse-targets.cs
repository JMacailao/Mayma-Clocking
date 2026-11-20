using System;
static class T {
  static int fails = 0;
  static byte[] B(string hex) { hex = hex.Replace(" ", ""); var b = new byte[hex.Length / 2]; for (int i = 0; i < b.Length; i++) b[i] = Convert.ToByte(hex.Substring(2 * i, 2), 16); return b; }
  static void Check(string name, string hex, string want) {
    var r = B(hex); var got = string.Join(",", AvilonXPcsc.ParseTargets(r, r.Length));
    Console.WriteLine((got == want ? "ok   " : "FAIL ") + name + ": " + got); if (got != want) fails++;
  }
  static int Main() {
    // Two NTAG (7-byte UID, SEL_RES 00) tags.
    Check("two tags", "D5 4B 02 01 0044 00 07 04A23B1C5D8000 02 0044 00 07 04112233445566 9000", "04A23B1C5D8000,04112233445566");
    Check("one tag", "D5 4B 01 01 0044 00 07 04A23B1C5D8000 9000", "04A23B1C5D8000");
    Check("MIFARE Classic 4-byte", "D5 4B 01 01 0004 08 04 6C811F4A 9000", "6C811F4A");
    // A card with ISO-DEP (SEL_RES 20) sends an ATS: length byte 05 then 4 bytes.
    Check("ATS then second tag", "D5 4B 02 01 0344 20 07 04AABBCCDDEEFF 05 75778002 02 0044 00 04 11223344 9000", "04AABBCCDDEEFF,11223344");
    Check("no tags", "D5 4B 00 9000", "");
    Check("error status", "6300", "");
    Check("cut short", "D5 4B 02 01 0044 00 07 04A23B 9000", "");
    Check("odd UID length", "D5 4B 01 01 0044 00 05 0102030405 9000", "");
    Check("same tag twice", "D5 4B 02 01 0044 00 04 6C811F4A 02 0044 00 04 6C811F4A 9000", "6C811F4A");
    return fails;
  }
}
