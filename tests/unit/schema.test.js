import { describe, expect, it } from 'vitest';
import {
  createDefaultDatabase,
  migrateDatabase,
  normalizeDatabase,
  validateImportedDatabase
} from '../../src/persistence/schema.js';

describe('schema versionado', () => {
  it('migra a base sem versão de forma idempotente e preserva raízes legadas', () => {
    const legacy = {
      settings: { morningRate: 80, nightRate: 100, custom: 'preservado' },
      workedDays: {},
      payments: [{ id: 'pay_1', date: '2026-07-23', amount: 10 }],
      legacyRoot: { preserved: true }
    };

    const first = migrateDatabase(legacy);
    const second = migrateDatabase(first.data);

    expect(first).toMatchObject({ fromVersion: 0, toVersion: 3, changed: true });
    expect(first.data).toMatchObject({
      schemaVersion: 3,
      settings: { morningRate: 35, nightRate: 25, custom: 'preservado' },
      legacyRoot: { preserved: true }
    });
    expect(first.data.payments[0].advanceRemaining).toBe(0);
    expect(second.changed).toBe(false);
  });

  it('reconstitui coleções vazias omitidas pelo Realtime Database', () => {
    const normalized = normalizeDatabase({
      schemaVersion: 2,
      settings: createDefaultDatabase().settings
    });
    expect(normalized.workedDays).toEqual({});
    expect(normalized.payments).toEqual([]);
  });

  it('valida importação e rejeita valores, chaves e versões inseguras', () => {
    const valid = createDefaultDatabase();
    valid.workedDays['2026-07-23'] = {
      date: '2026-07-23', rate: 35, amountPaid: 0, pendingAmount: 35
    };
    expect(validateImportedDatabase(valid)).toMatchObject({ schemaVersion: 3 });

    const negative = structuredClone(valid);
    negative.workedDays['2026-07-23'].rate = -1;
    expect(() => validateImportedDatabase(negative)).toThrow('não negativo');

    const negativeSetting = structuredClone(valid);
    negativeSetting.settings.morningRate = -1;
    expect(() => validateImportedDatabase(negativeSetting)).toThrow('não negativo');

    const invalidDate = structuredClone(valid);
    invalidDate.workedDays['2026-02-31'] = invalidDate.workedDays['2026-07-23'];
    delete invalidDate.workedDays['2026-07-23'];
    expect(() => validateImportedDatabase(invalidDate)).toThrow('Registro de dia inválido');

    const zeroPayment = structuredClone(valid);
    zeroPayment.payments.push({ id: 'pay_zero', date: '2026-07-23', amount: 0 });
    expect(() => validateImportedDatabase(zeroPayment)).toThrow('maior que zero');

    const dangerous = JSON.parse('{"settings":{},"workedDays":{},"payments":[],"__proto__":{"polluted":true}}');
    expect(() => validateImportedDatabase(dangerous)).toThrow('Chave insegura');
    expect(() => normalizeDatabase({ ...valid, schemaVersion: 99 })).toThrow('não suportada');
  });

  it('normaliza resíduos decimais sem perder valores pagos não vinculados', () => {
    const migrated = migrateDatabase({
      schemaVersion: 2,
      settings: createDefaultDatabase().settings,
      workedDays: {
        '2026-07-23': {
          date: '2026-07-23',
          period: 'morning',
          rate: 0.1 + 0.2,
          amountPaid: 0.1,
          pendingAmount: 0.20000000000000004,
          paymentsApplied: {}
        }
      },
      payments: []
    }).data;

    expect(migrated.workedDays['2026-07-23']).toMatchObject({
      rate: 0.3,
      amountPaid: 0.1,
      pendingAmount: 0.2,
      unlinkedAmountPaid: 0.1
    });
  });

  it('fecha em centavos a divisão de pagamentos mistos legados', () => {
    const migrated = migrateDatabase({
      schemaVersion: 2,
      settings: createDefaultDatabase().settings,
      workedDays: {},
      payments: [{
        id: 'pay_mixed',
        date: '2026-07-23',
        amount: 10.01,
        method: 'Misto'
      }]
    }).data;

    expect(migrated.payments[0]).toMatchObject({
      amount: 10.01,
      cashAmount: 5,
      depositAmount: 5.01
    });
  });
});
