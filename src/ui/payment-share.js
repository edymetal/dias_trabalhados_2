import { openDialog } from './dialog.js';
import { showStatus } from './feedback.js';

// Draw from the visible calendar so projections, partial payments and days off
// are identical to what the user reviewed, regardless of screen size or zoom.
export function drawPaymentReport({ title, weekdays, days, balanceLabel, balance, scope, generated }) {
  const canvas = document.createElement('canvas');
  canvas.width = 1400;
  canvas.height = 370 + Math.ceil(days.length / 7) * 164;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#0d1422';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const text = (value, x, y, size = 20, color = '#e8edf5', maxWidth = 1300) => {
    ctx.fillStyle = color;
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    ctx.fillText(value, x, y, maxWidth);
  };
  text(title, 36, 52, 32);
  text(generated, 36, 84, 17, '#a6b3c8');
  ctx.fillStyle = '#182235';
  ctx.fillRect(36, 108, 1328, 140);
  text(balanceLabel, 56, 141, 21);
  text(balance, 56, 190, 38, '#ffbd69');
  text(scope, 56, 225, 17, '#a6b3c8');
  weekdays.forEach((day, i) => text(day, 48 + i * 190, 288, 18, '#a6b3c8'));
  days.forEach((day, i) => {
    const x = 36 + (i % 7) * 190;
    const y = 310 + Math.floor(i / 7) * 164;
    ctx.fillStyle = '#172132';
    ctx.fillRect(x, y, 178, 152);
    const color = day.paid ? '#2bd4a1' : day.partial ? '#ffbd69' : day.unpaid ? '#ff626e' : '#64748b';
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 4, 152);
    text(day.number, x + 14, y + 29, 23, day.otherMonth ? '#778296' : '#ffffff', 150);
    day.lines.forEach((line, j) => text(line, x + 14, y + 56 + j * 21, 15, day.otherMonth ? '#778296' : '#d3dceb', 150));
  });
  return canvas;
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
      const canvas = drawPaymentReport(report);
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
