import { describe, expect, it } from 'vitest';
import {
  getBrowserTransportInfo,
  shouldUseFirebaseLongPolling
} from '../../src/firebase/transport.js';

describe('transporte móvel do Firebase Realtime Database', () => {
  it.each([
    ['Android', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile' }],
    ['iPhone', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15' }],
    ['iPadOS em modo desktop', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', maxTouchPoints: 5 }],
    ['Client Hints móvel', { userAgent: 'Mozilla/5.0', userAgentDataMobile: true }]
  ])('usa long polling no %s', (_device, browserInfo) => {
    expect(shouldUseFirebaseLongPolling(browserInfo)).toBe(true);
  });

  it('mantém WebSocket no navegador desktop', () => {
    expect(shouldUseFirebaseLongPolling({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      maxTouchPoints: 0
    })).toBe(false);
  });

  it('normaliza as informações opcionais do navegador', () => {
    expect(getBrowserTransportInfo({
      userAgent: 'mobile-test',
      userAgentData: { mobile: true },
      maxTouchPoints: 3
    })).toEqual({
      userAgent: 'mobile-test',
      userAgentDataMobile: true,
      maxTouchPoints: 3
    });
    expect(getBrowserTransportInfo(null)).toEqual({
      userAgent: '',
      userAgentDataMobile: false,
      maxTouchPoints: 0
    });
  });
});
