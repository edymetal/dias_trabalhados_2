import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { get, ref, set, update } from 'firebase/database';

const projectId = 'demo-dias-trabalhados-2';
const rulesPath = fileURLToPath(
  new URL('../../firebase/database.rules.emulator.json', import.meta.url)
);

let testEnvironment;

function validDatabase() {
  return {
    schemaVersion: 2,
    settings: {
      morningRate: 35,
      nightRate: 25,
      currency: 'EUR',
      language: 'pt-BR',
      theme: 'dark'
    },
    workedDays: {},
    payments: []
  };
}

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    database: {
      rules: readFileSync(rulesPath, 'utf8')
    }
  });
});

beforeEach(async () => {
  await testEnvironment.clearDatabase();
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

describe('regras candidatas da etapa 2', () => {
  it('permite patches granulares e atômicos somente na própria base', async () => {
    const alice = testEnvironment.authenticatedContext('alice', { authorized: true }).database();
    await assertSucceeds(set(ref(alice, 'userData/alice/db'), validDatabase()));

    await assertSucceeds(update(ref(alice, 'userData/alice/db'), {
      'workedDays/2026-07-23': {
        date: '2026-07-23', rate: 35, amountPaid: 0, pendingAmount: 35
      },
      'settings/theme': 'light'
    }));
    await assertSucceeds(get(ref(alice, 'userData/alice/db')));
    await assertFails(get(ref(alice, 'userData/bob/db')));
    await assertFails(update(ref(alice, 'userData/bob/db'), { 'settings/theme': 'dark' }));
  });

  it('rejeita schema futuro e valores financeiros inválidos', async () => {
    const alice = testEnvironment.authenticatedContext('alice', { authorized: true }).database();
    await assertSucceeds(set(ref(alice, 'userData/alice/db'), validDatabase()));
    await assertFails(update(ref(alice, 'userData/alice/db'), { schemaVersion: 3 }));
    await assertFails(update(ref(alice, 'userData/alice/db'), { 'settings/morningRate': -1 }));
    await assertFails(update(ref(alice, 'userData/alice/db'), {
      'workedDays/data-invalida': { rate: 35 }
    }));
    await assertFails(update(ref(alice, 'userData/alice/db'), {
      'payments/chave-invalida': { id: 'pay_1', date: '2026-07-23', amount: 10 }
    }));
  });

  it('preserva raízes legadas desconhecidas dentro da base', async () => {
    const alice = testEnvironment.authenticatedContext('alice', { authorized: true }).database();
    const database = validDatabase();
    database.legacyRoot = { preserved: true };
    await assertSucceeds(set(ref(alice, 'userData/alice/db'), database));
  });

  it('preserva patches concorrentes de duas sessões no mesmo UID', async () => {
    const first = testEnvironment.authenticatedContext('alice', { authorized: true }).database();
    const second = testEnvironment.authenticatedContext('alice', { authorized: true }).database();
    await assertSucceeds(set(ref(first, 'userData/alice/db'), validDatabase()));

    await Promise.all([
      assertSucceeds(update(ref(first, 'userData/alice/db'), {
        'workedDays/2026-07-22': { date: '2026-07-22', rate: 35 }
      })),
      assertSucceeds(update(ref(second, 'userData/alice/db'), {
        'workedDays/2026-07-23': { date: '2026-07-23', rate: 25 }
      }))
    ]);

    const snapshot = await get(ref(first, 'userData/alice/db/workedDays'));
    expect(snapshot.val()).toMatchObject({
      '2026-07-22': { rate: 35 },
      '2026-07-23': { rate: 25 }
    });
  });

  it('nega acesso quando falta a claim de autorização', async () => {
    const user = testEnvironment.authenticatedContext('alice').database();
    await assertFails(get(ref(user, 'userData/alice/db')));
    await assertFails(set(ref(user, 'userData/alice/db'), validDatabase()));
  });

  it('preserva o acesso dos administradores mestres à própria base', async () => {
    const master = testEnvironment.authenticatedContext('master-user', {
      email: 'edneypugliese.dev@gmail.com'
    }).database();

    await assertSucceeds(set(ref(master, 'userData/master-user/db'), validDatabase()));
    await assertSucceeds(get(ref(master, 'userData/master-user/db')));
    await assertFails(get(ref(master, 'userData/alice/db')));
  });

  it('não expõe a lista de e-mails autorizados ao cliente', async () => {
    const authorized = testEnvironment.authenticatedContext('alice', { authorized: true }).database();
    await assertFails(get(ref(authorized, 'authorized_emails')));
  });

  it('nega todo acesso anônimo', async () => {
    const anonymous = testEnvironment.unauthenticatedContext().database();
    await assertFails(get(ref(anonymous, 'userData/alice/db')));
    await assertFails(set(ref(anonymous, 'userData/alice/db'), validDatabase()));
  });
});
