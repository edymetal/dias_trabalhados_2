export const PRODUCTION_PROJECT_ID = 'dias-trabalhados-bf99a';
export const EMULATOR_PROJECT_ID = 'demo-dias-trabalhados-2';

const defaultFirebaseConfig = {
  apiKey: 'AIzaSyAlY3MVb-8jvvcwjOtd0VqRP427MISJDjg',
  authDomain: 'dias-trabalhados-bf99a.firebaseapp.com',
  databaseURL: 'https://dias-trabalhados-bf99a-default-rtdb.firebaseio.com',
  projectId: PRODUCTION_PROJECT_ID,
  storageBucket: 'dias-trabalhados-bf99a.firebasestorage.app',
  messagingSenderId: '807305373436',
  appId: '1:807305373436:web:5b12891242f350326e9979',
  measurementId: 'G-B2TPPJMH55'
};

function envValue(name, fallback) {
  const value = import.meta.env?.[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export const firebaseConfig = Object.freeze({
  apiKey: envValue('VITE_FIREBASE_API_KEY', defaultFirebaseConfig.apiKey),
  authDomain: envValue('VITE_FIREBASE_AUTH_DOMAIN', defaultFirebaseConfig.authDomain),
  databaseURL: envValue('VITE_FIREBASE_DATABASE_URL', defaultFirebaseConfig.databaseURL),
  projectId: envValue('VITE_FIREBASE_PROJECT_ID', defaultFirebaseConfig.projectId),
  storageBucket: envValue('VITE_FIREBASE_STORAGE_BUCKET', defaultFirebaseConfig.storageBucket),
  messagingSenderId: envValue('VITE_FIREBASE_MESSAGING_SENDER_ID', defaultFirebaseConfig.messagingSenderId),
  appId: envValue('VITE_FIREBASE_APP_ID', defaultFirebaseConfig.appId),
  measurementId: envValue('VITE_FIREBASE_MEASUREMENT_ID', defaultFirebaseConfig.measurementId)
});

export const useFirebaseEmulators = import.meta.env?.VITE_USE_FIREBASE_EMULATORS === 'true';

export function assertSafeTestProject(projectId) {
  if (projectId === PRODUCTION_PROJECT_ID || !projectId?.startsWith('demo-')) {
    throw new Error(`Projeto inseguro para testes: ${projectId || '<vazio>'}`);
  }
}

if (useFirebaseEmulators) {
  assertSafeTestProject(firebaseConfig.projectId);
}
