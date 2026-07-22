import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, sortDeep(value[key])])
  );
}

function countNodes(value) {
  if (!value || typeof value !== 'object') return 1;
  return 1 + Object.values(value).reduce((total, child) => total + countNodes(child), 0);
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rounded(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function summarize(root) {
  const userData = root?.userData && typeof root.userData === 'object' ? root.userData : {};
  const authorizedEmails = root?.authorized_emails && typeof root.authorized_emails === 'object'
    ? root.authorized_emails
    : {};

  const totals = {
    advanceRemaining: 0,
    amountPaid: 0,
    paymentAmount: 0,
    pendingAmount: 0,
    workedRate: 0
  };
  let databases = 0;
  let payments = 0;
  let workedDays = 0;

  for (const userEntry of Object.values(userData)) {
    const database = userEntry?.db;
    if (!database || typeof database !== 'object') continue;
    databases += 1;

    const userWorkedDays = database.workedDays && typeof database.workedDays === 'object'
      ? Object.values(database.workedDays)
      : [];
    const userPayments = Array.isArray(database.payments)
      ? database.payments.filter(Boolean)
      : Object.values(database.payments || {}).filter(Boolean);

    workedDays += userWorkedDays.length;
    payments += userPayments.length;

    for (const day of userWorkedDays) {
      totals.workedRate += numeric(day?.rate);
      totals.amountPaid += numeric(day?.amountPaid);
      totals.pendingAmount += numeric(day?.pendingAmount);
    }

    for (const payment of userPayments) {
      totals.paymentAmount += numeric(payment?.amount);
      totals.advanceRemaining += numeric(payment?.advanceRemaining);
    }
  }

  for (const key of Object.keys(totals)) totals[key] = rounded(totals[key]);

  const canonical = JSON.stringify(sortDeep(root));

  return {
    authorizedEmailCount: Object.keys(authorizedEmails).length,
    canonicalSha256: createHash('sha256').update(canonical).digest('hex'),
    databaseCount: databases,
    nodeCount: countNodes(root),
    paymentCount: payments,
    topLevelKeys: Object.keys(root || {}).sort(),
    totals,
    userDataCount: Object.keys(userData).length,
    workedDayCount: workedDays
  };
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function emit(result, outputPath) {
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (outputPath) {
    await writeFile(outputPath, json, { flag: 'wx' });
  }
  console.log(json.trim());
}

const [operation, firstPath, secondPath, outputPath] = process.argv.slice(2);

if (operation === 'inspect' && firstPath) {
  await emit(summarize(await loadJson(firstPath)), secondPath);
} else if (operation === 'compare' && firstPath && secondPath) {
  const original = summarize(await loadJson(firstPath));
  const restored = summarize(await loadJson(secondPath));
  const equal = original.canonicalSha256 === restored.canonicalSha256;

  await emit({ equal, original, restored }, outputPath);
  if (!equal) process.exit(1);
} else {
  console.error(
    'Uso:\n' +
    '  node scripts/verify-rtdb-backup.mjs inspect <arquivo.json> [resumo.json]\n' +
    '  node scripts/verify-rtdb-backup.mjs compare <original.json> <restaurado.json> [resultado.json]'
  );
  process.exit(2);
}
