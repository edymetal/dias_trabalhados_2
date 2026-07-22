import { database, get, ref } from './client.js';

export async function getAuthorizedEmails() {
  const snapshot = await get(ref(database, 'authorized_emails'));
  const value = snapshot.val();
  return Array.isArray(value) ? value : [];
}
