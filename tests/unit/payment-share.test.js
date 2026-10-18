import { describe, expect, it, vi } from 'vitest';
import { sharePaymentFile } from '../../src/ui/payment-share.js';

describe('compartilhamento do resumo', () => {
  const file = new File(['report'], 'pagamento.png', { type: 'image/png' });

  it('envia o arquivo PNG para o compartilhamento nativo', async () => {
    const api = { canShare: vi.fn(() => true), share: vi.fn().mockResolvedValue() };
    expect(await sharePaymentFile(file, 'Resumo', api)).toBe('shared');
    expect(api.canShare).toHaveBeenCalledWith({ files: [file] });
    expect(api.share).toHaveBeenCalledWith({ files: [file], title: 'Resumo' });
  });

  it('oferece fallback quando o navegador não compartilha arquivos', async () => {
    expect(await sharePaymentFile(file, 'Resumo', {})).toBe('unsupported');
    const api = { canShare: () => false, share: vi.fn() };
    expect(await sharePaymentFile(file, 'Resumo', api)).toBe('unsupported');
    expect(api.share).not.toHaveBeenCalled();
  });

  it('compartilha imagem e mensagem com o valor a pagar no mesmo envio', async () => {
    const api = { canShare: () => true, share: vi.fn().mockResolvedValue() };
    const message = 'Outubro 2026\nValor a pagar: € 70,00';
    expect(await sharePaymentFile(file, 'Resumo', api, message)).toBe('shared');
    expect(api.share).toHaveBeenCalledWith({ files: [file], title: 'Resumo', text: message });
  });

  it('trata cancelamento como uma escolha normal do usuário', async () => {
    const api = { canShare: () => true, share: vi.fn().mockRejectedValue(new DOMException('Cancelado', 'AbortError')) };
    expect(await sharePaymentFile(file, 'Resumo', api)).toBe('cancelled');
  });

  it('propaga falhas para exibir as opções de download e WhatsApp', async () => {
    const error = new DOMException('Bloqueado', 'NotAllowedError');
    const api = { canShare: () => true, share: vi.fn().mockRejectedValue(error) };
    await expect(sharePaymentFile(file, 'Resumo', api)).rejects.toBe(error);
  });
});
