import { describe, expect, it } from 'vitest';
import { applyPatchMap, createPatchMap } from '../../src/persistence/patches.js';

describe('patches granulares', () => {
  it('altera somente folhas modificadas e preserva caminhos concorrentes', () => {
    const before = {
      settings: { theme: 'dark', language: 'pt-BR' },
      workedDays: { existing: { rate: 35 } }
    };
    const after = structuredClone(before);
    after.settings.theme = 'light';
    after.workedDays.newDay = { rate: 25 };

    const patches = createPatchMap(before, after);

    expect(patches).toEqual({
      'settings/theme': 'light',
      'workedDays/newDay': { rate: 25 }
    });
    expect(applyPatchMap(before, patches)).toEqual(after);
  });

  it('representa exclusões com null e atualiza arrays por índice', () => {
    const before = { payments: [{ id: 'a' }, { id: 'b' }] };
    const after = { payments: [{ id: 'b', amount: 10 }] };
    const patches = createPatchMap(before, after);

    expect(patches).toEqual({
      'payments/0/id': 'b',
      'payments/0/amount': 10,
      'payments/1': null
    });
    expect(applyPatchMap(before, patches)).toEqual(after);
  });
});
