const STATUS_ID = 'app-status';
let clearTimer;
const SYNC_STATUS_ID = 'sync-status';

export function showStatus(message, { tone = 'error', timeout = 7000 } = {}) {
  let element = document.getElementById(STATUS_ID);
  if (!element) {
    element = document.createElement('div');
    element.id = STATUS_ID;
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
    document.body.appendChild(element);
  }

  element.className = `app-status app-status-${tone} is-visible`;
  element.textContent = message;
  clearTimeout(clearTimer);
  clearTimer = setTimeout(() => element.classList.remove('is-visible'), timeout);
}

export function reportError(context, error, userMessage) {
  console.error(`[${context}]`, error);
  if (userMessage) showStatus(userMessage);
  globalThis.dispatchEvent?.(new CustomEvent('app:error', {
    detail: { context, message: error instanceof Error ? error.message : String(error) }
  }));
}

export function renderSyncState({ status, pending = 0 }) {
  let element = document.getElementById(SYNC_STATUS_ID);
  if (!element) {
    element = document.createElement('div');
    element.id = SYNC_STATUS_ID;
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
    document.body.appendChild(element);
  }

  const labels = {
    synced: 'Sincronizado',
    saving: 'Sincronizando…',
    offline: pending > 0 ? `Offline — ${pending} alteração(ões) pendente(s)` : 'Offline',
    blocked: 'Sincronização bloqueada: versão incompatível'
  };
  element.className = `sync-status sync-status-${status}`;
  element.textContent = labels[status] || status;
  element.hidden = false;
}
