import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const packageDirectory = dirname(fileURLToPath(import.meta.url));
export const skillDirectory = join(packageDirectory, 'skills');

const absolutePathKeys = ['browserExecutable', 'browserCache', 'browserOutputDir', 'browserUserDataDir'];
const booleanKeys = [
  'browserHeadless', 'browserIsolated', 'browserExtension', 'browserUnrestrictedFileAccess',
  'browserNoSandbox', 'browserWebmcp', 'browserSaveSession', 'browserIgnoreHttpsErrors',
  'browserFailOnStartupError',
];
const integerKeys = ['browserCallTimeoutMs', 'browserActionTimeoutMs', 'browserNavigationTimeoutMs', 'browserOutputMaxSize'];
const nonNegativeIntegerKeys = ['browserIdleTimeoutMs'];
const keys = new Set([
  'python', 'wslDistro', 'linuxPython', 'sage', 'pwndbg', 'tshark', 'radare2',
  'browserNode', 'browserCdpEndpoint', 'browserProfileDirName', 'browserCaps', 'browserViewport',
  ...absolutePathKeys, ...booleanKeys, ...integerKeys, ...nonNegativeIntegerKeys,
]);

function flag(value, key) {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`CTF setting ${key} must be "true" or "false"`);
}

function positiveInteger(value, key) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`CTF setting ${key} must be a positive integer`);
  return parsed;
}

function nonNegativeInteger(value, key) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`CTF setting ${key} must be a non-negative integer`);
  return parsed;
}

function defaultHeadless(options) {
  const platform = options?.platform || process.platform;
  if (platform !== 'linux') return false;
  const env = options?.env ?? process.env;
  return !(env.DISPLAY || env.WAYLAND_DISPLAY);
}

export function settings({ env = process.env, platform = process.platform, home = homedir() } = {}) {
  const dshHome = env.DSH_HOME || join(home, '.dsh');
  const configPath = env.DSH_CTF_CONFIG || join(dshHome, 'ctf-plugin.json');
  if (env.DSH_CTF_CONFIG && !existsSync(configPath)) throw new Error(`DSH_CTF_CONFIG does not exist: ${configPath}`);
  const supplied = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '')) : {};
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) throw new Error('CTF settings must be a JSON object');
  for (const [key, value] of Object.entries(supplied)) {
    if (!keys.has(key)) throw new Error(`Unknown CTF setting: ${key}`);
    if (typeof value !== 'string' || !value.trim() || /[\r\n\0]/.test(value)) throw new Error(`CTF setting ${key} must be a nonempty single-line string`);
  }
  for (const key of absolutePathKeys) {
    if (supplied[key] && !isAbsolute(supplied[key])) throw new Error(`CTF setting ${key} must be an absolute path`);
  }
  for (const key of booleanKeys) flag(supplied[key], key);
  for (const key of integerKeys) positiveInteger(supplied[key], key);
  for (const key of nonNegativeIntegerKeys) nonNegativeInteger(supplied[key], key);
  if (flag(supplied.browserExtension, 'browserExtension') === true && supplied.browserCdpEndpoint) {
    throw new Error('Set either browserExtension or browserCdpEndpoint, not both');
  }
  return {
    python: platform === 'win32' ? 'python' : 'python3',
    wslDistro: 'Ubuntu', linuxPython: 'python3', sage: 'sage', pwndbg: 'pwndbg',
    tshark: 'tshark', radare2: 'radare2',
    browserNode: env.DSH_DESKTOP_NODE_EXECUTABLE || process.execPath,
    browserOutputDir: join(dshHome, 'artifacts', 'ctf-browser'),
    ...supplied,
  };
}

export function persona(options) {
  const configured = settings(options);
  return readFileSync(join(packageDirectory, 'prompts', 'ctf.md'), 'utf8')
    + '\n运行配置（执行前检查工具是否可用）：\n'
    + JSON.stringify({ platform: options?.platform || process.platform, skillDirectory, ...configured }, null, 2)
    + '\nPowerShell 示例先赋值 $ctfPython、$ctfSkills、$ctfTshark，分别采用上方 python、skillDirectory、tshark。脚本也可从已加载技能的目录定位。\n';
}

export function browserConfig(options) {
  const configured = settings(options);
  const mcpManifest = require.resolve('@playwright/mcp/package.json');
  const mcpRequire = createRequire(mcpManifest);
  const extension = flag(configured.browserExtension, 'browserExtension') ?? false;
  const cdp = configured.browserCdpEndpoint;
  if (configured.browserCache && !configured.browserExecutable && !extension && !cdp) {
    throw new Error('Set browserExecutable together with browserCache, or set PLAYWRIGHT_BROWSERS_PATH before starting dsh');
  }

  const args = [join(dirname(mcpManifest), 'cli.js')];
  if (flag(configured.browserHeadless, 'browserHeadless') ?? defaultHeadless(options)) args.push('--headless');
  if (extension) {
    args.push('--extension');
    if (configured.browserProfileDirName) args.push('--profile-dir-name', configured.browserProfileDirName);
  } else if (cdp) {
    args.push('--cdp-endpoint', cdp);
  } else {
    args.push('--executable-path', configured.browserExecutable || mcpRequire('playwright').chromium.executablePath());
    if (flag(configured.browserIsolated, 'browserIsolated') ?? false) args.push('--isolated');
    else if (configured.browserUserDataDir) args.push('--user-data-dir', configured.browserUserDataDir);
  }
  if (flag(configured.browserUnrestrictedFileAccess, 'browserUnrestrictedFileAccess') ?? true) args.push('--allow-unrestricted-file-access');
  if (flag(configured.browserNoSandbox, 'browserNoSandbox') ?? false) args.push('--no-sandbox');
  if (!(flag(configured.browserWebmcp, 'browserWebmcp') ?? false)) args.push('--no-webmcp');
  if (flag(configured.browserSaveSession, 'browserSaveSession') ?? false) args.push('--save-session');
  if (flag(configured.browserIgnoreHttpsErrors, 'browserIgnoreHttpsErrors') ?? false) args.push('--ignore-https-errors');
  if (configured.browserCaps) args.push('--caps', configured.browserCaps);
  if (configured.browserViewport) args.push('--viewport-size', configured.browserViewport);
  args.push('--codegen', 'python',
    '--timeout-action', String(positiveInteger(configured.browserActionTimeoutMs, 'browserActionTimeoutMs') ?? 30000),
    '--timeout-navigation', String(positiveInteger(configured.browserNavigationTimeoutMs, 'browserNavigationTimeoutMs') ?? 120000),
    '--idle-timeout', String(nonNegativeInteger(configured.browserIdleTimeoutMs, 'browserIdleTimeoutMs') ?? 1800000),
    '--output-max-size', String(positiveInteger(configured.browserOutputMaxSize, 'browserOutputMaxSize') ?? 134217728),
    '--output-dir', configured.browserOutputDir);

  return {
    serverName: 'ctf_browser', transport: 'stdio', command: configured.browserNode,
    args,
    env: { ELECTRON_RUN_AS_NODE: '1', ...(configured.browserCache ? { PLAYWRIGHT_BROWSERS_PATH: configured.browserCache } : {}) },
    cwd: packageDirectory,
    toolCallTimeoutMs: positiveInteger(configured.browserCallTimeoutMs, 'browserCallTimeoutMs') ?? 300000,
    failOnStartupError: flag(configured.browserFailOnStartupError, 'browserFailOnStartupError') ?? false,
  };
}
