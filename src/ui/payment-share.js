import { openDialog } from './dialog.js';
import { showStatus } from './feedback.js';

// Capture the real calendar markup and CSS, including its SVG icons and badges.
export async function drawPaymentReport({ calendar, balanceCard, balanceLabel, balance, scope, generated }) {
  await document.fonts.ready;
  const host = document.createElement('div');
  host.className = 'payment-report-capture-host';
  host.setAttribute('aria-hidden', 'true');
  host.inert = true;
  const mobile = window.innerWidth <= 768;
  // Export all seven columns on phones, including days outside the scroll area.
  const calendarWidth = mobile ? 1556 : Math.ceil(calendar.getBoundingClientRect().width);
  host.style.width = `${calendarWidth + 32}px`;
  const capture = document.createElement('div');
  capture.className = 'payment-report-capture';
  const calendarCopy = calendar.cloneNode(true);
  calendarCopy.querySelector('#btn-payment-report')?.remove();
  const card = balanceCard.cloneNode(true);
  card.classList.add('payment-report-balance');
  card.querySelector('.stat-info p').textContent = balanceLabel;
  card.querySelector('.stat-info h3').textContent = balance;
  const caption = document.createElement('p');
  caption.className = 'payment-report-caption';
  caption.textContent = `${scope} ${generated}`;
  capture.append(calendarCopy, card, caption);
  capture.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
  host.append(capture);
  document.body.append(host);
  try {
    // Preserve the sizes and inherited colors when SVG icons become images.
    capture.querySelectorAll('svg').forEach(icon => {
      const style = getComputedStyle(icon);
      icon.setAttribute('width', style.width);
      icon.setAttribute('height', style.height);
      icon.style.color = style.color;
    });
    const { default: html2canvas } = await import('html2canvas');
    return await html2canvas(capture, {
      scale: 2,
      logging: false,
      windowWidth: mobile ? 1600 : window.innerWidth,
      backgroundColor: getComputedStyle(capture).backgroundColor
    });
  } finally {
    host.remove();
  }
}

export async function sharePaymentFile(file, title, navigatorApi = navigator) {
  if (!navigatorApi.share || !navigatorApi.canShare?.({ files: [file] })) return 'unsupported';
  try {
    await navigatorApi.share({ files: [file], title });
    return 'shared';
  } catch (error) {
    if (error.name === 'AbortError') return 'cancelled';
    throw error;
  }
}

export function setupPaymentShare(getReport) {
  const trigger = document.getElementById('btn-payment-report');
  const preview = document.getElementById('payment-report-preview');
  const download = document.getElementById('payment-report-download');
  const whatsapp = document.getElementById('payment-report-whatsapp');
  const share = document.getElementById('payment-report-share');
  const status = document.getElementById('payment-report-status');
  let file;
  let objectUrl;
  let texts;
  trigger.addEventListener('click', async () => {
    trigger.disabled = true;
    try {
      const report = getReport();
      texts = report.texts;
      const canvas = await drawPaymentReport(report);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('PNG encoding failed');
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      file = new File([blob], `${report.filename}.png`, { type: 'image/png' });
      objectUrl = URL.createObjectURL(file);
      // The site's image policy already allows data URLs, but not blob URLs.
      preview.src = canvas.toDataURL('image/png');
      preview.alt = texts['share-preview-alt'];
      download.href = objectUrl;
      download.download = file.name;
      whatsapp.href = `https://wa.me/?text=${encodeURIComponent(report.message)}`;
      status.textContent = texts['share-instructions'];
      share.hidden = !(navigator.share && navigator.canShare?.({ files: [file] }));
      trigger.disabled = false;
      trigger.focus({ preventScroll: true });
      openDialog('payment-report-modal');
    } catch (error) {
      console.error('[payment-report]', error);
      showStatus(texts?.['share-error'] || 'Não foi possível gerar o resumo. Tente novamente.');
    } finally {
      trigger.disabled = false;
    }
  });
  share.addEventListener('click', async () => {
    if (!file) return;
    share.disabled = true;
    try {
      const result = await sharePaymentFile(file, texts['share-title']);
      if (result === 'unsupported') status.textContent = texts['share-instructions'];
    } catch (error) {
      console.error('[payment-share]', error);
      status.textContent = texts['share-fallback'];
    } finally {
      share.disabled = false;
    }
  });
}
