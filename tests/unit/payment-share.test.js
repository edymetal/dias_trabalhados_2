import { describe, expect, it, vi } from 'vitest';
import { sharePaymentFile } from '../../src/ui/payment-share.js';

describe('compartilhamento do resumo', () => {
  const file = new File(['report'], 'pagamento.png', { type: 'image/png' });

  it('envia o arquivo PNG para o compartilhamento nativo', async () => {
    const api = { canShare: vi.fn(() => true), share: vi.fn().mockResolvedValue() };
    expect(await sharePaymentFile(file, api)).toBe('shared');
    expect(api.canShare).toHaveBeenCalledWith({ files: [file] });
    expect(api.share).toHaveBeenCalledWith({ files: [file] });
  });

  it('informa falta de suporte sem tentar compartilhar arquivos', async () => {
    expect(await sharePaymentFile(file, {})).toBe('unsupported');
    const api = { canShare: () => false, share: vi.fn() };
    expect(await sharePaymentFile(file, api)).toBe('unsupported');
    expect(api.share).not.toHaveBeenCalled();
  });

  it('trata cancelamento como uma escolha normal do usuário', async () => {
    const api = { canShare: () => true, share: vi.fn().mockRejectedValue(new DOMException('Cancelado', 'AbortError')) };
    expect(await sharePaymentFile(file, api)).toBe('cancelled');
  });

  it('propaga falhas para informar que o compartilhamento não foi concluído', async () => {
    const error = new DOMException('Bloqueado', 'NotAllowedError');
    const api = { canShare: () => true, share: vi.fn().mockRejectedValue(error) };
    await expect(sharePaymentFile(file, api)).rejects.toBe(error);
  });
});
