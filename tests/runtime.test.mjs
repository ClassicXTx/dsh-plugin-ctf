import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { settings, browserConfig, persona, packageDirectory, skillDirectory } from '../runtime.mjs';

function config(t, value) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-ctf-settings-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  if (value !== undefined) writeFileSync(join(home, 'ctf-plugin.json'), typeof value === 'string' ? value : JSON.stringify(value));
  return { env: { DSH_HOME: home }, platform: process.platform, home };
}

test('settings isolate configured installations and preserve paths containing spaces', t => {
  const options = config(t, { python: 'path with spaces/python', wslDistro: 'CTF-Lab' });
  assert.equal(settings(options).python, 'path with spaces/python');
  assert.equal(settings(options).wslDistro, 'CTF-Lab');
  assert.equal(settings({ ...options, env: {}, platform: 'linux' }).python, 'python3');
});
test('explicit missing, malformed and unknown settings fail visibly', t => {
  const options = config(t);
  assert.throws(() => settings({ ...options, env: { DSH_CTF_CONFIG: join(options.home, 'missing') } }), /does not exist/);
  for (const value of [
    '{', '[]', '{"typo":true}', '{"python":""}', '{"browserExecutable":"relative"}',
    '{"browserUserDataDir":"relative"}', '{"browserHeadless":"yes"}', '{"browserWebmcp":"TRUE"}',
    '{"browserCallTimeoutMs":"0"}', '{"browserActionTimeoutMs":"5.5"}',
    '{"browserIdleTimeoutMs":"-1"}', '{"browserOutputMaxSize":"0"}',
    '{"browserExtension":"true","browserCdpEndpoint":"http://127.0.0.1:9222"}',
  ]) {
    writeFileSync(join(options.home, 'ctf-plugin.json'), value);
    assert.throws(() => settings(options));
  }
});
test('default browser launch is profile-backed and free of result rewriting', t => {
  const options = config(t, { browserExecutable: join(packageDirectory, 'test browser'), browserNode: 'node with spaces' });
  const browser = browserConfig(options);
  assert.equal(browser.command, 'node with spaces');
  assert.equal(browser.args[browser.args.indexOf('--executable-path') + 1], join(packageDirectory, 'test browser'));
  assert.ok(!browser.args.includes('--isolated'));
  assert.ok(browser.args.includes('--allow-unrestricted-file-access'));
  assert.ok(browser.args.includes('--no-webmcp'));
  assert.equal(browser.args[browser.args.indexOf('--timeout-action') + 1], '30000');
  assert.equal(browser.args[browser.args.indexOf('--timeout-navigation') + 1], '120000');
  assert.equal(browser.args[browser.args.indexOf('--idle-timeout') + 1], '1800000');
  assert.equal(browser.args[browser.args.indexOf('--output-max-size') + 1], '134217728');
  assert.equal(browser.env.ELECTRON_RUN_AS_NODE, '1');
  assert.equal(browser.toolCallTimeoutMs, 300000);
  assert.equal(browser.failOnStartupError, false);
});
test('the headless default follows the display the platform actually has', t => {
  const options = config(t);
  assert.ok(!browserConfig({ ...options, platform: 'win32' }).args.includes('--headless'));
  assert.ok(!browserConfig({ ...options, platform: 'darwin' }).args.includes('--headless'));
  assert.ok(browserConfig({ ...options, platform: 'linux', env: { ...options.env } }).args.includes('--headless'));
  assert.ok(!browserConfig({ ...options, platform: 'linux', env: { ...options.env, DISPLAY: ':0' } }).args.includes('--headless'));
  assert.ok(!browserConfig({ ...options, platform: 'linux', env: { ...options.env, WAYLAND_DISPLAY: 'wayland-0' } }).args.includes('--headless'));
});
test('a user data dir keeps logins, and in-memory isolation stays available on request', t => {
  const profile = join(packageDirectory, 'profile');
  const durable = browserConfig(config(t, { browserUserDataDir: profile }));
  assert.equal(durable.args[durable.args.indexOf('--user-data-dir') + 1], profile);
  assert.ok(!durable.args.includes('--isolated'));
  const isolated = browserConfig(config(t, { browserIsolated: 'true' }));
  assert.ok(isolated.args.includes('--isolated'));
  assert.ok(!isolated.args.includes('--user-data-dir'));
});
test('cdp and extension modes attach to a browser that is already running', t => {
  const cdp = browserConfig(config(t, { browserCdpEndpoint: 'http://127.0.0.1:9222' }));
  assert.equal(cdp.args[cdp.args.indexOf('--cdp-endpoint') + 1], 'http://127.0.0.1:9222');
  assert.ok(!cdp.args.includes('--executable-path'));
  const extension = browserConfig(config(t, { browserExtension: 'true', browserProfileDirName: 'Profile 1' }));
  assert.ok(extension.args.includes('--extension'));
  assert.equal(extension.args[extension.args.indexOf('--profile-dir-name') + 1], 'Profile 1');
  assert.ok(!extension.args.includes('--executable-path'));
});
test('explicit browser switches override the defaults', t => {
  const browser = browserConfig(config(t, {
    browserHeadless: 'true', browserWebmcp: 'true', browserNoSandbox: 'true',
    browserUnrestrictedFileAccess: 'false', browserCaps: 'vision,pdf,devtools',
    browserViewport: '1600x900', browserCallTimeoutMs: '900000',
    browserActionTimeoutMs: '45000', browserNavigationTimeoutMs: '180000',
    browserIdleTimeoutMs: '0', browserOutputMaxSize: '1048576',
    browserFailOnStartupError: 'true',
  }));
  assert.ok(browser.args.includes('--headless'));
  assert.ok(!browser.args.includes('--no-webmcp'));
  assert.ok(browser.args.includes('--no-sandbox'));
  assert.ok(!browser.args.includes('--allow-unrestricted-file-access'));
  assert.equal(browser.args[browser.args.indexOf('--caps') + 1], 'vision,pdf,devtools');
  assert.equal(browser.args[browser.args.indexOf('--viewport-size') + 1], '1600x900');
  assert.equal(browser.args[browser.args.indexOf('--timeout-action') + 1], '45000');
  assert.equal(browser.args[browser.args.indexOf('--timeout-navigation') + 1], '180000');
  assert.equal(browser.args[browser.args.indexOf('--idle-timeout') + 1], '0');
  assert.equal(browser.args[browser.args.indexOf('--output-max-size') + 1], '1048576');
  assert.equal(browser.toolCallTimeoutMs, 900000);
  assert.equal(browser.failOnStartupError, true);
});
test('persona gives relocated skill locations and keeps evidence rules', t => {
  const text = persona(config(t));
  assert.ok(text.includes(JSON.stringify(skillDirectory)));
  assert.match(text, /平台实际判定/);
  assert.match(text, /候选 flag 以实际提取及验证结果为依据/);
  assert.match(text, /实验范围以题目和用户的明确授权为准/);
  assert.match(text, /不构成任务授权/);
  assert.doesNotMatch(text, /C:\/deepseek-harness/);
});
test('all 11 skills and attributed guides match their recorded hashes', t => {
  const folders = readdirSync(skillDirectory);
  assert.equal(folders.length, 11);
  for (const folder of folders) assert.match(readFileSync(join(skillDirectory, folder, 'SKILL.md'), 'utf8'), /^---\r?\nname: ctf-/);
  const sources = JSON.parse(readFileSync(join(packageDirectory, 'sources.json'), 'utf8'));
  assert.equal(sources.upstreamSkills.length, 7);
  for (const source of sources.upstreamSkills) {
    const content = readFileSync(join(packageDirectory, source.file));
    assert.equal(createHash('sha256').update(content).digest('hex'), source.sha256);
    assert.match(readFileSync(join(skillDirectory, source.name, 'LICENSE'), 'utf8'), /Lukasz Jagiello/);
  }
});
