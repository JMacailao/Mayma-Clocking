// Runs every tests/browser/*.browser.cjs file and reports which failed.
const { spawnSync } = require('node:child_process'), fs = require('node:fs'), path = require('node:path');
const only = process.argv[2];
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.browser.cjs') && (!only || f.includes(only))).sort();
const failed = [];
for (const file of files) {
  const run = spawnSync(process.execPath, [path.join(__dirname, 'harness.cjs'), path.join(__dirname, file)], { stdio: 'inherit', timeout: 240000 });
  if (run.status !== 0) failed.push(file);
}
console.log(`\n${files.length - failed.length} of ${files.length} browser test files passed${failed.length ? `; failed: ${failed.join(', ')}` : ''}.`);
process.exit(failed.length ? 1 : 0);
