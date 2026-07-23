const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

const returnFocusByDialog = new WeakMap();
let initialized = false;

function getDialogContent(overlay) {
  return overlay?.querySelector('[role="dialog"], [role="alertdialog"]') || null;
}

function getOpenDialogs() {
  return [...document.querySelectorAll('.modal-overlay.active:not([hidden])')];
}

function requestClose(overlay) {
  const event = new CustomEvent('dialog:request-close', { bubbles: false, cancelable: true });
  if (overlay.dispatchEvent(event)) closeDialog(overlay);
}

function trapFocus(event, overlay) {
  const content = getDialogContent(overlay);
  if (!content) return;
  const focusable = [...content.querySelectorAll(FOCUSABLE_SELECTOR)]
    .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
  if (focusable.length === 0) {
    event.preventDefault();
    content.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function initAccessibleDialogs() {
  if (initialized) return;
  initialized = true;

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.setAttribute('aria-hidden', overlay.hidden ? 'true' : 'false');
  });

  document.addEventListener('click', event => {
    const closeControl = event.target.closest('[data-dialog-close]');
    if (closeControl) {
      const overlay = closeControl.closest('.modal-overlay');
      if (overlay) requestClose(overlay);
      return;
    }

    const overlay = event.target.classList?.contains('modal-overlay') ? event.target : null;
    if (overlay?.classList.contains('active')) requestClose(overlay);
  });

  document.addEventListener('keydown', event => {
    const overlay = getOpenDialogs().at(-1);
    if (!overlay) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      requestClose(overlay);
    } else if (event.key === 'Tab') {
      trapFocus(event, overlay);
    }
  });
}

export function openDialog(dialog, { initialFocus } = {}) {
  const overlay = typeof dialog === 'string' ? document.getElementById(dialog) : dialog;
  const content = getDialogContent(overlay);
  if (!overlay || !content) return false;

  returnFocusByDialog.set(overlay, document.activeElement);
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.add('active');
  document.body.classList.add('dialog-open');
  const appContent = document.getElementById('app-content');
  if (appContent) appContent.inert = true;

  requestAnimationFrame(() => {
    const target = initialFocus
      ? content.querySelector(initialFocus)
      : content.querySelector(FOCUSABLE_SELECTOR);
    (target || content).focus();
  });
  return true;
}

export function closeDialog(dialog) {
  const overlay = typeof dialog === 'string' ? document.getElementById(dialog) : dialog;
  if (!overlay) return false;
  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.hidden = true;

  const remainingDialogs = getOpenDialogs();
  if (remainingDialogs.length === 0) {
    document.body.classList.remove('dialog-open');
    const appContent = document.getElementById('app-content');
    if (appContent) appContent.inert = false;
  }

  const returnFocus = returnFocusByDialog.get(overlay);
  returnFocusByDialog.delete(overlay);
  if (returnFocus?.isConnected) requestAnimationFrame(() => returnFocus.focus());
  return true;
}

export function confirmAction(message, {
  title,
  confirmLabel,
  cancelLabel,
  danger = false
} = {}) {
  const overlay = document.getElementById('confirmation-modal');
  const titleElement = document.getElementById('confirmation-title');
  const messageElement = document.getElementById('confirmation-message');
  const acceptButton = document.getElementById('confirmation-accept');
  const cancelButton = overlay?.querySelector('[data-confirm-value="false"]:not(.modal-close)');
  if (!overlay || !titleElement || !messageElement || !acceptButton || !cancelButton) {
    return Promise.resolve(false);
  }

  if (title) titleElement.textContent = title;
  messageElement.textContent = message;
  if (confirmLabel) acceptButton.textContent = confirmLabel;
  if (cancelLabel) cancelButton.textContent = cancelLabel;
  acceptButton.classList.toggle('btn-danger', danger);
  acceptButton.classList.toggle('btn-primary', !danger);

  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      overlay.removeEventListener('click', handleChoice);
      overlay.removeEventListener('dialog:request-close', handleCancel);
      closeDialog(overlay);
      resolve(value);
    };
    const handleChoice = event => {
      const control = event.target.closest('[data-confirm-value]');
      if (control) finish(control.dataset.confirmValue === 'true');
    };
    const handleCancel = event => {
      event.preventDefault();
      finish(false);
    };
    overlay.addEventListener('click', handleChoice);
    overlay.addEventListener('dialog:request-close', handleCancel);
    openDialog(overlay, { initialFocus: '[data-confirm-value="false"]:not(.modal-close)' });
  });
}
