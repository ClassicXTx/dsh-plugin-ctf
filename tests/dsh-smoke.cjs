const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {pathToFileURL} = require('node:url');
const {createServer} = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');

const repo = path.resolve(process.argv[2] || process.env.DSH_ROOT || (() => { throw new Error('Provide the built dsh source root'); })());
const node = process.execPath;
const python = process.env.DSH_CTF_PYTHON;
assert.ok(python, 'Set DSH_CTF_PYTHON to an existing Python toolbox executable');
const outputDir = path.resolve(process.argv[3] || path.join(__dirname, 'reports'));
const runs = path.join(outputDir, 'runs');
fs.mkdirSync(runs, {recursive: true});
const runDir = fs.mkdtempSync(path.join(runs, 'run-'));
const home = path.join(runDir, 'dsh-home');
const workspace = path.join(runDir, 'challenge-workspace');
const fixtureScript = path.join(workspace, 'solve-fixture.py');
fs.mkdirSync(workspace, {recursive: true});
fs.copyFileSync(path.join(__dirname, 'fixture.py'), fixtureScript);

const yaml = createRequire(path.join(repo, 'package.json'))('js-yaml');
const jsType = new yaml.Type('tag:yaml.org,2002:js', {kind: 'scalar', construct: value => ({__js: value}), predicate: value => value && typeof value.__js === 'string', represent: value => value.__js});
const yamlSchema = yaml.DEFAULT_SCHEMA.extend([jsType]);
const pluginRoot = path.resolve(__dirname, '..');
const configPath = process.env.DSH_CTF_CONFIG || path.join(repo, '.data/ctf-plugin.json');
assert.ok(fs.existsSync(configPath), 'Set DSH_CTF_CONFIG to a configured local tool path file');
const localSettings = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
const mcp = createRequire(path.join(pluginRoot, 'package.json'))('./runtime.mjs').browserConfig({env: {DSH_CTF_CONFIG: configPath}});
fs.mkdirSync(home, {recursive: true});
// Tests own a headless, isolated browser even when deployment defaults attach to a user browser.
const testSettings = {...localSettings, browserHeadless: 'true', browserIsolated: 'true', browserExtension: 'false', browserOutputDir: path.join(runDir, 'browser-artifacts')};
delete testSettings.browserCdpEndpoint;
delete testSettings.browserUserDataDir;
delete testSettings.browserProfileDirName;
fs.writeFileSync(path.join(home, 'ctf-plugin.json'), JSON.stringify(testSettings));
for (const directory of [path.join(home, 'skills/non-ctf-fixture'), path.join(workspace, '.agents/skills/non-ctf-fixture')]) {
  fs.mkdirSync(directory, {recursive: true});
  fs.writeFileSync(path.join(directory, 'SKILL.md'), '---\nname: non-ctf-fixture\ndescription: Shared-root isolation fixture.\n---\nUNRELATED_SHARED_SKILL_SENTINEL\n');
}
const profileDir = path.join(home, 'profiles/web');
fs.mkdirSync(path.join(profileDir, 'node_modules'), {recursive: true});
fs.symlinkSync(pluginRoot, path.join(profileDir, 'node_modules/dsh-plugin-ctf'), 'junction');
fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({name:'ctf-isolated-smoke', private:true,
  dependencies:{'dsh-plugin-ctf':'link:'+pluginRoot},
  dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','dsh-plugin-ctf']}}}));

const summary = {passed: false, launcher: 'built Web CLI', isolatedDataHome: true, externalModelRequests: 0, contestRequests: 0, runDirectory: runDir, runs: [], cleanup: []};
const owned = new Set();
const fixtureHits = [];
const fixtureServer = createServer((request, response) => {
  fixtureHits.push(request.url);
  try {
    const analysis = JSON.parse(fs.readFileSync(path.join(workspace, 'artifacts/analysis.json'), 'utf8'));
    response.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
    response.end('<!doctype html><html><head><title>CTF local stability fixture</title></head><body><h1>Local fixture</h1><p id="proof" data-sha256="' + analysis.sha256 + '">' + analysis.proof + '</p></body></html>');
  } catch {
    response.writeHead(503, {'content-type': 'text/plain'});
    response.end('Fixture not generated yet');
  }
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function timeout(promise, ms, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {timer = setTimeout(() => reject(new Error(label)), ms);})]); }
  finally { clearTimeout(timer); }
}
async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => socket.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}
async function processTable() {
  const powershell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  return new Promise((resolve, reject) => {
    const child = spawn(powershell, ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress'], {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    child.stdout.on('data', chunk => {output += chunk;});
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(JSON.parse(output)) : reject(new Error('Process inventory failed')));
  });
}
function descendantPids(table, parent) {
  const pids = new Set([parent]);
  for (let changed = true; changed;) {
    changed = false;
    for (const entry of table) if (pids.has(entry.ParentProcessId) && !pids.has(entry.ProcessId)) {pids.add(entry.ProcessId); changed = true;}
  }
  return pids;
}
async function mcpPid(server) {
  const descendants = descendantPids(await processTable(), server.child.pid);
  descendants.delete(server.child.pid);
  assert.ok(descendants.size > 0, 'No owned Web descendants to inspect');
  const filter = [...descendants].map(pid => 'ProcessId = ' + Number(pid)).join(' OR ');
  const powershell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const rows = await new Promise((resolve, reject) => {
    const child = spawn(powershell, ['-NoProfile', '-NonInteractive', '-Command', "Get-CimInstance Win32_Process -Filter '" + filter + "' | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"], {windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']});
    let output = '';
    child.stdout.on('data', chunk => {output += chunk;});
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(JSON.parse(output)) : reject(new Error('Owned MCP inspection failed')));
  });
  const candidates = (Array.isArray(rows) ? rows : [rows]).filter(row => row.CommandLine?.replaceAll('\\', '/').includes(mcp.args[0].replaceAll('\\', '/')));
  assert.equal(candidates.length, 1, 'Expected exactly one MCP server under this test Web process');
  return candidates[0].ProcessId;
}
async function crashAndRecoverMcp(server) {
  assert.equal(mcp.reconnect, undefined, 'Crash recovery regression expects shipped default reconnect policy');
  const before = await mcpPid(server);
  const start = server.events.length;
  process.kill(before, 'SIGKILL');
  await timeout((async () => {
    while (!server.events.slice(start).some(item => item.kind === 'mcp-supervisor' && item.state === 'reconnected')) {
      if (server.child.exitCode !== null) throw new Error('Web exited after MCP crash');
      await delay(100);
    }
  })(), 30000, 'MCP supervisor did not reconnect');
  const after = await mcpPid(server);
  assert.notEqual(after, before, 'MCP supervisor did not replace crashed process');
  summary.mcpRecovery = {defaultPolicy: true, ownedProcessReplaced: true, supervisorResyncedTools: true, webStayedRunning: server.child.exitCode === null};
}
async function stopServer(server) {
  if (!owned.has(server)) return;
  const table = await processTable();
  const descendants = descendantPids(table, server.child.pid);
  // Windows SIGTERM does not provide Unix-style graceful shutdown. Close browser via its tool
  // first, then terminate the owned Web/MCP process tree and await every observed process exit.
  await new Promise((resolve, reject) => {
    const killer = spawn(path.join(process.env.SystemRoot, 'System32/taskkill.exe'), ['/PID', String(server.child.pid), '/T', '/F'], {windowsHide: true, stdio: 'ignore'});
    killer.on('error', reject);
    killer.on('exit', resolve);
  });
  await timeout(server.exited, 10000, 'Web did not exit during cleanup');
  let remaining = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    remaining = [...descendants].filter(pid => {try {process.kill(pid, 0); return true;} catch {return false;}});
    if (remaining.length === 0) break;
    await delay(100);
  }
  assert.equal(remaining.length, 0, 'Owned Web/MCP descendants survived cleanup');
  summary.cleanup.push({observedProcesses: descendants.size, remainingProcesses: remaining.length});
  owned.delete(server);
}
async function startServer(fixtureUrl) {
  const port = await freePort();
  const patch = path.join(runDir, 'mock.patch.yml');
  fs.writeFileSync(patch, yaml.dump([
    {id: 'agent-default-model', config: {provider: 'ctf-stability-local', model: 'fixture'}},
    ...['session-title-llm', 'session-log-deepseek', 'llm-deepseek', 'llm-pi-ai'].map(id => ({id, disabled: true})),
    {insert: [{id: 'ctf-stability-mock', name: pathToFileURL(path.join(__dirname, 'mock-provider.mjs')).href, config: {repo, python, fixtureScript, workspace, fixtureUrl, runDir}}]},
  ], {schema: yamlSchema, lineWidth: -1}));
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/KEY|SECRET|TOKEN|PASSWORD/i.test(name) && !name.startsWith('DSH_') && name !== 'NODE_OPTIONS'));
  Object.assign(env, {PATH: path.dirname(node) + ';' + (env.PATH || env.Path || ''), DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', DSH_PERMISSION_MODE: 'danger-full-access', COREPACK_HOME: path.join(repo, '.runtime/corepack')});
  delete env.Path;
  const child = spawn(node, [path.join(repo, 'apps/cli/lib/bin.js'), 'web', '--patch', patch, '--host', '127.0.0.1', '--port', String(port), '--no-open'], {cwd: workspace, windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe']});
  const server = {child, port, events: [], logs: ''};
  owned.add(server);
  server.exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({code, signal})));
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => {readyResolve = resolve; readyReject = reject;});
  for (const stream of [child.stdout, child.stderr]) {
    let pending = '';
    stream.on('data', chunk => {
      const text = chunk.toString();
      server.logs += text;
      pending += text;
      const match = server.logs.match(new RegExp('dsh web: (http://127\\.0\\.0\\.1:' + port + '/\\?token=[^\\s\\x1b]+)'));
      if (match) readyResolve(match[1]);
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) {
        const start = line.indexOf('CTF_STABILITY_EVENT ');
        if (start >= 0) server.events.push(JSON.parse(line.slice(start + 'CTF_STABILITY_EVENT '.length)));
      }
    });
  }
  child.once('error', readyReject);
  child.once('exit', code => readyReject(new Error('Web exited before ready: ' + code)));
  const auth = await fetch(await timeout(ready, 60000, 'Web startup timed out'), {redirect: 'manual', signal: AbortSignal.timeout(10000)});
  const cookie = auth.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.ok(cookie, 'Web token exchange did not produce cookie');
  const base = 'http://127.0.0.1:' + port;
  server.rpc = async (method, args = {}) => {
    const response = await fetch(base + '/api/' + method, {method: 'POST', signal: AbortSignal.timeout(45000), headers: {cookie, origin: base, 'content-type': 'application/json'}, body: JSON.stringify({type: 'client-request', rpcId: crypto.randomUUID(), method, payload: {args}})});
    const body = await response.json();
    assert.ok(body.result?.ok, 'RPC failed: ' + method + ' ' + JSON.stringify(body));
    return body.result.value;
  };
  assert.equal((await fetch(base, {headers: {cookie}, signal: AbortSignal.timeout(10000)})).status, 200);
  const roster = await server.rpc('agentPresets/list');
  assert.ok(roster.presets.some(item => item.id === 'ctf' && !item.broken), 'CTF preset broken');
  return server;
}
function textContent(block) {return block.content.filter(item => item.type === 'text').map(item => item.text).join('\n');}
function verifyResults(events, mode, expectedCount) {
  const results = events.filter(item => item.kind === 'session' && item.event.type === 'tool/result').map(item => item.event.data.message);
  assert.equal(results.length, expectedCount, 'Unexpected tool result count');
  const analysis = JSON.parse(fs.readFileSync(path.join(workspace, 'artifacts/analysis.json'), 'utf8'));
  for (const result of results) {
    assert.equal(result.isError, false, 'Tool errored: ' + result.toolCallId);
    const text = textContent(result);
    if (result.toolCallId.endsWith('-skill')) assert.match(text, /<skill_content name="ctf-workbench">/);
    if (result.toolCallId.endsWith('-python')) {
      assert.doesNotMatch(text, /\[stderr\]|\[exit code:|\[timed out|\[sandbox:/);
      const observed = JSON.parse(text.trim());
      assert.equal(observed.marker, 'CTF_PYTHON_' + mode.toUpperCase() + '_OK');
      assert.equal(observed.proof, 'CTF_LOCAL_FIXTURE_OK_中文_20260922');
      assert.equal(observed.sha256, analysis.sha256);
      assert.equal(path.resolve(observed.python).toLowerCase(), path.resolve(python).toLowerCase());
      assert.equal(observed.aesRoundtrip, true);
      assert.equal(observed.z3Solution, 42);
    }
    // MCP's default output mode links the accessibility snapshot instead of inlining it.
    if (result.toolCallId.endsWith('-navigate')) assert.ok(text.includes('CTF local stability fixture') && text.includes('http://127.0.0.1:'), 'Browser navigation did not observe the local fixture page');
    if (result.toolCallId.endsWith('-evaluate')) assert.ok(text.includes(analysis.proof) && text.includes(analysis.sha256), 'Browser did not read actual Python-produced proof/hash');
    if (result.toolCallId.endsWith('-close')) assert.ok(text.length > 0, 'Browser close returned no result');
  }
  return results.map(result => ({callId: result.toolCallId, isError: result.isError, contentBytes: Buffer.byteLength(textContent(result))}));
}
async function runTurn(server, sessionId, mode) {
  const start = server.events.length;
  const prompt = {initial: 'CTF_STABILITY_INITIAL: execute the local fixture regression.', resumed: 'CTF_STABILITY_RESUME: recheck the same fixture after process restart.', reconnect: 'CTF_STABILITY_RECONNECT: read the same local fixture after automatic MCP recovery.'}[mode];
  await server.rpc('session/prompt', {request: {requestId: 'stability-' + mode, sessionId, mode: 'queue', content: [{type: 'text', text: prompt}]}});
  await timeout((async () => {
    while (!server.events.slice(start).some(item => item.kind === 'session' && item.event.type === 'turn/end')) {
      if (server.child.exitCode !== null) throw new Error('Web exited during turn');
      await delay(100);
    }
  })(), 120000, 'Model-driven tool workflow timed out');
  const events = server.events.slice(start);
  fs.writeFileSync(path.join(runDir, mode + '.events.json'), JSON.stringify(events, null, 2) + '\n');
  const end = events.find(item => item.kind === 'session' && item.event.type === 'turn/end').event;
  assert.equal(end.data.reason.kind, 'completed', 'Turn failed: ' + JSON.stringify(end.data.reason));
  const results = verifyResults(events, mode, {initial: 5, resumed: 4, reconnect: 3}[mode]);
  const final = 'CTF_STABILITY_' + mode.toUpperCase() + '_OK';
  assert.ok(events.some(item => item.kind === 'session' && item.event.type === 'assistant/message' && JSON.stringify(item.event.data).includes(final)), 'Final model output missing');
  summary.runs.push({mode, completed: true, toolResults: results, restoredModelHistory: mode === 'resumed' && events.some(item => item.kind === 'model-start' && item.restoredHistory)});
  return end.seq;
}
async function main() {
  await new Promise(resolve => fixtureServer.listen(0, '127.0.0.1', resolve));
  const fixtureUrl = 'http://127.0.0.1:' + fixtureServer.address().port + '/fixture';
  let server = await startServer(fixtureUrl);
  const created = await server.rpc('session/create', {request: {cwd: workspace, agentPreset: 'ctf'}});
  const skills = await server.rpc('skills/list', {request: {sessionId: created.sessionId}});
  assert.equal(skills.skills.filter(skill => skill.name.startsWith('ctf-')).length, 11);
  assert.ok(skills.skills.some(skill => skill.name === 'ctf-workbench'));
  assert.equal(skills.skills.length, 11);
  assert.ok(!skills.skills.some(skill => skill.name === 'non-ctf-fixture'));
  summary.sharedSkillRootsExcluded = true;
  summary.packagedSkills = 11;
  summary.skillsDiscovered = skills.skills.length;
  const throughSeq = await runTurn(server, created.sessionId, 'initial');
  const before = crypto.createHash('sha256').update(fs.readFileSync(path.join(workspace, 'artifacts/harmless-fixture.bin'))).digest('hex');
  await stopServer(server);
  server = await startServer(fixtureUrl);
  const page = await server.rpc('session/page', {request: {address: {kind: 'session', sessionId: created.sessionId}, throughSeq, maxMessages: 100}});
  assert.ok(page.records.some(record => record.event.type === 'assistant/message' && JSON.stringify(record.event.data).includes('CTF_STABILITY_INITIAL_OK')), 'Cold page lost initial completion');
  assert.equal(page.records.filter(record => record.event.type === 'tool/result').length, 5, 'Cold page lost tool results');
  summary.coldHistory = {records: page.records.length, toolResults: 5, initialCompletion: true};
  await runTurn(server, created.sessionId, 'resumed');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(workspace, 'artifacts/harmless-fixture.bin'))).digest('hex'), before, 'Resume modified original fixture');
  await crashAndRecoverMcp(server);
  await runTurn(server, created.sessionId, 'reconnect');
  await stopServer(server);
  summary.fixtureRequests = fixtureHits.length;
  summary.passed = true;
}
main().catch(error => {
  summary.error = {name: error.name, message: error.message};
  process.exitCode = 1;
}).finally(async () => {
  for (const server of [...owned]) {
    fs.writeFileSync(path.join(runDir, 'failure-log.txt'), server.logs.replace(/\?token=[^\s]+/g, '?token=[redacted]'));
    try {await stopServer(server);} catch (error) {summary.cleanupError = error.message; summary.passed = false; process.exitCode = 1;}
  }
  fixtureServer.closeAllConnections();
  await new Promise(resolve => fixtureServer.close(resolve));
  fs.writeFileSync(path.join(runDir, 'result.json'), JSON.stringify(summary, null, 2) + '\n');
  fs.writeFileSync(path.join(outputDir, 'latest-result.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
});
