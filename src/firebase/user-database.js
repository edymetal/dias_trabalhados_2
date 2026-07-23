import { database, get, onValue, ref, update } from './client.js';

function userDatabaseRef(userId) {
  return ref(database, `userData/${userId}/db`);
}

export const userDatabase = Object.freeze({
  async load(userId) {
    const snapshot = await get(userDatabaseRef(userId));
    return snapshot.val();
  },

  async patch(userId, patches) {
    if (!patches || Object.keys(patches).length === 0) return;
    await update(userDatabaseRef(userId), patches);
  },

  subscribe(userId, onData, onError) {
    return onValue(userDatabaseRef(userId), snapshot => onData(snapshot.val()), onError);
  },

  watchConnection(onConnectionChange, onError) {
    return onValue(ref(database, '.info/connected'), snapshot => {
      onConnectionChange(snapshot.val() === true);
    }, onError);
  }
});
