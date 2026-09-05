import { readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const root = process.cwd();
function findTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? findTests(file) : entry.name.endsWith('.test.ts') ? [file] : [];
  });
}

const filters = process.argv.slice(2);
const files = findTests(path.join(root, 'src')).sort()
  .filter((file) => !filters.length || filters.some((filter) => file.includes(filter)));
if (!files.length) throw new Error('No matching test files');
const env = { ...process.env, NODE_ENV: 'test', PGDATABASE_URL: '', NODE_OPTIONS: '',
  AUTH_SESSION_SECRET: randomBytes(32).toString('hex') };
let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), file],
    { cwd: root, env, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
  const passed = result.status === 0 && !result.error;
  console.log(`${passed ? 'PASS' : 'FAIL'} ${path.relative(root, file)}`);
  if (!passed) {
    failed += 1;
    console.error(result.error?.message || result.stderr || result.stdout);
  }
}
console.log(`Test files: ${files.length - failed} passed, ${failed} failed, ${files.length} total (isolated in-memory database).`);
process.exitCode = failed ? 1 : 0;
