import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  getIdTokenResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from 'firebase/auth';
import {
  connectDatabaseEmulator,
  forceLongPolling,
  get,
  getDatabase,
  onValue,
  ref,
  set,
  update
} from 'firebase/database';
import { firebaseConfig, useFirebaseEmulators } from './config.js';
import { getBrowserTransportInfo, shouldUseFirebaseLongPolling } from './transport.js';

export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Redes móveis, proxies e alguns roteadores bloqueiam a conexão WebSocket do
// Realtime Database. Nesses navegadores usamos o transporte HTTPS suportado
// pelo próprio SDK antes que a instância do banco seja inicializada.
if (!useFirebaseEmulators && shouldUseFirebaseLongPolling(getBrowserTransportInfo())) {
  forceLongPolling();
}

export const database = getDatabase(firebaseApp);
export const auth = getAuth(firebaseApp);
export const provider = new GoogleAuthProvider();

const emulatorConnectionKey = '__DIAS_TRABALHADOS_FIREBASE_EMULATORS_CONNECTED__';

if (useFirebaseEmulators && !globalThis[emulatorConnectionKey]) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectDatabaseEmulator(database, '127.0.0.1', 9000);
  globalThis[emulatorConnectionKey] = true;
}

export {
  get,
  getIdTokenResult,
  onValue,
  onAuthStateChanged,
  ref,
  set,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  update
};
