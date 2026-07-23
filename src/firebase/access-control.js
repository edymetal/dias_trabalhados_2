import { database, get, getIdTokenResult, ref } from './client.js';

export const MASTER_ADMIN_EMAILS = Object.freeze([
  'edneypugliese.dev@gmail.com',
  'edneypugleise@gmail.com'
]);

async function getLegacyAuthorizedEmails() {
  const snapshot = await get(ref(database, 'authorized_emails'));
  const value = snapshot.val();
  return Array.isArray(value) ? value : [];
}

export async function checkUserAccess(user) {
  const email = user?.email?.toLowerCase();
  if (!user?.uid || !email) return { authorized: false, source: 'invalid-user' };
  if (MASTER_ADMIN_EMAILS.includes(email)) return { authorized: true, source: 'master-email' };

  const token = await getIdTokenResult(user);
  if (token.claims.authorized === true) return { authorized: true, source: 'custom-claim' };

  // Compatibilidade temporária até todos os usuários receberem a custom claim.
  try {
    const legacyEmails = await getLegacyAuthorizedEmails();
    if (legacyEmails.map(item => String(item).toLowerCase()).includes(email)) {
      return { authorized: true, source: 'legacy-whitelist' };
    }
  } catch {
    // As regras novas escondem a whitelist; ausência de claim significa acesso negado.
  }

  return { authorized: false, source: 'no-claim' };
}
