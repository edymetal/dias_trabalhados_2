import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'firebase/auth';
import {
  connectDatabaseEmulator,
  get,
  getDatabase,
  ref,
  set
} from 'firebase/database';
import { firebaseConfig, useFirebaseEmulators } from './config.js';

const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

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
  onAuthStateChanged,
  ref,
  set,
  signInWithPopup,
  signOut
};
