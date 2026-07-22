import { database, get, ref, set } from './client.js';

export const userDatabase = Object.freeze({
  async load(userId) {
    const snapshot = await get(ref(database, `userData/${userId}/db`));
    return snapshot.val();
  },

  async save(userId, data) {
    await set(ref(database, `userData/${userId}/db`), data);
  }
});
