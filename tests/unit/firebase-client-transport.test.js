import { describe, expect, it, vi } from 'vitest';

const firebaseMocks = vi.hoisted(() => ({
  forceLongPolling: vi.fn(),
  getDatabase: vi.fn(() => ({ type: 'database' }))
}));

vi.mock('firebase/app', () => ({
  getApp: vi.fn(),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({ name: 'test-app' }))
}));

vi.mock('firebase/auth', () => ({
  connectAuthEmulator: vi.fn(),
  getAuth: vi.fn(() => ({ type: 'auth' })),
  getIdTokenResult: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn()
}));

vi.mock('firebase/database', () => ({
  connectDatabaseEmulator: vi.fn(),
  forceLongPolling: firebaseMocks.forceLongPolling,
  get: vi.fn(),
  getDatabase: firebaseMocks.getDatabase,
  onValue: vi.fn(),
  ref: vi.fn(),
  set: vi.fn(),
  update: vi.fn()
}));

vi.mock('../../src/firebase/config.js', () => ({
  firebaseConfig: { projectId: 'production-test-double' },
  useFirebaseEmulators: false
}));

vi.mock('../../src/firebase/transport.js', () => ({
  getBrowserTransportInfo: vi.fn(() => ({ userAgent: 'Android' })),
  shouldUseFirebaseLongPolling: vi.fn(() => true)
}));

describe('inicialização do transporte Firebase', () => {
  it('força long polling antes de inicializar o Realtime Database no mobile', async () => {
    await import('../../src/firebase/client.js');

    expect(firebaseMocks.forceLongPolling).toHaveBeenCalledOnce();
    expect(firebaseMocks.getDatabase).toHaveBeenCalledOnce();
    expect(firebaseMocks.forceLongPolling.mock.invocationCallOrder[0])
      .toBeLessThan(firebaseMocks.getDatabase.mock.invocationCallOrder[0]);
  });
});
