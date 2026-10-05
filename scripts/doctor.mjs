import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { browserConfig, settings, skillDirectory } from '../runtime.mjs';

const configured = settings();
const browser = browserConfig();
const executable = browser.args[browser.args.indexOf('--executable-path') + 1];
const checks = [];
for (const [name, command, args] of [
  ['python', configured.python, ['-X', 'utf8', '-c', 'import json, sys; print(json.dumps({"executable":sys.executable,"version":sys.version.split()[0]}))']],
  ['mcp', browser.command, [browser.args[0], '--version']],
]) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 15000, windowsHide: true, env: { ...process.env, ...browser.env } });
  checks.push({ name, passed: !result.error && result.status === 0, exitCode: result.status,
    output: (result.stdout || result.stderr || result.error?.message || '').trim().slice(0, 1000) });
}
let launched;
try {
  const require = createRequire(import.meta.url);
  const playwright = createRequire(require.resolve('@playwright/mcp/package.json'))('playwright');
  launched = await playwright.chromium.launch({ executablePath: executable, headless: true, timeout: 15000 });
  checks.push({ name: 'browser', passed: true, output: launched.version() });
} catch (error) {
  checks.push({ name: 'browser', passed: false, output: error.message.slice(0, 1000) });
} finally {
  await launched?.close();
}
checks.push({ name: 'packaged-skills', passed: existsSync(skillDirectory) });
console.log(JSON.stringify({ checks, allPassed: checks.every(c => c.passed), scope: 'Local executable checks only; no competition targets or model API calls.' }, null, 2));
process.exitCode = checks.every(c => c.passed) ? 0 : 1;
