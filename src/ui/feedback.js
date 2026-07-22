const STATUS_ID = 'app-status';
let clearTimer;

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
