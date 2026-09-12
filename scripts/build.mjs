import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.env.WORKSPACE_PATH || process.cwd();
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function run(command, args) {
  const useWindowsShell = process.platform === 'win32' && command === pnpm;
  const result = spawnSync(useWindowsShell ? (process.env.ComSpec || 'cmd.exe') : command,
    useWindowsShell ? ['/d', '/s', '/c', [command, ...args].join(' ')] : args, {
    cwd: root,
    stdio: 'inherit',
    env: command === pnpm ? { ...process.env, CI: process.env.CI || 'true' } : process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('Installing dependencies...');
run(pnpm, ['install', '--prefer-frozen-lockfile', '--prefer-offline', '--loglevel', 'debug', '--reporter=append-only']);

console.log('Preparing the local OCR runtime...');
run(process.execPath, [path.join(root, 'scripts/setup-ocr.mjs')]);

console.log('Building the Next.js project...');
run(pnpm, ['next', 'build']);

console.log('Bundling server with tsup...');
run(pnpm, ['tsup', 'src/server.ts', '--format', 'cjs', '--platform', 'node', '--target', 'node20', '--outDir', 'dist', '--no-splitting', '--no-minify']);

console.log('Build completed successfully!');
