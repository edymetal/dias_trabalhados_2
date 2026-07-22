import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { get, ref, set } from 'firebase/database';

const projectId = 'demo-dias-trabalhados-2';
const rulesPath = fileURLToPath(
  new URL('../../firebase/database.rules.emulator.json', import.meta.url)
);

let testEnvironment;

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

describe('regras propostas para o emulador', () => {
  it('permite ao usuário autorizado ler e escrever somente a própria base', async () => {
    const alice = testEnvironment.authenticatedContext('alice', { authorized: true }).database();

    await assertSucceeds(set(ref(alice, 'userData/alice/db'), {
      settings: { language: 'pt-BR' },
      workedDays: { '2026-05-18': { rate: 35 } }
    }));
    await assertSucceeds(get(ref(alice, 'userData/alice/db')));
    await assertFails(get(ref(alice, 'userData/bob/db')));
    await assertFails(set(ref(alice, 'userData/bob/db'), { workedDays: {} }));
  });

  it('nega acesso quando falta a claim de autorização', async () => {
    const user = testEnvironment.authenticatedContext('alice').database();

    await assertFails(get(ref(user, 'userData/alice/db')));
    await assertFails(set(ref(user, 'userData/alice/db'), { workedDays: {} }));
  });

  it('preserva o acesso legado dos administradores mestres à própria base', async () => {
    const master = testEnvironment.authenticatedContext('master-user', {
      email: 'edneypugliese.dev@gmail.com'
    }).database();

    await assertSucceeds(set(ref(master, 'userData/master-user/db'), { workedDays: {} }));
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
    await assertFails(set(ref(anonymous, 'userData/alice/db'), { workedDays: {} }));
  });
});
