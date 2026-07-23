import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeDatabase } from '../src/persistence/schema.js';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Uso: node scripts/validate-schema-migration.mjs <rtdb-data.json>');
  process.exit(2);
}

function totals(database) {
  const workedDays = Object.values(database?.workedDays || {});
  const payments = Array.isArray(database?.payments) ? database.payments : [];
  return {
    workedDays: workedDays.length,
    payments: payments.length,
    rate: workedDays.reduce((sum, day) => sum + (day.rate || 0), 0),
    paid: workedDays.reduce((sum, day) => sum + (day.amountPaid || 0), 0),
    pending: workedDays.reduce((sum, day) => sum + (day.pendingAmount || 0), 0),
    paymentAmount: payments.reduce((sum, payment) => sum + (payment.amount || 0), 0)
  };
}

const root = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
const users = Object.entries(root.userData || {});
if (users.length === 0) throw new Error('Backup sem userData para validar.');

const summaries = users.map(([userId, userNode]) => {
  if (!userNode?.db) throw new Error(`Usuário ${userId} sem nó db.`);
  const before = totals(userNode.db);
  const migrated = normalizeDatabase(userNode.db);
  const after = totals(migrated);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(`Invariantes alterados durante a migração do usuário ${userId}.`);
  }
  if (migrated.schemaVersion !== 2) throw new Error(`Schema final inválido para ${userId}.`);
  return { userId: '<redacted>', ...after, schemaVersion: migrated.schemaVersion };
});

console.log(JSON.stringify({
  usersValidated: summaries.length,
  legacyRootPreserved: Object.hasOwn(root, 'fluxoTurnoDB'),
  summaries
}, null, 2));
