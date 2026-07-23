import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { checkPagesHealth } from '../../scripts/check-pages-health.mjs';
import { createContentSecurityPolicy } from '../../vite.config.js';

const projectFile = path => new URL(`../../${path}`, import.meta.url);

function response(body, url, contentType = 'text/plain') {
  return new Response(body, {
    headers: { 'content-type': contentType },
    status: 200
  });
}

describe('operação e entrega', () => {
  it('valida a página, o bundle e o manifesto sem consultar o Firebase', async () => {
    const calls = [];
    const html = [
      '<html><head>',
      '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">',
      '<link rel="manifest" href="./site.webmanifest">',
      '<script type="module" src="./assets/index.js"></script>',
      '<title>Dias Trabalhados</title>',
      '</head></html>'
    ].join('');
    const fetchImpl = async input => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('site.webmanifest')) {
        return response(JSON.stringify({ name: 'Dias Trabalhados' }), url, 'application/json');
      }
      if (url.endsWith('assets/index.js')) return response('x'.repeat(1_001), url);
      return response(html, url, 'text/html');
    };

    const result = await checkPagesHealth('https://example.test/app/', { fetchImpl });

    expect(result.status).toBe('healthy');
    expect(calls).toEqual([
      'https://example.test/app/',
      'https://example.test/app/assets/index.js',
      'https://example.test/app/site.webmanifest'
    ]);
    expect(calls.some(url => /firebase|googleapis/.test(url))).toBe(false);
  });

  it('gera CSP de produção sem endpoints locais e libera emuladores apenas em teste', () => {
    const production = createContentSecurityPolicy('production');
    const test = createContentSecurityPolicy('test');

    expect(production).toContain("default-src 'self'");
    expect(production).toContain('https://firebaseappcheck.googleapis.com');
    expect(production).toContain("object-src 'none'");
    expect(production).not.toContain('127.0.0.1');
    expect(test).toContain('http://127.0.0.1:9000');
    expect(test).toContain('http://127.0.0.1:9099');
  });

  it('mantém os assets de instalação relativos ao subdiretório do Pages', async () => {
    const html = await readFile(projectFile('index.html'), 'utf8');

    expect(html).not.toMatch(/\b(?:href|src)="\/(?:favicon|icons|site\.webmanifest)/);
    expect(html).toContain('name="referrer" content="strict-origin-when-cross-origin"');
  });
});
