import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const cryptoScript = fileURLToPath(new URL('../../scripts/backup-crypto.mjs', import.meta.url));
const restoreScript = fileURLToPath(new URL('../../scripts/restore-rtdb-emulator.mjs', import.meta.url));
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, {
    force: true,
    recursive: true
  })));
});

describe('ferramentas de backup', () => {
  it('criptografa e recupera o mesmo conteúdo com AES-256-GCM', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dias-backup-'));
    temporaryDirectories.push(directory);

    const sourcePath = join(directory, 'source.zip');
    const encryptedPath = join(directory, 'source.dtbackup');
    const recoveredPath = join(directory, 'recovered.zip');
    const source = randomBytes(4096);
    const key = randomBytes(32).toString('base64');
    await writeFile(sourcePath, source);

    const encryptResult = spawnSync(process.execPath, [
      cryptoScript,
      'encrypt',
      sourcePath,
      encryptedPath
    ], {
      encoding: 'utf8',
      env: { ...process.env, DIAS_BACKUP_KEY: key }
    });
    const decryptResult = spawnSync(process.execPath, [
      cryptoScript,
      'decrypt',
      encryptedPath,
      recoveredPath
    ], {
      encoding: 'utf8',
      env: { ...process.env, DIAS_BACKUP_KEY: key }
    });

    expect(encryptResult.status, encryptResult.stderr).toBe(0);
    expect(decryptResult.status, decryptResult.stderr).toBe(0);
    expect(await readFile(recoveredPath)).toEqual(source);
  });

  it('bloqueia restauração quando o host não é um emulador local', () => {
    const result = spawnSync(process.execPath, [restoreScript, 'source.json', 'restored.json'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        FIREBASE_DATABASE_EMULATOR_HOST: 'dias-trabalhados-bf99a.firebaseio.com:443',
        GCLOUD_PROJECT: 'demo-dias-trabalhados-2'
      }
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Emulator local/i);
  });

  it('bloqueia restauração quando o project ID é o de produção', () => {
    const result = spawnSync(process.execPath, [restoreScript, 'source.json', 'restored.json'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9000',
        GCLOUD_PROJECT: 'dias-trabalhados-bf99a'
      }
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/project ID inseguro/i);
  });
});
