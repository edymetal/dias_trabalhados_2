import { firebaseApp } from './client.js';
import { useFirebaseEmulators } from './config.js';

export async function initializeApplicationProtection() {
  const siteKey = import.meta.env?.VITE_FIREBASE_APP_CHECK_SITE_KEY?.trim();
  if (!siteKey || useFirebaseEmulators) return false;

  const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('firebase/app-check');
  initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true
  });
  return true;
}
