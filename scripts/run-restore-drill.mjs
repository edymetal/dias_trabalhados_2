import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = fileURLToPath(new URL('../', import.meta.url));
const fixturePath = fileURLToPath(new URL('../tests/fixtures/synthetic-restore.json', import.meta.url));
const restoreScript = fileURLToPath(new URL('./restore-rtdb-emulator.mjs', import.meta.url));
const verifyScript = fileURLToPath(new URL('./verify-rtdb-backup.mjs', import.meta.url));
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'dias-restore-drill-'));
const restoredPath = join(temporaryDirectory, 'restored.json');

function runNode(arguments_) {
  const result = spawnSync(process.execPath, arguments_, {
    cwd: rootDirectory,
    encoding: 'utf8',
    env: process.env
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`Ensaio de restauração falhou com código ${result.status}.`);
  }
}

try {
  runNode([restoreScript, fixturePath, restoredPath]);
  runNode([verifyScript, 'compare', fixturePath, restoredPath]);
  console.log('Ensaio de restauração validado sem acesso à produção.');
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
