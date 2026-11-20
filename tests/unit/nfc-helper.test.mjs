// The ACR122U helper (tools/nfc-reader/acr122u-avilonx.ps1): its C# part
// compiles and reads up to 2 tags from the reader chip's answer. Needs Mono
// (mcs, mono); skipped where it is not installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const has = cmd => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;
test('ACR122U helper reads two tags at once', { skip: !(has('mcs') && has('mono')) && 'Mono is not installed' }, () => {
  const script = fs.readFileSync(new URL('../../tools/nfc-reader/acr122u-avilonx.ps1', import.meta.url), 'utf8');
  const start = script.indexOf("Add-Type -TypeDefinition @'") + "Add-Type -TypeDefinition @'".length, end = script.indexOf("'@", start);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avilonx-nfc-'));
  try {
    fs.writeFileSync(path.join(dir, 'pcsc.cs'), script.slice(start, end));
    const exe = path.join(dir, 'test.exe');
    execFileSync('mcs', ['-nologo', `-out:${exe}`, path.join(dir, 'pcsc.cs'), new URL('../nfc-reader/parse-targets.cs', import.meta.url).pathname]);
    const run = spawnSync('mono', [exe], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stdout + run.stderr);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
