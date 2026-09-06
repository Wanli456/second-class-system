if (process.env.DATA_RETENTION_EXECUTE !== 'true') {
  console.log(JSON.stringify({ success: false, dryRun: true, message: 'Set DATA_RETENTION_EXECUTE=true in the scheduler task to run controlled retention.' }));
  process.exit(0);
}

const { register } = await import('tsx/esm/api');
const unregister = register();
try {
  const { runFileRetention } = await import('../src/lib/data-retention-files.ts');
  const { runDataRetention } = await import('../src/lib/data-retention.ts');
  const files = await runFileRetention({ root: process.cwd() });
  const accounts = await runDataRetention({ actor: null });
  const incomplete = files.pending > 0 || accounts.failed.length > 0 || accounts.reviewRequired.length > 0;
  console.log(JSON.stringify({ success: !incomplete, files, accounts }));
  if (incomplete) process.exitCode = 1;
} finally {
  unregister();
}
