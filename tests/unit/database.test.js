import { describe, expect, it, vi } from 'vitest';
import {
  createDatabaseRepository,
  createDefaultDatabase,
  normalizeDatabase
} from '../../src/persistence/database.js';

function memoryStorage(initialValue) {
  const values = new Map(initialValue ? [['fluxoturno_db', initialValue]] : []);
  return {
    getItem: vi.fn(key => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, value))
  };
}

describe('persistência da base', () => {
  it('cria cópias independentes da base padrão', () => {
    const first = createDefaultDatabase();
    first.settings.offDays.push(2);

    expect(createDefaultDatabase().settings.offDays).toEqual([4]);
  });

  it('normaliza o schema legado sem descartar campos desconhecidos', () => {
    const normalized = normalizeDatabase({
      settings: { morningRate: 80, nightRate: 100, custom: 'preservado' },
      workedDays: { '2026-07-22': { rate: 35 } },
      payments: [{ id: 'pay_1' }],
      legacyRoot: { enabled: true }
    });

    expect(normalized.settings).toMatchObject({
      morningRate: 35,
      nightRate: 25,
      custom: 'preservado',
      language: 'pt-BR'
    });
    expect(normalized.payments[0].advanceRemaining).toBe(0);
    expect(normalized.legacyRoot).toEqual({ enabled: true });
  });

  it('prioriza a nuvem sem sobrescrever os dados remotos', async () => {
    const localStorage = memoryStorage(JSON.stringify({ workedDays: { local: {} } }));
    const remoteData = { settings: {}, workedDays: { remote: {} }, payments: [] };
    const remoteStore = { load: vi.fn().mockResolvedValue(remoteData), save: vi.fn() };
    const repository = createDatabaseRepository({ localStorage, remoteStore });

    const loaded = await repository.load('uid-1');

    expect(loaded.source).toBe('remote');
    expect(loaded.data.workedDays).toEqual({ remote: {} });
    expect(remoteStore.save).not.toHaveBeenCalled();
  });

  it('usa a cópia local quando a leitura remota falha e informa o erro', async () => {
    const localData = { settings: {}, workedDays: { local: {} }, payments: [] };
    const onError = vi.fn();
    const repository = createDatabaseRepository({
      localStorage: memoryStorage(JSON.stringify(localData)),
      remoteStore: { load: vi.fn().mockRejectedValue(new Error('offline')), save: vi.fn() },
      onError
    });

    const loaded = await repository.load('uid-1');

    expect(loaded.source).toBe('local');
    expect(loaded.data.workedDays).toEqual({ local: {} });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ phase: 'remote-read' }));
  });

  it('salva localmente antes de sincronizar no caminho remoto', async () => {
    const localStorage = memoryStorage();
    const remoteStore = { load: vi.fn(), save: vi.fn().mockResolvedValue() };
    const repository = createDatabaseRepository({ localStorage, remoteStore });
    const data = createDefaultDatabase();

    await repository.save(data, 'uid-1');

    expect(localStorage.setItem).toHaveBeenCalledOnce();
    expect(remoteStore.save).toHaveBeenCalledWith('uid-1', data);
  });
});
