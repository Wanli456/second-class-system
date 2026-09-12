import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
  scripts?: { build?: string };
};

assert.equal(packageJson.scripts?.build, 'node scripts/build.mjs');
console.log('cross-platform build entry passed');
