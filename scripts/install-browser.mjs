import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const mcpRequire = createRequire(require.resolve('@playwright/mcp/package.json'));
const cli = join(dirname(mcpRequire.resolve('playwright/package.json')), 'cli.js');
const child = spawnSync(process.execPath, [cli, 'install', 'chromium'], { stdio: 'inherit', windowsHide: true });
if (child.error) throw child.error;
process.exitCode = child.status ?? 1;
