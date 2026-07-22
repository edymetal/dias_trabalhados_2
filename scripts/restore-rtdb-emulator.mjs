import { readFile, writeFile } from 'node:fs/promises';

const [sourcePath, restoredPath] = process.argv.slice(2);
const emulatorHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;

if (!sourcePath || !restoredPath) {
  console.error('Uso: node scripts/restore-rtdb-emulator.mjs <backup.json> <restaurado.json>');
  process.exit(2);
}

if (!emulatorHost || !/^(127\.0\.0\.1|localhost):\d+$/.test(emulatorHost)) {
  console.error('Restauração bloqueada: o Database Emulator local não foi detectado.');
  process.exit(1);
}

if (!projectId?.startsWith('demo-')) {
  console.error(`Restauração bloqueada: project ID inseguro (${projectId || '<vazio>'}).`);
  process.exit(1);
}

const source = await readFile(sourcePath, 'utf8');
JSON.parse(source);

const namespace = `${projectId}-default-rtdb`;
const endpoint = `http://${emulatorHost}/.json?ns=${encodeURIComponent(namespace)}`;
const emulatorAdminHeaders = {
  authorization: 'Bearer owner',
  'content-type': 'application/json'
};

const restoreResponse = await fetch(endpoint, {
  body: source,
  headers: emulatorAdminHeaders,
  method: 'PUT'
});

if (!restoreResponse.ok) {
  throw new Error(`Falha ao restaurar no emulador: HTTP ${restoreResponse.status}.`);
}

const exportResponse = await fetch(`${endpoint}&format=export`, {
  headers: emulatorAdminHeaders
});
if (!exportResponse.ok) {
  throw new Error(`Falha ao reexportar do emulador: HTTP ${exportResponse.status}.`);
}

await writeFile(restoredPath, await exportResponse.text(), { flag: 'wx' });
console.log('Restauração e reexportação concluídas exclusivamente no emulador local.');
